from datetime import date, timedelta
import json
import json
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app import ai as ai_module
from app import db as database
from app import main as main_module
from app.ai import _chat_groq, parse_json
from app.config import Settings, get_settings
from app.main import GeneratedItinerary, app
from app.matching import score_compatibility
from app.weather import enumerate_dates

@pytest.fixture
def test_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def api(test_db):
    database.init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


async def signup(api, name="Test Traveler"):
    return await api.post(
        "/auth/signup",
        json={
            "email": f"{uuid4().hex}@example.com",
            "password": "Travel-safe-123",
            "display_name": name,
        },
    )


@pytest.mark.anyio
async def test_health(api):
    assert (await api.get("/health")).json()["ok"] is True


@pytest.mark.anyio
async def test_flight_research_summarizes_external_sources(api, monkeypatch):
    queries = []
    messages_seen = []

    async def external_results(query, **_kwargs):
        queries.append(query)
        return [
            {
                "title": "Airline fare overview",
                "url": "https://example.com/fares",
                "content": "One-stop fares vary by date. Check baggage fees before booking.",
            },
            {
                "title": "Invalid source",
                "url": "javascript:alert(1)",
                "content": "This source should be excluded.",
            },
        ]

    async def summarize(messages, *_args, **_kwargs):
        messages_seen.extend(messages)
        return "The source notes that one-stop fares vary by date."

    monkeypatch.setattr(
        main_module,
        "get_settings",
        lambda: Settings(
            tavily_api_key="test-key",
            groq_api_key="test-key",
            ai_provider="groq",
        ),
    )
    monkeypatch.setattr(main_module, "tavily_search", external_results)
    monkeypatch.setattr(main_module, "chat", summarize)

    response = await api.post(
        "/flight-research",
        json={
            "origin": "Mumbai",
            "destination": "Delhi",
            "departure_date": "2026-11-10",
        },
    )

    assert response.status_code == 200
    assert "Mumbai to Delhi on 2026-11-10" in queries[0]
    assert response.json()["summary"] == "The source notes that one-stop fares vary by date."
    assert response.json()["sources"] == [
        {
            "title": "Airline fare overview",
            "url": "https://example.com/fares",
            "excerpt": "One-stop fares vary by date. Check baggage fees before booking.",
        }
    ]
    assert "Do not estimate or invent prices" in messages_seen[0]["content"]


@pytest.mark.anyio
async def test_flight_research_rejects_same_origin_and_destination(api):
    response = await api.post(
        "/flight-research",
        json={"origin": "Mumbai", "destination": "mumbai"},
    )

    assert response.status_code == 422


def test_cors_uses_configured_frontend_origins():
    cors = next(
        middleware
        for middleware in app.user_middleware
        if middleware.cls.__name__ == "CORSMiddleware"
    )

    assert cors.kwargs["allow_origins"] == get_settings().origins


def test_postgres_queries_translate_placeholders_and_nocase_collation():
    captured = {}

    class FakePostgresConnection:
        def execute(self, statement, parameters):
            captured["statement"] = statement
            captured["parameters"] = parameters
            return None

    database._execute(
        FakePostgresConnection(),
        "SELECT id FROM users WHERE email=? COLLATE NOCASE",
        ("traveler@example.com",),
    )

    assert captured == {
        "statement": "SELECT id FROM users WHERE email=%s",
        "parameters": ("traveler@example.com",),
    }


@pytest.mark.anyio
async def test_signed_out_is_rejected(api):
    for path in ("/me", "/matches", "/trips", "/trips/mine"):
        assert (await api.get(path)).status_code == 401


@pytest.mark.anyio
async def test_logout_clears_cookie_without_a_valid_session(api):
    response = await api.post("/auth/logout")

    assert response.status_code == 200
    assert "direct_session=" in response.headers["set-cookie"]
    assert "max-age=0" in response.headers["set-cookie"].lower()


def test_similar_traveler_ranks_higher():
    me = {
        "travel_style": "adventure",
        "pace": "packed",
        "budget_level": "moderate",
        "interests": ["hiking", "food"],
    }
    close = {
        "travel_style": "adventure",
        "pace": "balanced",
        "budget_level": "moderate",
        "interests": ["hiking"],
    }
    far = {
        "travel_style": "luxury",
        "pace": "relaxed",
        "budget_level": "luxury",
        "interests": ["shopping"],
    }
    assert score_compatibility(me, close)["score"] > score_compatibility(me, far)["score"]


def test_indian_budget_tiers_match_legacy_saved_preferences():
    result = score_compatibility(
        {"budget_level": "Moderate ($$)"},
        {"budget_level": "Moderate (₹₹)"},
    )

    assert result["breakdown"]["budget"] == 100


def test_dates_and_json():
    assert enumerate_dates("2026-10-01", "2026-10-03") == [
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
    ]
    assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_ai_provider_models_are_selected_server_side():
    gemini = Settings(ai_provider="gemini", gemini_api_key="gemini-test")
    assert gemini.selected_ai == (
        "gemini-test",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "gemini-3.6-flash",
    )
    groq = Settings(ai_provider="groq", groq_api_key="groq-test")
    assert groq.selected_ai == (
        "groq-test",
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-20b",
    )


@pytest.mark.anyio
async def test_groq_uses_prompt_json_without_provider_json_validation(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": '{"summary":"Plan"}'}}]}

    class FakeClient:
        def __init__(self, timeout):
            assert timeout == 120.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, _url, *, headers, json):
            captured.update(json)
            assert headers["Content-Type"] == "application/json"
            return FakeResponse()

    monkeypatch.setattr(ai_module.httpx, "AsyncClient", FakeClient)
    result = await _chat_groq(
        [
            {"role": "system", "content": "Return JSON only."},
            {"role": "user", "content": '{"summary":"","days":[]}'},
        ],
        0.6,
        Settings(groq_api_key="test-key"),
    )

    assert result == '{"summary":"Plan"}'
    assert "response_format" not in captured
    assert "JSON" in captured["messages"][0]["content"]


def test_generated_itinerary_requires_complete_valid_days():
    valid = {
        "summary": "A relaxed day.",
        "weather_overview": "Forecast unavailable.",
        "packing_notes": ["Comfortable shoes"],
        "days": [
            {
                "day_number": 1,
                "date": "2026-10-01",
                "title": "Explore town",
                "weather_note": "",
                "items": [
                    {
                        "time": "9:00 AM",
                        "title": "Breakfast",
                        "description": "Find a local cafe.",
                    }
                ],
            }
        ],
    }
    assert GeneratedItinerary.model_validate(valid).days[0].date == date(2026, 10, 1)
    valid["days"][0]["items"] = []
    with pytest.raises(ValidationError):
        GeneratedItinerary.model_validate(valid)


@pytest.mark.anyio
async def test_signup_me_and_login_use_http_only_cookie(api):
    email = f"{uuid4().hex}@example.com"
    signed_up = await api.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "Travel-safe-123",
            "display_name": "Test Traveler",
        },
    )
    assert signed_up.status_code == 201
    assert "access_token" not in signed_up.json()
    cookie = signed_up.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "direct_session=" in cookie
    assert (await api.get("/me")).status_code == 200

    logged_in = await api.post(
        "/auth/login",
        json={"email": email, "password": "Travel-safe-123"},
    )
    assert logged_in.status_code == 200
    assert (await api.get("/me")).status_code == 200
    assert (await api.post("/auth/logout")).status_code == 200
    assert (await api.get("/me")).status_code == 401


@pytest.mark.anyio
async def test_password_reset_uses_email_code_and_revokes_existing_sessions(
    api,
    monkeypatch,
):
    settings = Settings(
        smtp_username="sender@gmail.com",
        smtp_password="test-app-password",
        password_reset_secret="test-reset-secret",
    )
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    sent = []

    async def capture_email(_settings, recipient, code):
        sent.append((recipient, code))

    monkeypatch.setattr(main_module, "send_password_reset_email", capture_email)

    email = f"{uuid4().hex}@example.com"
    signed_up = await api.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "Travel-safe-123",
            "display_name": "Test Traveler",
        },
    )
    assert signed_up.status_code == 201

    requested = await api.post(
        "/auth/forgot-password",
        json={"email": email.upper()},
    )
    assert requested.status_code == 200
    assert requested.json()["message"].startswith("If an account exists")
    assert sent[0][0] == email
    assert len(sent[0][1]) == 6

    verified = await api.post(
        "/auth/verify-reset-code",
        json={"email": email, "code": sent[0][1]},
    )
    assert verified.status_code == 200
    reused_code = await api.post(
        "/auth/verify-reset-code",
        json={"email": email, "code": sent[0][1]},
    )
    assert reused_code.status_code == 400
    reset = await api.post(
        "/auth/reset-password",
        json={
            "email": email,
            "reset_token": verified.json()["reset_token"],
            "password": "New-travel-pass-456",
        },
    )
    assert reset.status_code == 200
    reused_token = await api.post(
        "/auth/reset-password",
        json={
            "email": email,
            "reset_token": verified.json()["reset_token"],
            "password": "Another-travel-pass-789",
        },
    )
    assert reused_token.status_code == 400
    assert (await api.get("/me")).status_code == 401

    logged_in = await api.post(
        "/auth/login",
        json={"email": email, "password": "New-travel-pass-456"},
    )
    assert logged_in.status_code == 200


@pytest.mark.anyio
async def test_password_reset_is_generic_and_limits_code_attempts(api, monkeypatch):
    settings = Settings(
        smtp_username="sender@gmail.com",
        smtp_password="test-app-password",
        password_reset_secret="test-reset-secret",
    )
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    sent = []

    async def capture_email(_settings, recipient, code):
        sent.append((recipient, code))

    monkeypatch.setattr(main_module, "send_password_reset_email", capture_email)

    unknown = await api.post(
        "/auth/forgot-password",
        json={"email": "unknown@example.com"},
    )
    assert unknown.status_code == 200
    assert sent == []

    email = f"{uuid4().hex}@example.com"
    assert (
        await api.post(
            "/auth/signup",
            json={
                "email": email,
                "password": "Travel-safe-123",
                "display_name": "Test Traveler",
            },
        )
    ).status_code == 201
    requested = await api.post("/auth/forgot-password", json={"email": email})
    assert requested.status_code == 200
    for _ in range(5):
        invalid = await api.post(
            "/auth/verify-reset-code",
            json={"email": email, "code": "000000" if sent[0][1] != "000000" else "000001"},
        )
        assert invalid.status_code == 400
    locked_out = await api.post(
        "/auth/verify-reset-code",
        json={"email": email, "code": sent[0][1]},
    )
    assert locked_out.status_code == 400


@pytest.mark.anyio
async def test_forwarded_https_sets_secure_cookie_only_for_loopback_proxy(test_db):
    database.init_db()
    transport = ASGITransport(app=app, client=("127.0.0.1", 12345))
    async with AsyncClient(transport=transport, base_url="http://testserver") as proxy_api:
        response = await proxy_api.post(
            "/auth/signup",
            headers={"x-forwarded-proto": "https"},
            json={
                "email": f"{uuid4().hex}@example.com",
                "password": "Travel-safe-123",
                "display_name": "Proxy Traveler",
            },
        )
    assert response.status_code == 201
    assert "; secure" in response.headers["set-cookie"].lower()

    transport = ASGITransport(app=app, client=("198.51.100.10", 12345))
    async with AsyncClient(transport=transport, base_url="http://testserver") as remote_api:
        response = await remote_api.post(
            "/auth/signup",
            headers={"x-forwarded-proto": "https"},
            json={
                "email": f"{uuid4().hex}@example.com",
                "password": "Travel-safe-123",
                "display_name": "Remote Traveler",
            },
        )
    assert response.status_code == 201
    assert "; secure" not in response.headers["set-cookie"].lower()


@pytest.mark.anyio
async def test_profile_rejects_server_managed_fields(api):
    assert (await signup(api)).status_code == 201
    response = await api.put(
        "/me",
        json={"profile": {"verified": True}, "preferences": {}},
    )
    assert response.status_code == 422
    profile = await api.get("/me")
    assert profile.json()["profile"]["verified"] is False


@pytest.mark.anyio
async def test_profile_preferences_round_trip_and_database_init_preserves_data(api):
    assert (await signup(api)).status_code == 201
    payload = {
        "profile": {
            "display_name": "Trail Friend",
            "home_city": "Pune",
            "home_state": "Maharashtra",
        },
        "preferences": {
            "travel_style": "Backpacker",
            "budget_level": "Moderate ($$)",
            "hotel_budget_per_night": 3500,
            "interests": ["Hiking", "Food and markets"],
            "activities": ["Day hikes"],
            "dream_destinations": ["Ladakh"],
        },
    }

    saved = await api.put("/me", json=payload)
    assert saved.status_code == 200
    assert saved.json() == {"ok": True}
    before_init = (await api.get("/me")).json()
    assert before_init["profile"]["home_city"] == "Pune"
    assert before_init["preferences"]["interests"] == ["Hiking", "Food and markets"]
    assert before_init["preferences"]["dream_destinations"] == ["Ladakh"]
    assert before_init["preferences"]["hotel_budget_per_night"] == 3500

    database.init_db()

    after_init = (await api.get("/me")).json()
    assert after_init == before_init


@pytest.mark.anyio
async def test_private_trip_tools_require_membership(test_db, monkeypatch):
    async def no_geocode(_destination):
        return None

    monkeypatch.setattr(main_module, "geocode", no_geocode)
    database.init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as owner_api, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as outsider_api:
        assert (await signup(owner_api, "Trip owner")).status_code == 201
        assert (await signup(outsider_api, "Other traveler")).status_code == 201
        trip_response = await owner_api.post(
            "/trips",
            json={
                "title": "Private weekend",
                "destination": "Portland",
                "start_date": (date.today() + timedelta(days=30)).isoformat(),
                "end_date": (date.today() + timedelta(days=32)).isoformat(),
                "visibility": "private",
            },
        )
        assert trip_response.status_code == 200
        trip_id = trip_response.json()["id"]
        assert (await outsider_api.get(f"/trips/{trip_id}/assistant")).status_code == 403
        assert (
            await outsider_api.post(
                f"/trips/{trip_id}/progress",
                json={"dayId": "not-a-day", "itemIndex": 0, "done": True},
            )
        ).status_code == 403


@pytest.mark.anyio
async def test_destination_ideas_use_custom_whole_trip_budget(api, monkeypatch):
    assert (await signup(api)).status_code == 201
    seen_messages = []

    search_queries = []

    async def live_sources(query, **_kwargs):
        search_queries.append(query)
        return [
            {
                "title": "Coorg travel guide",
                "url": "https://example.com/coorg",
                "content": "Hotel and local food information.",
            }
        ]

    async def destination_ideas(messages, *_args, **_kwargs):
        seen_messages.extend(messages)
        return json.dumps(
            {
                "recommendations": [
                    {
                        "destination": "Coorg",
                        "region": "Karnataka",
                        "why": "Coffee country and trails.",
                        "best_for": ["Hiking"],
                        "estimated_total_per_person": "₹10,000–₹12,000 estimate",
                        "budget_fit": "Fits the entered maximum.",
                        "timing_note": "Check seasonal rain.",
                        "sample_activities": ["Walks"],
                        "watch_out": "Confirm local prices.",
                        "cost_breakdown": {
                            "hotel_room_per_night_inr": {"min": 2500, "max": 4000},
                            "transport_per_person_inr": {"min": 3000, "max": 5000},
                            "food_per_day_per_person_inr": {"min": 800, "max": 1200},
                            "local_transport_per_day_per_person_inr": {"min": 200, "max": 500},
                            "activities_per_day_per_person_inr": {"min": 500, "max": 900},
                            "fees_per_person_inr": "unsupported, should not survive validation",
                            "assumptions": ["Two travelers share each room."],
                        },
                        "trip_plan": [
                            {
                                "day": 1,
                                "title": "Explore Madikeri",
                                "stay_area": "Madikeri",
                                "hotel_suggestion": "A centrally located guesthouse",
                                "estimated_room_rate_per_night": "Not found in sources; verify",
                                "nearby_food": [
                                    {
                                        "place_or_cuisine": "Local vegetarian meals",
                                        "estimated_meal_price_per_person": "Not found in sources; verify",
                                    }
                                ],
                                "activities": ["Visit local market"],
                                "estimated_daily_spend_per_person": "Estimate not available",
                            }
                        ],
                    }
                ]
            }
        )

    monkeypatch.setattr(main_module, "tavily_search", live_sources)
    monkeypatch.setattr(main_module, "chat", destination_ideas)
    response = await api.post(
        "/ideas",
        json={
            "interests": "Hiking and local food",
            "budget": "Moderate (₹₹)",
            "budget_amount": 12000,
            "timing": "5 days in November",
            "group_size": "4-6 people",
            "hotel_budget_per_night": 3500,
            "nights": 4,
            "travelers": 6,
            "room_share": 3,
            "preferred_destinations": ["Ladakh"],
        },
    )

    assert response.status_code == 200
    assert response.json()["budget_amount"] == 12000
    assert response.json()["recommendations"][0]["estimated_total_per_person"]
    assert response.json()["recommendations"][0]["trip_plan"][0]["nearby_food"]
    costs = response.json()["recommendations"][0]["cost_breakdown"]
    assert costs["hotel_room_per_night_inr"] == {"min": 2500, "max": 4000}
    assert costs["fees_per_person_inr"] is None
    assert costs["assumptions"] == ["Two travelers share each room."]
    assert response.json()["sources"] == [
        {"title": "Coorg travel guide", "url": "https://example.com/coorg"}
    ]
    prompt = "\n".join(message["content"] for message in seen_messages)
    assert "hotels room rates per night" in search_queries[0]
    assert "nearby restaurants food menu prices" in search_queries[0]
    assert "₹12,000 total per traveler for the whole trip" in prompt
    assert "hotel room price per room per night" in prompt
    assert "nearby researched food places" in prompt
    assert "Hiking and local food" in prompt
    assert "5 days in November" in prompt
    assert "4-6 people" in prompt
    assert "Ladakh" in prompt
    assert "₹3,500" in prompt
    assert "Travelers: 6" in prompt
    assert "Trip nights: 4" in prompt
    assert (
        await api.post(
            "/ideas",
            json={
                "interests": "Hiking",
                "budget": "Moderate",
                "budget_amount": 10_000_001,
                "timing": "5 days",
            },
        )
    ).status_code == 422
    invalid_sharing = await api.post(
        "/ideas",
        json={
            "interests": "Hiking",
            "budget": "Moderate",
            "timing": "5 days",
            "travelers": 2,
            "room_share": 3,
        },
    )
    assert invalid_sharing.status_code == 422


def test_database_init_adds_hotel_budget_column_to_existing_preferences(test_db):
    with database.connect() as db:
        db.execute(
            "CREATE TABLE travel_preferences (user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL)"
        )

    database.init_db()

    with database.connect() as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(travel_preferences)")}
    assert "hotel_budget_per_night" in columns


@pytest.mark.anyio
async def test_trip_date_range_cannot_exceed_itinerary_limit(api, monkeypatch):
    async def no_geocode(_destination):
        return None

    monkeypatch.setattr(main_module, "geocode", no_geocode)
    assert (await signup(api)).status_code == 201
    start = date.today() + timedelta(days=30)
    response = await api.post(
        "/trips",
        json={
            "title": "Long trip",
            "destination": "Portland",
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=31)).isoformat(),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Trips cannot be longer than 31 days."

    response = await api.post(
        "/trips",
        json={
            "title": "31-day trip",
            "destination": "Portland",
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=30)).isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["country"] == "India"


@pytest.mark.anyio
async def test_full_trip_reports_existing_membership_first(test_db, monkeypatch):
    async def no_geocode(_destination):
        return None

    monkeypatch.setattr(main_module, "geocode", no_geocode)
    database.init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as owner_api, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as member_api:
        assert (await signup(owner_api, "Trip owner")).status_code == 201
        trip_response = await owner_api.post(
            "/trips",
            json={
                "title": "Small group trip",
                "destination": "Portland",
                "start_date": (date.today() + timedelta(days=30)).isoformat(),
                "end_date": (date.today() + timedelta(days=31)).isoformat(),
                "max_travelers": 2,
            },
        )
        assert trip_response.status_code == 200
        trip_id = trip_response.json()["id"]

        assert (await signup(member_api, "Another traveler")).status_code == 201
        assert (await member_api.post(f"/trips/{trip_id}/join")).status_code == 200

        duplicate_join = await owner_api.post(f"/trips/{trip_id}/join")
        assert duplicate_join.status_code == 409


@pytest.mark.anyio
async def test_member_can_generate_schedule_and_track_progress(api, monkeypatch):
    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=1)

    async def no_geocode(_destination):
        return None

    calls = 0

    async def itinerary_response(_messages, _temperature=0.5, *, json_mode=False):
        nonlocal calls
        calls += 1
        assert json_mode is True
        if calls == 1:
            return "This response is not valid JSON."
        return json.dumps(
            {
                "summary": "A flexible two-day plan.",
                "weather_overview": "Weather data unavailable.",
                "packing_notes": ["Comfortable shoes"],
                "days": [
                    {
                        "day_number": index + 1,
                        "date": (start + timedelta(days=index)).isoformat(),
                        "title": f"Day {index + 1}",
                        "weather_note": "Weather data unavailable.",
                        "items": [
                            {
                                "time": "9:00 AM",
                                "title": "Explore locally",
                                "description": "Choose a public attraction.",
                                "location": "Portland",
                                "indoor": False,
                                "cost_estimate": "Check provider",
                            }
                        ],
                    }
                    for index in range(2)
                ],
            }
        )

    monkeypatch.setattr(main_module, "geocode", no_geocode)
    monkeypatch.setattr(main_module, "chat", itinerary_response)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    get_settings.cache_clear()
    assert (await signup(api)).status_code == 201
    response = await api.post(
        "/trips",
        json={
            "title": "Portland weekend",
            "destination": "Portland",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        },
    )
    assert response.status_code == 200
    trip_id = response.json()["id"]
    generated = await api.post(f"/trips/{trip_id}/itinerary")
    assert generated.status_code == 200
    assert calls == 2

    details = (await api.get(f"/trips/{trip_id}")).json()
    assert [day["day_date"] for day in details["days"]] == [
        start.isoformat(),
        end.isoformat(),
    ]
    day = details["days"][0]
    assert (
        await api.post(
            f"/trips/{trip_id}/progress",
            json={"dayId": day["id"], "itemIndex": 0, "done": True},
        )
    ).status_code == 200
    assert (
        await api.post(
            f"/trips/{trip_id}/progress",
            json={"dayId": day["id"], "itemIndex": -1, "done": True},
        )
    ).status_code == 422
