# DIRECT frontend

- This folder is a React + TypeScript Vite application.
- All account, profile, matching, and trip data goes through the FastAPI API.
- Keep provider keys in `../python-server/.env`; never expose them in Vite
  variables, frontend source, or browser storage.
- Use `npm run dev`, `npm run build`, `npm run lint`, and `npm test` as
  appropriate when changing the app.
