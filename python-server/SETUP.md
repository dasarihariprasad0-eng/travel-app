# DIRECT FastAPI backend

FastAPI owns authentication and the SQLite database. The database is created
automatically on first startup; no Supabase project, OAuth credentials, SQL
server, or database API key is required.

## Windows quick start

```powershell
cd python-server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://localhost:8000/health` to check the API and
`http://localhost:8000/docs` for its interactive API reference. In a second
terminal, follow [the React setup](../app/SETUP.md).

## AI provider keys (optional)

Only itinerary generation and destination ideas need an AI provider key. Keys
stay in this backend's `.env` and are never sent to the
browser. The supported model IDs are `gemini-3.6-flash` for Gemini and
`openai/gpt-oss-20b` for Groq.

Add the Gemini key to this backend's `.env`:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=
```

Or use Groq instead:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=
```

Get keys from [Google AI Studio](https://aistudio.google.com/apikey) or the
[Groq Console](https://console.groq.com/keys). AI keys are optional; the
account, profile, traveler matching, connection, and trip-management APIs work
without them. Provider free tiers have quotas and their terms may allow
submitted prompts to be used to improve their services. Do not put sensitive
personal information into AI prompts.

Browser sessions use a 14-day, HttpOnly, SameSite=Lax cookie; the raw session
token is not returned to React or stored in browser storage. The Secure cookie
attribute is enabled when the API request uses HTTPS.

## Password reset email

Password reset sends a six-digit code through Gmail SMTP. Use a Google
account with 2-Step Verification enabled and create an app password; do not
put your regular Google password in the app. Set these values in
`python-server/.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-gmail-address@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM_EMAIL=your-gmail-address@gmail.com
PASSWORD_RESET_SECRET=replace-with-a-long-random-secret
```

Generate `PASSWORD_RESET_SECRET` with a cryptographically secure random
generator and keep it private. Reset codes expire after 10 minutes, are
limited to five verification attempts, and can only be requested once per
minute for an email address. Successful password changes invalidate existing
sessions. The API returns a generic response for reset requests so callers
cannot use it to determine whether an email has an account.

## Data and deployment notes

- Local development uses SQLite at `python-server/direct.db`; override with
  `DATABASE_PATH` for a writable persistent location. Set `DATABASE_URL` to a
  PostgreSQL connection string to use a managed PostgreSQL database instead.
  PostgreSQL connections require TLS, and the schema is initialized at startup.
- Set `CORS_ORIGINS` to the exact frontend origins for deployment. Bind the
  backend to `0.0.0.0` only on a trusted local network.
- SQLite is appropriate for local use and small deployments with a persistent
  disk. Use a different persistence layer before deploying multiple backend
  instances or requiring high availability.
- `render.yaml` provides a Render blueprint for the API and React frontend.
  Set `DATABASE_URL` to a complete PostgreSQL connection URI and configure
  SMTP credentials and any desired provider API keys in the Render dashboard;
  do not commit secrets. The Blueprint generates `PASSWORD_RESET_SECRET`.
  The database URL must start with `postgresql://` and include the database
  credentials, host, port, and name.
  A database hostname by itself is not a valid URL. Review the current Render
  service and database plans before deploying.

### First deployment

1. Push this project to a private GitHub repository. The current local
   workspace must be connected to a Git remote before a provider can build it.
2. Create a PostgreSQL database in Render (or use an existing managed
   PostgreSQL database). Copy its full **Internal Database URL**. Do not use
   only the hostname and do not expose this URL to the frontend.
3. In Render, create a Blueprint from the repository root and apply
   `render.yaml`. Set `DATABASE_URL` to the full database URL, then configure
   `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` in the API service
   environment if you want password-reset emails. The Blueprint generates
   `PASSWORD_RESET_SECRET`; enter provider API keys for the optional AI,
   weather, and research features. A Gmail App Password is required for Gmail
   SMTP.
4. The Blueprint also deploys the React frontend and configures it to call the
   API. If you rename either service or add a custom domain, update
   `VITE_API_URL` and the API's `CORS_ORIGINS` to match.
5. Verify `https://direct-travel-api.onrender.com/health` and
   `https://direct-travel-web.onrender.com`, then test account creation,
   sign-in, and password-reset email delivery. The database starts empty; the
   local SQLite file is not uploaded.
- Weather and geocoding currently use OpenWeather when configured. If no
  OpenWeather key is set, weather forecasts are reported as unavailable rather
  than fabricated. Tavily web research is optional.
- Use HTTPS, a persistent database volume, backups, and strong secret handling
  for any public deployment. Local development settings are not production
  security configuration.

## Tests

```powershell
pytest -q
```
