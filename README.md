# DIRECT — AI Group Travel Platform

DIRECT is a professional React + TypeScript travel discovery and group-planning application backed by FastAPI and a SQL database (SQLite for the local MVP).

## Provider architecture

The app uses the APIs you said you already have keys for:

| Provider | Role in DIRECT |
|---|---|
| **Tavily** | Live destination/travel web research and current Travel Companion grounding |
| **OpenWeather** | Geocoding + forecast data used by weather-aware planning |
| **Gemini** | Structured itinerary generation and destination ideas |
| **Groq** | Fast conversational Travel Companion responses |
| **SQLite** | Persistent SQL storage for accounts, password hashes, profiles, preferences, trips, members, itineraries, progress, AI conversations, weather snapshots and web-source records |

Tavily is intended for AI-oriented live web search, while Gemini and Groq are kept behind the FastAPI server. OpenWeather is also server-side. This keeps provider credentials out of the browser. citeturn0search0turn0search4turn0search2turn0search12

## What is already implemented

- Email/password registration and login
- HttpOnly session cookie authentication
- Password hashing; plaintext passwords are never stored
- Traveler profiles and travel preferences
- Transparent compatibility matching
- Trip creation and membership
- SQL persistence
- AI itinerary generation
- OpenWeather geocoding/forecast integration with classic forecast fallback
- Tavily live research before itinerary generation
- Gemini itinerary generation
- Tavily-grounded Travel Companion chat
- Groq Travel Companion chat
- Day-by-day schedule
- Weather notes in the itinerary
- Activity progress tracking
- Saved AI conversation history
- Weather snapshot storage
- Tavily source storage for trip research
- Responsive React UI

## Run it

See `START-HERE.md` for the exact Windows Sandbox commands.

Backend:

```powershell
cd C:\Workspace\python-server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# put your four keys into .env
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd C:\Workspace\app
npm install
npm run dev -- --host 0.0.0.0 --port 8080
```

## API keys

Use `python-server/.env`:

```dotenv
GEMINI_API_KEY=
GROQ_API_KEY=
TAVILY_API_KEY=
OPENWEATHER_API_KEY=
```

The app does **not** need you to provide custom API endpoints. The provider SDK/API URLs are built into the backend; your keys authenticate the requests.

## SQL database

The MVP uses SQLite because it is simple and immediately runnable in Windows Sandbox. The database file is `python-server/direct.db` by default.

The application persists user and trip data locally. The schema includes users, sessions, profiles, travel preferences, connection requests, trips, trip members, itineraries, itinerary days, progress, assistant messages, weather snapshots and web sources.

For a later production deployment, the persistence layer can be moved to PostgreSQL without putting database credentials in the frontend.

## Tests

Backend tests:

```powershell
cd C:\Workspace\python-server
.\.venv\Scripts\Activate.ps1
pytest -q
```

The current backend test suite passes locally in this package.

## Important

Provider quotas and plan access still apply. For example, Tavily usage consumes API credits, and OpenWeather products differ by account/plan. If a provider returns a quota or authorization error, DIRECT reports the provider failure instead of inventing data. citeturn0search5turn0search12
