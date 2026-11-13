# PurchasingSystem

Independent React/Vite application for TLP Company purchasing.

## Run locally

Start the shared Node.js API on port 5189. From this folder:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5191 or **http://192.168.1.5:5191**. Sign in with an account from `PurchasingUserLogin`. This app has its own login and session, using `/api/purchasing/auth/...`.

## Build and start

```powershell
npm run build
npm start
```

The built app runs on port 5191. Both development and preview proxy `/api` to the shared backend on port 5189. This project owns its dependencies, source, login, shell, styles, and `dist`; it does not import another frontend project.

Supplier, Supplies, PR Monitoring, PO Monitoring, and Receiving Receipt use `NODE JS SERVER/Api/PurchasingApi.js`. Posting a fully allocated receipt adds supplies inventory. Administrators manage this app's accounts in PurchasingUserLogin; roles are Administrator and Purchasing. Dockerfile and nginx.conf build and serve this project independently. SQL and migrations remain in `NODE JS SERVER/migration`.
