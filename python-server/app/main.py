from datetime import date, datetime, timedelta, timezone
from typing import Literal
from contextlib import asynccontextmanager
from email.message import EmailMessage
import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import smtplib
import ssl

from fastapi import Cookie, FastAPI, HTTPException, Header, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, model_validator
from .config import get_settings
from .db import (
    Db, DbDep, authenticate_user, create_password_reset, create_user,
    delete_session, init_db, invalidate_password_reset, reset_user_password,
    user_for_token, verify_password_reset_code, database_url,
)
from .matching import score_compatibility
from .weather import geocode, daily_weather, enumerate_dates, weather_label
from .ai import chat, parse_json
from .tavily import search as tavily_search

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="DIRECT API", version="2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins,
                   allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


def now():
    return datetime.now(timezone.utc).isoformat()


def request_is_secure(request: Request) -> bool:
    if get_settings().secure_cookies:
        return True
    if request.url.scheme == "https":
        return True
    client_host = request.client.host if request.client else ""
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    try:
        return forwarded_proto == "https" and ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        return False


@app.get("/health")
async def health():
    s = get_settings()
    return {
        "ok": True,
        "database": "postgresql" if database_url() else "sqlite",
        "ai_configured": bool(s.gemini_api_key or s.groq_api_key),
        "ai_provider": s.selected_provider if (s.gemini_api_key or s.groq_api_key) else None,
        "providers": {"gemini": bool(s.gemini_api_key), "groq": bool(s.groq_api_key),
                      "tavily": bool(s.tavily_api_key), "openweather": bool(s.openweather_api_key)},
    }


class SignUpIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class SignInIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class VerifyResetCodeIn(ForgotPasswordIn):
    code: str = Field(pattern=r"^\d{6}$")


class ResetPasswordIn(ForgotPasswordIn):
    reset_token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=8, max_length=128)


def _password_reset_code_hash(email: str, code: str, secret: str) -> str:
    message = f"{email}:{code}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _password_reset_email(settings, recipient: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Your DIRECT password reset code"
    message["From"] = settings.smtp_from_email or settings.smtp_username
    message["To"] = recipient
    message.set_content(
        f"Your DIRECT password reset code is {code}.\n\n"
        "It expires in 10 minutes. If you did not request this code, "
        "you can ignore this email."
    )
    context = ssl.create_default_context()
    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=15,
    ) as server:
        server.starttls(context=context)
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


async def send_password_reset_email(settings, recipient: str, code: str) -> None:
    await asyncio.to_thread(_password_reset_email, settings, recipient, code)


def auth_result(user_id: str):
    return {"user": {"id": user_id}}


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        key="direct_session",
        value=token,
        max_age=14 * 24 * 60 * 60,
        httponly=True,
        secure=request_is_secure(request),
        samesite="lax",
        path="/",
    )


@app.post("/auth/signup", status_code=201)
async def signup(body: SignUpIn, request: Request, response: Response):
    if "@" not in body.email or "." not in body.email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(422, "Display name cannot be blank.")
    user_id, token = create_user(body.email.strip().lower(), body.password, display_name, now())
    set_session_cookie(response, request, token)
    return auth_result(user_id)


@app.post("/auth/login")
async def login(body: SignInIn, request: Request, response: Response):
    if "@" not in body.email or "." not in body.email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    user_id, token = authenticate_user(body.email.strip().lower(), body.password, now())
    set_session_cookie(response, request, token)
    return auth_result(user_id)


@app.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    settings = get_settings()
    if not (
        settings.smtp_host
        and settings.smtp_username
        and settings.smtp_password
        and settings.password_reset_secret
    ):
        raise HTTPException(
            503,
            "Password reset email is not configured. Contact the site administrator.",
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _password_reset_code_hash(
        email,
        code,
        settings.password_reset_secret,
    )
    created_at = now()
    expires_at_iso = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    if create_password_reset(email, code_hash, created_at, expires_at_iso):
        try:
            await send_password_reset_email(settings, email, code)
        except (OSError, smtplib.SMTPException) as exc:
            invalidate_password_reset(email, code_hash)
            logger.error(
                "Password reset email delivery failed: %s",
                type(exc).__name__,
            )
            raise HTTPException(
                503,
                "Unable to send a password reset email right now. Please try again later.",
            ) from exc
    return {
        "message": "If an account exists for this email, a verification code has been sent."
    }


@app.post("/auth/verify-reset-code")
async def verify_reset_code(body: VerifyResetCodeIn):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    settings = get_settings()
    if not settings.password_reset_secret:
        raise HTTPException(503, "Password reset is not configured.")
    reset_token = secrets.token_urlsafe(32)
    valid = verify_password_reset_code(
        email,
        _password_reset_code_hash(
            email,
            body.code,
            settings.password_reset_secret,
        ),
        now(),
        reset_token,
        (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    )
    if not valid:
        raise HTTPException(400, "The verification code is invalid or expired.")
    return {"reset_token": reset_token}


@app.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "Enter a valid email address.")
    if not reset_user_password(email, body.reset_token, body.password, now()):
        raise HTTPException(400, "The reset request is invalid or expired.")
    return {"ok": True}


@app.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    authorization: str = Header(default=""),
    direct_session: str = Cookie(default=""),
):
    scheme, _, bearer_token = authorization.partition(" ")
    token = direct_session or (bearer_token if scheme.lower() == "bearer" else "")
    delete_session(token)
    response.delete_cookie(
        key="direct_session",
        path="/",
        httponly=True,
        secure=request_is_secure(request),
        samesite="lax",
    )
    return {"ok": True}


# ---------------------------------------------------------------- profile
class ProfileFields(BaseModel):
    model_config = {"extra": "forbid"}

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    home_city: str | None = Field(default=None, max_length=100)
    home_state: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=2000)
    age_range: str | None = Field(default=None, max_length=40)
    gender: str | None = Field(default=None, max_length=80)


class PreferenceFields(BaseModel):
    model_config = {"extra": "forbid"}

    travel_style: str | None = Field(default=None, max_length=80)
    pace: str | None = Field(default=None, max_length=80)
    budget_level: str | None = Field(default=None, max_length=80)
    group_size: str | None = Field(default=None, max_length=80)
    gender_composition: str | None = Field(default=None, max_length=80)
    accommodation: str | None = Field(default=None, max_length=80)
    food_preference: str | None = Field(default=None, max_length=80)
    climate_preference: str | None = Field(default=None, max_length=80)
    hotel_budget_per_night: int | None = Field(default=None, ge=1, le=1_000_000)
    interests: list[str] = Field(default_factory=list, max_length=40)
    activities: list[str] = Field(default_factory=list, max_length=40)
    smoking: str | None = Field(default=None, max_length=80)
    drinking: str | None = Field(default=None, max_length=80)
    early_riser: bool | None = None
    dream_destinations: list[str] = Field(default_factory=list, max_length=40)


class ProfileIn(BaseModel):
    model_config = {"extra": "forbid"}
    profile: ProfileFields
    preferences: PreferenceFields


@app.get("/me")
async def get_me(db: Db = DbDep):
    return {"profile": await db.one("profiles", id=f"eq.{db.user_id}"),
            "preferences": await db.one("travel_preferences", user_id=f"eq.{db.user_id}"),
            "userId": db.user_id}

@app.put("/me")
async def save_me(body: ProfileIn, db: Db = DbDep):
    profile = body.profile.model_dump(exclude_none=True)

    existing_profile = await db.one(
        "profiles",
        id=f"eq.{db.user_id}",
    )

    profile_data = {
        **profile,
        "id": db.user_id,
        "created_at": existing_profile["created_at"] if existing_profile else now(),
        "updated_at": now(),
    }

    await db.insert(
        "profiles",
        profile_data,
        upsert_on="id",
    )

    preferences = body.preferences.model_dump()

    await db.insert(
        "travel_preferences",
        {
            **preferences,
            "user_id": db.user_id,
            "updated_at": now(),
        },
        upsert_on="user_id",
    )

    return {"ok": True}
# ---------------------------------------------------------------- matching
@app.get("/matches")
async def matches(db: Db = DbDep):
    mine = await db.one("travel_preferences", user_id=f"eq.{db.user_id}")
    if not mine:
        return {"ready": False, "matches": []}
    others = await db.select("travel_preferences", user_id=f"neq.{db.user_id}", limit=300)
    ids = [o["user_id"] for o in others]
    profiles = await db.select("profiles", id=f"in.({','.join(ids)})") if ids else []
    conns = await db.select("connection_requests", **{"or": f"(from_user.eq.{db.user_id},to_user.eq.{db.user_id})"})
    by_id = {p["id"]: p for p in profiles}
    dimensions = {
        "style": "Travel style", "pace": "Trip pace", "budget": "Budget",
        "groupSize": "Group size", "accommodation": "Stays", "climate": "Climate",
        "interests": "Interests", "activities": "Activities", "habits": "Daily habits",
    }
    out = []
    for o in others:
        if o["user_id"] not in by_id:
            continue
        c = next((c for c in conns if o["user_id"] in (c["from_user"], c["to_user"])), None)
        scored = score_compatibility(mine, o)
        out.append({"profile": {k: by_id[o["user_id"]].get(k) for k in
                                ("id", "display_name", "home_city", "home_state", "bio")},
                    "preferences": o, "score": scored["score"],
                    "breakdown": [{"label": dimensions[k], "score": value,
                                   "detail": f"{value}%"} for k, value in scored["breakdown"].items()],
                    "sharedInterests": scored["sharedInterests"],
                    "sharedDestinations": scored["sharedDestinations"],
                    "connection": {"id": c["id"], "status": c["status"], "outgoing": c["from_user"] == db.user_id} if c else None})
    out.sort(key=lambda m: -m["score"])
    return {"ready": True, "matches": out}


class ConnIn(BaseModel):
    toUser: str = Field(min_length=1, max_length=64)
    message: str | None = Field(default=None, max_length=1000)


@app.post("/connections")
async def send_connection(body: ConnIn, db: Db = DbDep):
    if body.toUser == db.user_id:
        raise HTTPException(400, "You cannot send a connection request to yourself.")
    if not await db.one("profiles", id=f"eq.{body.toUser}"):
        raise HTTPException(404, "Traveler not found.")
    await db.insert("connection_requests", {"from_user": db.user_id, "to_user": body.toUser, "message": body.message})
    return {"ok": True}


class RespondIn(BaseModel):
    status: Literal["accepted", "declined"]


@app.post("/connections/{cid}/respond")
async def respond(cid: str, body: RespondIn, db: Db = DbDep):
    request = await db.one("connection_requests", id=f"eq.{cid}")
    if not request:
        raise HTTPException(404, "Connection request not found.")
    if request["to_user"] != db.user_id:
        raise HTTPException(403, "Only the recipient can respond to this request.")
    await db.update("connection_requests", {"status": body.status}, id=f"eq.{cid}")
    return {"ok": True}


@app.get("/connections")
async def list_connections(db: Db = DbDep):
    rows = await db.select("connection_requests", order="created_at.desc",
                           **{"or": f"(from_user.eq.{db.user_id},to_user.eq.{db.user_id})"})
    ids = {x for r in rows for x in (r["from_user"], r["to_user"]) if x != db.user_id}
    profiles = {p["id"]: p for p in (await db.select("profiles", id=f"in.({','.join(ids)})") if ids else [])}
    return [{**r, "outgoing": r["from_user"] == db.user_id,
             "other": ({k: profile.get(k) for k in ("id", "display_name", "home_city", "home_state")}
                       if (profile := profiles.get(
                           r["to_user"] if r["from_user"] == db.user_id else r["from_user"]
                       )) else None)} for r in rows]


# ---------------------------------------------------------------- trips
class TripIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget_level: str | None = None
    travel_style: str | None = None
    max_travelers: int = Field(default=6, ge=2, le=20)
    description: str | None = Field(default=None, max_length=2000)
    visibility: Literal["public", "private"] = "public"


class GeneratedItem(BaseModel):
    time: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1000)
    location: str = Field(default="", max_length=200)
    indoor: bool = False
    cost_estimate: str = Field(default="", max_length=120)


class GeneratedDay(BaseModel):
    day_number: int = Field(ge=1)
    date: date
    title: str = Field(min_length=1, max_length=160)
    weather_note: str = Field(default="", max_length=500)
    items: list[GeneratedItem] = Field(min_length=1, max_length=10)


class GeneratedItinerary(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    weather_overview: str = Field(default="", max_length=2000)
    packing_notes: list[str] = Field(default_factory=list, max_length=30)
    days: list[GeneratedDay] = Field(min_length=1, max_length=31)


async def _with_counts(db: Db, trips: list[dict]):
    ids = [t["id"] for t in trips]
    members = await db.select("trip_members", trip_id=f"in.({','.join(ids)})") if ids else []
    return [{**t, "memberCount": sum(m["trip_id"] == t["id"] for m in members),
             "isMember": any(m["trip_id"] == t["id"] and m["user_id"] == db.user_id for m in members),
             "isOwner": t["owner_id"] == db.user_id} for t in trips]


@app.get("/trips")
async def list_trips(search: str | None = Query(default=None, max_length=100), db: Db = DbDep):
    params = {"order": "start_date.asc", "limit": 60}
    if search:
        params["destination"] = f"ilike.*{search}*"
    trips = await db.select("trips", **params)
    memberships = await db.select("trip_members", user_id=f"eq.{db.user_id}")
    member_ids = {m["trip_id"] for m in memberships}
    visible = [t for t in trips if t["visibility"] == "public" or
               t["owner_id"] == db.user_id or t["id"] in member_ids]
    return await _with_counts(db, visible)


@app.get("/trips/mine")
async def my_trips(db: Db = DbDep):
    ids = [m["trip_id"] for m in await db.select("trip_members", select="trip_id", user_id=f"eq.{db.user_id}")]
    if not ids:
        return []
    return await _with_counts(db, await db.select("trips", id=f"in.({','.join(ids)})", order="start_date.asc"))


@app.post("/trips")
async def create_trip(body: TripIn, db: Db = DbDep):
    if body.end_date < body.start_date:
        raise HTTPException(400, "The end date cannot be before the start date.")
    if (body.end_date - body.start_date).days >= 31:
        raise HTTPException(400, "Trips cannot be longer than 31 days.")
    place = await geocode(body.destination)
    row = {**body.model_dump(), "country": "India"}
    if place:
        row.update(destination=", ".join(x for x in (place.get("name"), place.get("admin1")) if x),
                   region=place.get("admin1"),
                   country="India" if place.get("country") == "IN" else place.get("country"),
                   latitude=place.get("latitude"), longitude=place.get("longitude"))
    trip = (await db.insert("trips", {**row, "owner_id": db.user_id}))[0]
    await db.insert("trip_members", {"trip_id": trip["id"], "user_id": db.user_id, "role": "organizer"})
    return trip


async def require_trip_member(tid: str, db: Db) -> dict:
    trip = await db.one("trips", id=f"eq.{tid}")
    if not trip:
        raise HTTPException(404, "Trip not found.")
    member = await db.one("trip_members", trip_id=f"eq.{tid}", user_id=f"eq.{db.user_id}")
    if not member:
        raise HTTPException(403, "Join this trip to access its group tools.")
    return trip


@app.post("/trips/{tid}/join")
async def join_trip(tid: str, db: Db = DbDep):
    trip = await db.one("trips", id=f"eq.{tid}")
    if not trip:
        raise HTTPException(404, "Trip not found.")
    if trip["visibility"] != "public":
        raise HTTPException(403, "This trip is private.")
    members = await db.select("trip_members", trip_id=f"eq.{tid}")
    if any(member["user_id"] == db.user_id for member in members):
        raise HTTPException(409, "You are already a member of this trip.")
    if len(members) >= trip["max_travelers"]:
        raise HTTPException(400, "This group is already full.")
    await db.insert("trip_members", {"trip_id": tid, "user_id": db.user_id})
    return {"ok": True}


@app.post("/trips/{tid}/leave")
async def leave_trip(tid: str, db: Db = DbDep):
    await db.delete("trip_members", trip_id=f"eq.{tid}", user_id=f"eq.{db.user_id}")
    return {"ok": True}


class StatusIn(BaseModel):
    status: str


@app.post("/trips/{tid}/status")
async def trip_status(tid: str, body: StatusIn, db: Db = DbDep):
    trip = await db.one("trips", id=f"eq.{tid}")
    if not trip:
        raise HTTPException(404, "Trip not found.")
    if trip["owner_id"] != db.user_id:
        raise HTTPException(403, "Only the trip organizer can change its status.")
    if body.status not in {"planning", "confirmed", "in_progress", "completed", "cancelled"}:
        raise HTTPException(422, "Invalid trip status.")
    await db.update("trips", {"status": body.status}, id=f"eq.{tid}")
    return {"ok": True}


@app.get("/trips/{tid}")
async def get_trip(tid: str, db: Db = DbDep):
    trip = await db.one("trips", id=f"eq.{tid}")
    if not trip:
        raise HTTPException(404, "Trip not found.")
    members = await db.select("trip_members", trip_id=f"eq.{tid}")
    ids = [m["user_id"] for m in members]
    if trip["visibility"] != "public" and trip["owner_id"] != db.user_id and db.user_id not in ids:
        raise HTTPException(404, "Trip not found.")
    profiles = {p["id"]: p for p in (await db.select("profiles", id=f"in.({','.join(ids)})") if ids else [])}
    it = await db.one("itineraries", trip_id=f"eq.{tid}", order="created_at.desc")
    days = await db.select("itinerary_days", itinerary_id=f"eq.{it['id']}", order="day_number.asc") if it else []
    return {"trip": trip, "isMember": db.user_id in ids, "isOwner": trip["owner_id"] == db.user_id,
            "members": [{**m, "profile": profiles.get(m["user_id"])} for m in members],
            "itinerary": it, "days": days,
            "progress": await db.select("trip_progress", trip_id=f"eq.{tid}"), "userId": db.user_id}


# ---------------------------------------------------------------- itinerary
@app.post("/trips/{tid}/itinerary")
async def generate_itinerary(tid: str, db: Db = DbDep):
    trip = await db.one("trips", id=f"eq.{tid}")
    if not trip:
        raise HTTPException(404, "Trip not found.")
    ids = [m["user_id"] for m in await db.select("trip_members", select="user_id", trip_id=f"eq.{tid}")]
    if db.user_id not in ids:
        raise HTTPException(403, "Join this group before generating its plan.")
    prefs = await db.select("travel_preferences", user_id=f"in.({','.join(ids)})")
    lat, lon = trip.get("latitude"), trip.get("longitude")
    if lat is None or lon is None:
        place = await geocode(trip["destination"])
        if place:
            lat = place.get("latitude")
            lon = place.get("longitude")
            await db.update("trips", {"latitude": lat, "longitude": lon}, id=f"eq.{tid}")
    dates = enumerate_dates(trip["start_date"], trip["end_date"])
    weather = await daily_weather(lat, lon, trip["start_date"], trip["end_date"]) if lat is not None else \
        [{"date": d, "code": None, "high": None, "low": None, "precipitationChance": None, "source": "unavailable"} for d in dates]
    wl = "\n".join(f"{w['date']}: {weather_label(w['code'])}, high {w['high']}F / low {w['low']}F, rain {w['precipitationChance']}% ({w['source']})" for w in weather)
    gl = "\n".join(f"Traveler {i+1}: style {p.get('travel_style')}; pace {p.get('pace')}; budget {p.get('budget_level')}; interests {', '.join(p.get('interests') or [])}; activities {', '.join(p.get('activities') or [])}" for i, p in enumerate(prefs))
    live_sources = await tavily_search(f"best things to do in {trip['destination']} {trip.get('region') or ''} official visitor attractions outdoor indoor", max_results=6)
    source_text = "\n".join(f"- {x['title']}: {x['content'][:500]} ({x['url']})" for x in live_sources) or "No live web sources were available; use only broadly known places and state uncertainty."
    if weather:
        await db.insert("weather_snapshots", [{"trip_id": tid, "forecast_date": w["date"], "source": "openweather", "payload": w, "created_at": now()} for w in weather], upsert_on="trip_id,forecast_date,source")
    if live_sources:
        await db.insert("web_sources", [{"trip_id": tid, "query": f"best things to do in {trip['destination']}", "title": x["title"], "url": x["url"], "content": x["content"], "created_at": now()} for x in live_sources])
    messages = [
        {"role": "system", "content": "You are a realistic India-focused group travel planner. Plan only plausible places supported by the live research context when available. Never invent bookings, exact prices, opening hours, availability or permits. Use the OpenWeather forecast supplied by the backend. Move outdoor plans indoors when weather is poor. Express cost estimates in INR (₹), clearly label them as estimates, and do not give a price unless supported by the supplied research. Reply with JSON only."},
        {"role": "user", "content": f"""Destination: {trip['destination']}, {trip.get('country')}
Dates: {trip['start_date']} to {trip['end_date']} ({len(dates)} days). Group size {len(ids)}. Budget {trip.get('budget_level')}. Style {trip.get('travel_style')}. Notes: {trip.get('description')}
Travelers:\n{gl}\nWeather from OpenWeather (temperatures in °C):\n{wl}\nLive Tavily research:\n{source_text}
Return JSON: {{"summary":"","weather_overview":"","packing_notes":[""],"days":[{{"day_number":1,"date":"YYYY-MM-DD","title":"","weather_note":"","items":[{{"time":"8:30 AM","title":"","description":"","location":"","indoor":false,"cost_estimate":""}}]}}]}}
The days must use exactly these dates, in this order: {json.dumps(dates)}. One entry per date, 4-6 items per day."""},
    ]
    plan: GeneratedItinerary | None = None
    correction = ""
    for attempt in range(2):
        raw = await chat(messages, 0.6, json_mode=True)
        try:
            plan = GeneratedItinerary.model_validate(parse_json(raw))
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            correction = exc.detail
        except ValidationError as exc:
            issues = exc.errors(include_url=False)
            correction = "; ".join(
                f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
                for issue in issues[:5]
            )
        else:
            actual_dates = [day.date.isoformat() for day in plan.days]
            if actual_dates == dates and all(
                day.day_number == index + 1 for index, day in enumerate(plan.days)
            ):
                break
            correction = f"Expected these dates in order: {json.dumps(dates)}."

        plan = None
        if attempt == 1:
            raise HTTPException(
                502,
                "The AI provider could not return a valid itinerary after one retry.",
            )
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Your previous response was invalid: {correction}. "
                    f"Return corrected JSON only. Include exactly one day for each "
                    f"date, in this order: {json.dumps(dates)}. Each day_number "
                    "must start at 1 and increase by one."
                ),
            }
        )

    if plan is None:
        raise HTTPException(502, "The AI provider could not return a valid itinerary.")
    await db.delete("itineraries", trip_id=f"eq.{tid}")
    it = (await db.insert("itineraries", {"trip_id": tid, "summary": plan.summary,
          "weather_overview": plan.weather_overview, "packing_notes": plan.packing_notes,
          "model": get_settings().selected_ai[2]}))[0]
    rows = []
    for i, d in enumerate(plan.days):
        w = weather[i]
        rows.append({"itinerary_id": it["id"], "trip_id": tid, "day_number": d.day_number,
                     "day_date": d.date.isoformat(), "title": d.title,
                     "weather_summary": d.weather_note or weather_label(w.get("code")),
                     "weather_temp_high": w.get("high"), "weather_temp_low": w.get("low"),
                     "weather_code": w.get("code"),
                     "items": [item.model_dump() for item in d.items]})
    if rows:
        await db.insert("itinerary_days", rows)
    return {"ok": True, "itineraryId": it["id"]}


class ProgressIn(BaseModel):
    dayId: str = Field(min_length=1, max_length=64)
    itemIndex: int = Field(ge=0, le=100)
    done: bool


@app.post("/trips/{tid}/progress")
async def toggle_progress(tid: str, body: ProgressIn, db: Db = DbDep):
    await require_trip_member(tid, db)
    day = await db.one("itinerary_days", id=f"eq.{body.dayId}", trip_id=f"eq.{tid}")
    if not day:
        raise HTTPException(404, "Itinerary day not found.")
    if body.itemIndex >= len(day["items"]):
        raise HTTPException(422, "That itinerary item does not exist.")
    if not body.done:
        await db.delete("trip_progress", trip_id=f"eq.{tid}", day_id=f"eq.{body.dayId}",
                        user_id=f"eq.{db.user_id}", item_index=f"eq.{body.itemIndex}")
    else:
        await db.insert("trip_progress", {"trip_id": tid, "day_id": body.dayId, "user_id": db.user_id,
                        "item_index": body.itemIndex, "done": True, "updated_at": now()},
                        upsert_on="day_id,user_id,item_index")
    return {"ok": True}


# ---------------------------------------------------------------- assistant
class AskIn(BaseModel):
    message: str


@app.get("/trips/{tid}/assistant")
async def thread(tid: str, db: Db = DbDep):
    await require_trip_member(tid, db)
    return await db.select("assistant_messages", trip_id=f"eq.{tid}", user_id=f"eq.{db.user_id}", order="created_at.asc", limit=100)


@app.post("/trips/{tid}/assistant")
async def ask(tid: str, body: AskIn, db: Db = DbDep):
    q = body.message.strip()[:2000]
    if not q:
        raise HTTPException(400, "Type a question first.")
    trip = await require_trip_member(tid, db)
    it = await db.one("itineraries", trip_id=f"eq.{tid}", order="created_at.desc")
    days = await db.select("itinerary_days", itinerary_id=f"eq.{it['id']}", order="day_number.asc") if it else []
    history = await db.select("assistant_messages", select="role,content", trip_id=f"eq.{tid}", user_id=f"eq.{db.user_id}", order="created_at.asc", limit=20)
    ctx = "\n".join(f"Day {d['day_number']} ({d.get('day_date')}) {d['title']}: " + "; ".join(f"{i.get('time')} {i.get('title')}" for i in d.get('items') or []) for d in days)
    live = await tavily_search(f"{trip['destination']} travel {q}", max_results=4)
    live_context = "\n".join(f"- {x['title']}: {x['content'][:700]} ({x['url']})" for x in live) or "No live search results."
    answer = await chat([
        {"role": "system", "content": f"You are the DIRECT Travel Companion. Answer under 220 words. Use the trip context and live web research. Clearly distinguish live facts from suggestions. If unsure about hours, prices, permits, road conditions or safety, tell the traveler to verify official sources. Never claim to make bookings.\nTrip: {trip['title']} to {trip['destination']}, {trip['start_date']} to {trip['end_date']}. Budget {trip.get('budget_level')}.\nItinerary:\n{ctx or 'Not generated yet.'}\nLive Tavily research:\n{live_context}"},
        *[{"role": "assistant" if h["role"] == "assistant" else "user", "content": h["content"]} for h in history],
        {"role": "user", "content": q}], 0.4, provider="groq")
    await db.insert("assistant_messages", [{"trip_id": tid, "user_id": db.user_id, "role": "user", "content": q},
                                           {"trip_id": tid, "user_id": db.user_id, "role": "assistant", "content": answer}])
    return {"answer": answer}


# ---------------------------------------------------------------- ideas
class IdeasIn(BaseModel):
    interests: str = Field(min_length=3, max_length=600)
    budget: str = Field(min_length=1, max_length=80)
    timing: str = Field(min_length=2, max_length=120)
    group_size: str | None = None
    budget_amount: int | None = Field(default=None, ge=1, le=10_000_000)
    hotel_budget_per_night: int | None = Field(default=None, ge=1, le=1_000_000)
    nights: int = Field(default=4, ge=1, le=30)
    travelers: int = Field(default=4, ge=1, le=20)
    room_share: int = Field(default=2, ge=1, le=8)
    preferred_destinations: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def room_sharing_fits_group(self):
        if self.room_share > self.travelers:
            raise ValueError("People per room cannot exceed the traveler count.")
        return self


class FlightResearchIn(BaseModel):
    origin: str = Field(min_length=2, max_length=100)
    destination: str = Field(min_length=2, max_length=100)
    departure_date: date | None = None


@app.post("/flight-research")
async def flight_research(body: FlightResearchIn):
    origin = body.origin.strip()
    destination = body.destination.strip()
    if len(origin) < 2 or len(destination) < 2:
        raise HTTPException(422, "Enter a departure city and destination.")
    if origin.casefold() == destination.casefold():
        raise HTTPException(422, "Departure and destination must be different.")

    settings = get_settings()
    if not settings.tavily_api_key:
        raise HTTPException(503, "External flight research is not configured.")
    if not settings.gemini_api_key and not settings.groq_api_key:
        raise HTTPException(503, "Flight research summaries are not configured.")

    date_context = f" on {body.departure_date.isoformat()}" if body.departure_date else ""
    query = (
        f"flight prices and fares from {origin} to {destination}{date_context}; "
        "airline fares, direct and connecting routes, baggage, booking fees, "
        "fare comparison, official airlines and travel providers"
    )
    results = await tavily_search(query, max_results=8)
    sources = [
        {
            "title": source["title"][:200],
            "url": source["url"],
            "excerpt": source.get("content", "")[:600],
        }
        for source in results
        if source.get("title")
        and source.get("url", "").startswith(("http://", "https://"))
    ]
    if not sources:
        return {
            "summary": (
                f"No external flight results were found for {origin} to {destination}"
                f"{date_context}. Try another date or search again later."
            ),
            "sources": [],
        }

    source_context = "\n".join(
        f"- {source['title']}: {source['excerpt']} ({source['url']})"
        for source in sources
    )
    summary = await chat(
        [
            {
                "role": "system",
                "content": (
                    "Analyze the supplied external flight-search results for a traveler. "
                    "Summarize route options, any clearly reported fare ranges, fare "
                    "conditions or comparison tips in at most 160 words. Use only facts "
                    "explicitly present in the sources. Do not estimate or invent prices, "
                    "schedules, airlines, availability or booking terms. Clearly say when "
                    "a price is not shown or sources disagree. The research is not a live "
                    "fare quote and the traveler must verify final prices with providers."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Route: {origin} to {destination}{date_context}\n"
                    f"External research results:\n{source_context}"
                ),
            },
        ],
        0.2,
    )
    return {"summary": summary, "sources": sources}


def _estimate_range(value: object) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    minimum, maximum = value.get("min"), value.get("max")
    if (
        type(minimum) is not int
        or type(maximum) is not int
        or minimum < 0
        or maximum < minimum
        or maximum > 100_000_000
    ):
        return None
    return {"min": minimum, "max": maximum}


def _validated_cost_breakdown(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    keys = (
        "hotel_room_per_night_inr",
        "transport_per_person_inr",
        "food_per_day_per_person_inr",
        "local_transport_per_day_per_person_inr",
        "activities_per_day_per_person_inr",
        "fees_per_person_inr",
    )
    assumptions = value.get("assumptions", [])
    if not isinstance(assumptions, list):
        assumptions = []
    return {
        **{key: _estimate_range(value.get(key)) for key in keys},
        "assumptions": [
            item[:240] for item in assumptions if isinstance(item, str)
        ][:8],
    }


@app.post("/ideas")
async def ideas(body: IdeasIn, db: Db = DbDep):
    budget_context = (
        f"with a maximum of ₹{body.budget_amount:,} per traveler"
        if body.budget_amount is not None
        else f"with a {body.budget} budget"
    )
    live = await tavily_search(
        f"India destinations {body.interests} {body.timing} {budget_context} "
        f"preferred destinations {', '.join(body.preferred_destinations)} "
        f"group size {body.travelers} travelers, {body.nights} nights, hotel room target "
        f"₹{body.hotel_budget_per_night or 'unspecified'} per night, "
        f"room sharing {body.room_share} travel itinerary hotels room rates per night "
        "best places to visit "
        "famous attractions landmarks local favorites nearby restaurants food menu prices",
        max_results=8,
    )
    live_context = "\n".join(f"- {x['title']}: {x['content'][:500]} ({x['url']})" for x in live) or "No live web sources available."
    budget_amount = (
        f"₹{body.budget_amount:,} total per traveler for the whole trip"
        if body.budget_amount is not None
        else "not specified; use the selected budget level"
    )
    raw = await chat([
        {"role": "system", "content": "You are an India-focused group-travel advisor. Recommend exactly 4 destinations in India grounded in the live research context and all traveler inputs. Prioritize the traveler's saved dream destinations when they are within India and fit the other constraints. If a maximum total budget per traveler is provided, prioritize destinations and activities likely to fit within it; do not recommend options that clearly exceed it. For each destination, include 3 to 5 specific, well-known places to visit, supported by live research when available. Give each place a concise category and a useful reason to visit. Do not present generic activities as named places or invent obscure attractions; if evidence is limited, use only broadly known places and be transparent. Create a day-by-day plan for exactly the requested number of nights (one more calendar day than nights). For each day, suggest a stay area, an approximate hotel room price per room per night in INR, nearby researched food places or cuisine options with typical meal prices per person, activities, and an approximate daily spend per person. Mark every price as an estimate, never a live quote. Use specific hotel or restaurant names and price ranges only when supported by research; otherwise explicitly say a price was not found and do not invent one. Include a cost_breakdown with integer INR min/max ranges for hotel_room_per_night_inr, transport_per_person_inr, food_per_day_per_person_inr, local_transport_per_day_per_person_inr, activities_per_day_per_person_inr, and fees_per_person_inr. Set each unsupported range to null. Ranges must be supported by research and be per the exact unit in the field name. Treat the preferred hotel nightly amount as a traveler-set target, not a verified rate; do not substitute it for researched prices. Include assumptions about room sharing and trip duration. Never invent price data or bookings. Be honest about seasonal weather, crowds, and safety."},
        {"role": "user", "content": f"""Interests: {body.interests}
Budget level: {body.budget}
Maximum total budget per traveler (whole trip): {budget_amount}
Timing: {body.timing}
Group size preference: {body.group_size or 'unspecified'}
Preferred destinations: {', '.join(body.preferred_destinations) or 'none specified'}
Travelers: {body.travelers}
Trip nights: {body.nights}
Hotel target per room/night (traveler preference, not a quote): {f'₹{body.hotel_budget_per_night:,}' if body.hotel_budget_per_night else 'not specified'}
Travelers sharing each room: {body.room_share}
Live research:
{live_context}
Return JSON exactly in this shape:
{{"recommendations":[{{"destination":"","region":"","why":"","top_places":[{{"name":"","category":"","why_visit":""}}],"best_for":[""],"estimated_total_per_person":"","budget_fit":"","timing_note":"","sample_activities":[""],"watch_out":"","cost_breakdown":{{"hotel_room_per_night_inr":{{"min":0,"max":0}},"transport_per_person_inr":{{"min":0,"max":0}},"food_per_day_per_person_inr":{{"min":0,"max":0}},"local_transport_per_day_per_person_inr":{{"min":0,"max":0}},"activities_per_day_per_person_inr":{{"min":0,"max":0}},"fees_per_person_inr":{{"min":0,"max":0}},"assumptions":[""]}},"trip_plan":[{{"day":1,"title":"","stay_area":"","hotel_suggestion":"","estimated_room_rate_per_night":"","nearby_food":[{{"place_or_cuisine":"","estimated_meal_price_per_person":""}}],"activities":[""],"estimated_daily_spend_per_person":""}}]}}]}}
Use null instead of a range when research cannot support it. Recommend four destinations."""}], 0.3, provider="gemini")
    result = parse_json(raw)
    recommendations = result.get("recommendations") if isinstance(result, dict) else None
    if not isinstance(recommendations, list):
        raise HTTPException(502, "AI returned an invalid destination recommendation.")
    for recommendation in recommendations[:4]:
        if isinstance(recommendation, dict):
            recommendation["cost_breakdown"] = _validated_cost_breakdown(
                recommendation.get("cost_breakdown")
            )
    sources = [
        {"title": source["title"], "url": source["url"]}
        for source in live
        if source.get("title") and source.get("url", "").startswith(("http://", "https://"))
    ]
    return {
        "recommendations": recommendations[:4],
        "budget_amount": body.budget_amount,
        "sources": sources,
    }
