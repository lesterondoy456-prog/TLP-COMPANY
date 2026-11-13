# WarehouseSystem

Independent React/Vite project on port **5190**. Read-only supplies inventory, warehouse/location lots, and receipt movements. It owns its source, dependencies, login, shell, and `dist`.

## Development

Start the common Node.js API on port 5188. Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://localhost:5190**. For LAN access, use this computer's LAN IP address in place of `localhost`.

## Built app

Stop this app's development server, then run:

```powershell
npm run build
npm start
```

`npm start` serves `dist` with Vite preview on the same port. The React plugin is configured in `vite.config.js`. Development and preview both proxy `/api`, `/Uploads`, and `/socket.io` with `changeOrigin: true` to `API_PROXY_TARGET`, which defaults to `http://localhost:5188`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5188`.

The upload and Socket.IO entries forward requests only; the backend has no upload-storage or Socket.IO service yet. Allowed frontend URLs are configured in the backend `.env` as `FRONTEND_ORIGINS`.

## Accounts and API

Sign in with this app's account from **WarehouseUserLogin**. Its API namespace is `/api/warehouse`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage this app's accounts. Warehouse users view inventory and edit their own profiles.

`src/api.js` makes ordinary same-origin `fetch` requests under `/api/warehouse`, such as `/api/warehouse/inventory`. The Node server mounts the CommonJS Express router exported by `Api/WarehouseApi.js` at that prefix; frontend components call HTTP endpoints through the local API helper.

Form validation is organized in `src/helper/validation.js` and runs before fetch. The shared backend `LoginApiSystem.js` handles JWT login, profile and account endpoints while preserving this system's own table and cookie.

## Workflow

Each sidebar item has a named page under `src/pages`. Its forms live inside that page folder or beside the page file. `src/components` contains shared layout and UI. API calls use the full `/api/warehouse/...` endpoint in the page; `src/api.js` handles HTTP credentials, JSON and errors without adding a hidden URL prefix.

Supplies Stock shows category, supply name, description, UOP, and total stock. Expand a supply to inspect its storage locations, lots, dates, QC labels, and receipt history. Refresh stock to load newly posted receiving receipts. This app does not edit stock or convert supplies into finished products.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
