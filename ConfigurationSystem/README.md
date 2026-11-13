# ConfigurationSystem

Independent React/Vite application for TLP Company configuration.

## Run locally

Start the shared Node.js API on port 5189. From this folder:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5192 or **http://192.168.1.5:5192**. Sign in with an account from `ConfigurationUserLogin`. This app has its own login and session, using `/api/configuration/auth/...`.

## Build and start

```powershell
npm run build
npm start
```

The built app runs on port 5192. Both development and preview proxy `/api` to the shared backend on port 5189. This project owns its dependencies, source, login, shell, styles, and `dist`; it does not import another frontend project.

Reference masters use `/api/configuration/masters` in `NODE JS SERVER/Api/ConfigurationApi.js`. Only administrators change masters or manage accounts; the Configuration role has read-only master access and its own profile. ConfigurationUserLogin stores these accounts. Audit Trail identifies the actor's system for events across all four systems. Dockerfile and nginx.conf build and serve this project independently. SQL and migrations remain in `NODE JS SERVER/migration`.
