# WarehouseSystem

Independent React/Vite project on port **5190**. Read-only supplies inventory, warehouse/location lots, and receipt movements. It owns its source, dependencies, login, shell, and `dist`.

## Development

Start the common Node.js API on port 5189. Then, from this folder:

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

`npm start` serves `dist` with Vite preview on the same port. Development and preview both proxy `/api` to `API_PROXY_TARGET`, which defaults to `http://localhost:5189`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5189`.

## Accounts and API

Sign in with this app's account from **WarehouseUserLogin**. Its API namespace is `/api/warehouse`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage this app's accounts. Warehouse users view inventory and edit their own profiles.

## Workflow

Supplies Stock shows category, supply name, description, UOP, and total stock. Expand a supply to inspect its storage locations, lots, dates, QC labels, and receipt history. Refresh stock to load newly posted receiving receipts. This app does not edit stock or convert supplies into finished products.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
