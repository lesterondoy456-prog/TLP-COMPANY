# ConfigurationSystem

Independent React/Vite project on port **5192**. Company reference masters and the read-only audit trail. It owns its source, dependencies, login, shell, and `dist`.

## Development

Start the common Node.js API on port 5189. Then, from this folder:

```powershell
npm ci
npm run dev
```

Open **http://localhost:5192**. For LAN access, use this computer's LAN IP address in place of `localhost`.

## Built app

Stop this app's development server, then run:

```powershell
npm run build
npm start
```

`npm start` serves `dist` with Vite preview on the same port. Development and preview both proxy `/api` to `API_PROXY_TARGET`, which defaults to `http://localhost:5189`. Docker runs the built Vite app in its own Node container and sets the target to `http://nodejs-server:5189`.

## Accounts and API

Sign in with this app's account from **ConfigurationUserLogin**. Its API namespace is `/api/configuration`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Only administrators change masters or manage this app's accounts. Configuration users read reference records and edit their own profiles.

## Workflow

The menus contain ATC, Audit Trail, Bank, Country, Currency, Customer Category, Payment Term, Product Category, Supplies Category, Unit of Product, VAT, Warehouse, and Warehouse Location. Deactivation preserves referenced records. Audit Trail identifies each event's system and actor. Master routes use `/api/configuration/masters`.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
