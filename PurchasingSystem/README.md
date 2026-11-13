# PurchasingSystem

Independent React/Vite project on port **5191**. Supplier and Supplies masters, PR Monitoring, PO Monitoring, and Receiving Receipt. It owns its source, dependencies, login, shell, and `dist`.

## Development

Start the common Node.js API on port 5189. Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://localhost:5191**. For LAN access, use this computer's LAN IP address in place of `localhost`.

## Built app

Stop this app's development server, then run:

```powershell
npm run build
npm start
```

`npm start` serves `dist` with Vite preview on the same port. The React plugin is configured in `vite.config.js`. Development and preview both proxy `/api`, `/Uploads`, and `/socket.io` with `changeOrigin: true` to `API_PROXY_TARGET`, which defaults to `http://localhost:5189`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5189`.

The upload and Socket.IO entries forward requests only; the backend has no upload-storage or Socket.IO service yet. Allowed frontend URLs are configured in the backend `.env` as `FRONTEND_ORIGINS`.

## Accounts and API

Sign in with this app's account from **PurchasingUserLogin**. Its API namespace is `/api/purchasing`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage this app's accounts. Purchasing users work with purchasing records and edit their own profiles.

`src/api.js` makes ordinary same-origin `fetch` requests under `/api/purchasing`, such as `/api/purchasing/purchase-requests`. The Node server mounts the CommonJS Express router exported by `Api/PurchasingApi.js` at that prefix; frontend components call HTTP endpoints through the local API helper.

Form validation is organized in `src/helper/validation.js` and runs before fetch. The shared backend `LoginApiSystem.js` handles JWT login, profile and account endpoints while preserving this system's own table and cookie.

## Workflow

Each sidebar item has a named page under `src/pages`. Its forms live inside that page folder or beside the page file. `src/components` contains shared layout and UI. API calls use the full `/api/purchasing/...` endpoint in the page; `src/api.js` handles HTTP credentials, JSON and errors without adding a hidden URL prefix.

1. Maintain Supplier and Supplies records.
2. Save and post a Purchase Request.
3. Load open, posted PR lines into a Purchase Order and post it.
4. Save a Receiving Receipt from the posted PO. Partial receipts are supported.
5. Allocate every received quantity to a warehouse and location, then post the receipt to add supplies stock.

Saving a draft does not change stock. Posting checks source balances, allocation quantities, and configured destinations. Supplies stock remains separate from finished-product stock.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
