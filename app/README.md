# DIRECT React frontend

React 19 + TypeScript SPA. It calls the FastAPI backend at `VITE_API_URL`.
Local development defaults to the Vite `/api` proxy; production defaults to
`https://direct-travel-api.onrender.com` when `VITE_API_URL` is not set.
After sign-in, the frontend keeps the API bearer token in per-tab
`sessionStorage` so authentication works when the frontend and API are hosted
on different sites.

```powershell
npm install
npm run dev
```

See [SETUP.md](./SETUP.md) for running the full app and environment details.
