# DIRECT — AI Group Travel App

This package is configured for the four provider keys you said you have:

- **Tavily** → live web research for destination facts and current travel questions
- **OpenWeather** → live forecast/weather-aware itinerary planning
- **Gemini** → itinerary generation and destination recommendation
- **Groq** → fast Travel Companion chat
- **SQLite SQL database** → users, password hashes, profiles, preferences, trips, groups/members, itineraries, progress, AI conversations, weather snapshots and Tavily source records

The browser never receives these provider keys. They belong only in `python-server/.env`.

## 1. Open the workspace

Run `Nodeworkspace.wsb` so the project appears at `C:\Workspace`.

## 2. Configure the four keys

Inside `C:\Workspace\python-server`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill these values:

```dotenv
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
TAVILY_API_KEY=your_tavily_key
OPENWEATHER_API_KEY=your_openweather_key
```

You can leave the model names as the defaults, or change them if your provider account exposes a different model.

## 3. Start the backend

```powershell
cd C:\Workspace\python-server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check:

`http://localhost:8000/health`

and:

`http://localhost:8000/docs`

The health response shows which of Gemini, Groq, Tavily and OpenWeather are configured.

## 4. Start the frontend

Open a second terminal:

```powershell
cd C:\Workspace\app
npm install
npm run dev -- --host 0.0.0.0 --port 8080
```

Open:

`http://localhost:8080`

## 5. Test the complete flow

1. Create an account.
2. Complete your traveler profile and preferences.
3. Open Discover/Matches.
4. Create a trip.
5. Join the trip as a member.
6. Generate the itinerary.
7. The backend geocodes the destination with OpenWeather, retrieves weather, asks Tavily for live travel research, and sends the combined planning context to Gemini.
8. Open the trip assistant. Questions are researched with Tavily and answered by Groq using the trip's itinerary as private context.
9. Mark itinerary activities complete to test progress tracking.

## Important security rule

Never put any of the four provider keys into frontend `.env` variables beginning with `VITE_`, React source code, Git, or a public repository.

Passwords are stored as salted password hashes, not plaintext passwords.
