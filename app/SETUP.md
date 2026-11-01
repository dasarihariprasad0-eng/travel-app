# DIRECT React app

The app is a React 19 + TypeScript single-page application. It talks directly
to the FastAPI service; it contains no database credentials or AI provider
keys.

## Run the complete application

Start the backend first; follow [the FastAPI setup](../python-server/SETUP.md).
Then, in another terminal:

```powershell
cd app
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:8080`. The frontend reads the public API address from
`VITE_API_URL` in `.env` (defaults to `/api`, proxied by Vite to the local
FastAPI service). A production build defaults to
`https://direct-travel-api.onrender.com` when `VITE_API_URL` is not provided.

## Phone testing over local HTTPS

Browsers only expose secure browser APIs to HTTPS sites or localhost. To test
on a phone, install [mkcert](https://github.com/FiloSottile/mkcert), then run
the setup script from PowerShell:

```powershell
.\scripts\setup-local-https.ps1
```

The script creates a local certificate for the computer's LAN address and
writes ignored certificate files under `.certs/` plus `.env.local`. Install
`.certs/phone-rootCA.pem` as a trusted certificate authority on the phone using
the phone OS's certificate-installation steps. Never copy or install
`rootCA-key.pem`; it is private. Then start FastAPI and Vite as described
above, and open the HTTPS URL printed by the script (port 8080) on the phone.
Both devices must be on the same trusted local network. Re-run the script if
the computer's LAN address changes.

## Notes

- Account registration/sign-in is handled by FastAPI using SQLite and
  email/password. There is no Google OAuth or Supabase dependency.
- Locally, user accounts and trip records are stored in SQLite. In a hosted
  deployment, the backend can store them in PostgreSQL with `DATABASE_URL`.
- Only optional Groq/Gemini provider keys belong in `python-server/.env`. Never
  put them in this folder, a `VITE_` variable, or frontend source.
- `render.yaml` deploys this frontend as a Render static site and sets
  `VITE_API_URL` to the Render API service. If you rename the services or add
  a custom domain, update `VITE_API_URL` and the API's `CORS_ORIGINS`.
- For Zoho Catalyst hosting, set `VITE_API_URL` to
  `https://direct-travel-api.onrender.com` in the frontend build environment,
  then trigger a new build. Add the exact Catalyst site origin (for example,
  `https://direct-the-travelling-app.onslate.in`) to the Render API's
  `CORS_ORIGINS`. The frontend sends its per-tab bearer token in the
  `Authorization` header, avoiding reliance on cross-site cookies that some
  browsers block. The token is held in `sessionStorage` and cleared when the
  user signs out or the session expires; as with any JavaScript-accessible
  token, protect the app against cross-site scripting. The backend also
  retains HttpOnly-cookie support for same-site deployments and older clients.
- Free hosting and database plans can sleep or pause and have quotas. Check
  the providers' current limits before using them for a business launch.
