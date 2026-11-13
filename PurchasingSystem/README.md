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

`npm start` serves `dist` with Vite preview on the same port. Development and preview both proxy `/api` to `API_PROXY_TARGET`, which defaults to `http://localhost:5189`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5189`.

## Accounts and API

Sign in with this app's account from **PurchasingUserLogin**. Its API namespace is `/api/purchasing`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage this app's accounts. Purchasing users work with purchasing records and edit their own profiles.

## Workflow

1. Maintain Supplier and Supplies records.
2. Save and post a Purchase Request.
3. Load open, posted PR lines into a Purchase Order and post it.
4. Save a Receiving Receipt from the posted PO. Partial receipts are supported.
5. Allocate every received quantity to a warehouse and location, then post the receipt to add supplies stock.

Saving a draft does not change stock. Posting checks source balances, allocation quantities, and configured destinations. Supplies stock remains separate from finished-product stock.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
