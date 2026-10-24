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
- `render.yaml` provides a free Render API service blueprint. Supply the
  Supabase PostgreSQL connection string and SMTP/reset secrets in the Render
  dashboard; do not commit them. The backend's free instance may sleep when
  idle, and free database plans can have storage, connection, backup, or
  inactivity limits. Review current provider terms before relying on free
  plans for production or customer data.

### First deployment

1. Push this project to a private GitHub repository. The current local
   workspace must be connected to a Git remote before a provider can build it.
2. Create a Supabase project and copy its PostgreSQL connection URI from
   **Project Settings → Database → Connection string**. Protect this URI as a
   secret; do not add it to the frontend environment.
3. In Render, create a Blueprint from the repository root and apply
   `render.yaml`. Set `DATABASE_URL` to the Supabase URI and configure the
   SMTP and `PASSWORD_RESET_SECRET` values in the Render service environment.
   A Gmail App Password is required for Gmail SMTP.
4. Import the same repository in Vercel, set the project root to `app`, and
   deploy. `app/vercel.json` forwards `/api/*` to
   `https://direct-travel-api.onrender.com`; change this destination if the
   Render service name or URL differs.
5. Verify `https://<your-render-service>.onrender.com/health`, then test
   account creation, sign-in, password reset email delivery, and the deployed
   Vercel site. Cloud database is empty by default; the local SQLite file is
   not uploaded.

The frontend API proxy keeps session cookies on the Vercel site origin. Do
not bypass the proxy by setting `VITE_API_URL` to a different provider
domain, or browser cookie behavior can change.
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
