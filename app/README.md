# DIRECT React frontend

React 19 + TypeScript SPA. It calls the FastAPI backend at `VITE_API_URL`.
Local development defaults to the Vite `/api` proxy; production defaults to
`https://direct-travel-api.onrender.com` when `VITE_API_URL` is not set.

```powershell
npm install
npm run dev
```

See [SETUP.md](./SETUP.md) for running the full app and environment details.
