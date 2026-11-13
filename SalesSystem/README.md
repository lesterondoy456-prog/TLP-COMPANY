# SalesSystem

Independent React/Vite project on port **5189**. Customers, products, sales orders, invoices, delivery receipts, and shipping invoices. It owns its source, dependencies, login, shell, and `dist`.

## Development

Start the common Node.js API on port 5188. Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://localhost:5189**. For LAN access, use this computer's LAN IP address in place of `localhost`.

## Built app

Stop this app's development server, then run:

```powershell
npm run build
npm start
```

`npm start` serves `dist` with Vite preview on the same port. The React plugin is configured in `vite.config.js`. Development and preview both proxy `/api`, `/Uploads`, and `/socket.io` with `changeOrigin: true` to `API_PROXY_TARGET`, which defaults to `http://localhost:5188`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5188`.

The upload and Socket.IO entries forward requests only; the backend has no upload-storage or Socket.IO service yet. Allowed frontend URLs are configured in the backend `.env` as `FRONTEND_ORIGINS`.

## Accounts and API

Sign in with this app's account from **SalesUserLogin**. Its API namespace is `/api/sales`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage Admin, Sales Head, and Sales accounts. Sales Heads can view Sales accounts and create Sales accounts. Sales users edit their own profiles.

`src/api.js` makes ordinary same-origin `fetch` requests under `/api/sales`, such as `/api/sales/customers`. The Node server mounts the CommonJS Express router exported by `Api/SalesApi.js` at that prefix; frontend components call HTTP endpoints through the local API helper.

Form validation is organized in `src/helper/validation.js` and runs before fetch. The shared backend `LoginApiSystem.js` handles JWT login, profile and account endpoints while preserving this system's own table and cookie.

## Workflow

Each sidebar item has a named page under `src/pages`. Its forms live inside that page folder or beside the page file. `src/components` contains shared layout and UI. API calls use the full `/api/sales/...` endpoint in the page; `src/api.js` handles HTTP credentials, JSON and errors without adding a hidden URL prefix.

1. Add a customer and product. Product has Basic Info, Customer, Inventory Sched, and Link Supplies tabs.
2. Create and confirm a Sales Order.
3. Create its Invoice and record payments.
4. Create its Delivery Receipt when sufficient finished-product stock is available.
5. Create a Shipping Invoice from an existing invoice; this does not deduct stock again.

Each order supports one full invoice and one full delivery receipt. Prices retain six decimal places; document totals use two. Documents retain their product currency, and mixed-currency order lines are rejected. Sales In-charge selects an active Sales account by ID. This app contains Sales navigation and SalesUserLogin only.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
