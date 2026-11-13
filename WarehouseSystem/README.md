# WarehouseSystem

Independent React/Vite application for TLP Company warehouse.

## Run locally

Start the shared Node.js API on port 5189. From this folder:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5190 or **http://192.168.1.5:5190**. Sign in with an account from `WarehouseUserLogin`. This app has its own login and session, using `/api/warehouse/auth/...`.

## Build and start

```powershell
npm run build
npm start
```

The built app runs on port 5190. Both development and preview proxy `/api` to the shared backend on port 5189. This project owns its dependencies, source, login, shell, styles, and `dist`; it does not import another frontend project.

Read-only supplies totals, lots, locations, and receipt movements use `NODE JS SERVER/Api/WarehouseApi.js`. Administrators manage this app's accounts in WarehouseUserLogin; roles are Administrator and Warehouse. Dockerfile and nginx.conf build and serve this project independently. SQL and migrations remain in `NODE JS SERVER/migration`.
