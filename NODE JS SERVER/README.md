# TLP Company Systems

Four independent React projects connect to one Node.js backend and the SQL Server database **TLPCompany**. Every frontend has its own package, entry point, build output, development server, port, and Docker container. Each system authenticates against its own user table and has its own session cookie and API namespace.

## Folders

```text
TLP COMPANY/
  NODE JS SERVER/   Shared Node.js backend and local .env
    Api/            LoginApiSystem.js plus the four business API routers
    migration/      SQL schemas, database/schema checks, runner, and CLI
    tests/          In-memory workflow and mocked browser checks
  SalesSystem/      Independent React project: Sales and SalesUserLogin
  PurchasingSystem/ Independent React project: Supplier, Supplies, PR, PO, Receiving
  WarehouseSystem/  Independent React project: read-only supplies inventory
  ConfigurationSystem/ Independent React project: reference masters and audit trail
```

## Run

Requires Node.js 22 or later and SQL Server with TCP and SQL authentication enabled. `db.js` uses the `mssql` package with a connection object, like LSS. Local development connects to `localhost:1433`; Docker connects to the same Windows SQL Server through `host.docker.internal:1433`. No ODBC driver or connection string is needed.

## Docker and LAN access

From this `NODE JS SERVER` folder:

```powershell
docker compose up -d --build --remove-orphans
docker compose ps
```

Each frontend container runs its own built React app with Vite preview. The Node API runs separately on port 5188. Open each app on this computer:

| Project | Address |
| --- | --- |
| SalesSystem | http://localhost:5189 |
| Shared Node API | http://localhost:5188/api/health |
| WarehouseSystem | http://localhost:5190 |
| PurchasingSystem | http://localhost:5191 |
| ConfigurationSystem | http://localhost:5192 |

For LAN access, replace `localhost` with this computer's LAN IP. Each frontend uses `@vitejs/plugin-react` and inline Vite proxy entries for `/api`, `/Uploads`, and `/socket.io`, with `changeOrigin: true` and WebSocket proxying for `/socket.io`. The target defaults to `http://localhost:5188`; Docker sets `API_PROXY_TARGET=http://nodejs-server:5188`. `/socket.io` carries authenticated live updates; `/Uploads` remains a reserved proxy path without upload storage.

The four frontend ports and the API port are set directly in `compose.yaml`. Browser API calls use each frontend's same-origin Vite proxy. Every write request sends JSON, including bodyless actions; the backend rejects simple form submissions and does not enable cross-origin CORS requests. There is no frontend-origin list to update when the LAN IP changes.

Sign in separately to each app with its existing administrator account. User accounts and salted password hashes are stored in `SalesUserLogin`, `PurchasingUserLogin`, `WarehouseUserLogin`, and `ConfigurationUserLogin`. Startup does not create or reset accounts; administrator credentials are not kept in `.env`.

Docker uses the existing Windows SQL Server instance at `host.docker.internal:1433`, database `TLPCompany`. Its dedicated SQL login is scoped to that database; credentials and session configuration come from the local `.env`, which is excluded from the Docker build context and Git. SQL Server must remain running. Business data remains in SQL Server when the app container is restarted or rebuilt.

```powershell
docker compose logs --tail 50
docker compose restart
docker compose down
```

`docker compose down` stops the five app containers; it does not delete the SQL database. Start them again with `docker compose up -d`.

## Local development

From this backend folder:

```powershell
npm ci
npm run dev
```

In separate terminals, run `npm ci` and `npm run dev` inside each frontend folder. The same ports listed above apply. Each app's Vite development server proxies its own `/api` requests to the backend.

To serve a built frontend, stop its development server and run these commands inside that frontend folder:

```powershell
npm run build
npm start
```

`npm start` runs Vite preview on that app's own port, with the same API proxy. Each frontend Dockerfile uses this built-app flow directly in a Node container.

`npm start` inside this backend folder starts the Node API. Run frontend commands inside the relevant React project.

## Per-system APIs and migrations

`Api/SalesApi.js`, `PurchasingApi.js`, `ConfigurationApi.js`, and `WarehouseApi.js` are CommonJS Express router modules. Each creates `express.Router()`, defines relative routes with `router.get`, `router.post`, `router.put`, and the other HTTP methods, then exports that router with `module.exports = router`. Each endpoint keeps its SQL, transformations, calculations and response directly inside its route handler and transaction callbacks. API files have no separate helper functions or helper classes; only static definitions and inline callbacks remain. The APIs share the SQL connection in `db.js`. Connection startup checks and `/api/health` stay in `server.js`. Form validation runs before fetch in each frontend's own `src/helper/validation.js`. SQL text parameters use `sql.MAX`; text-field length checks stay in the frontend. `migration/text-max.sql` widens non-indexed `varchar`/`nvarchar` columns to `MAX`, keeps existing index-key lengths and numeric types/ranges, and stores customer/supplier TIN as `VARCHAR(MAX)` so leading zeros and hyphens are preserved. The APIs generate document numbers and store ordinary values. Tables have no DEFAULT constraints, CHECK constraints or computed expressions. Optional blank inputs are stored as NULL; an explicitly entered zero stays zero.

`server.js` loads each router with `require` and mounts it under its system namespace, for example:

```js
app.use('/api', require('./Api/LoginApiSystem'));
const salesApi = require('./Api/SalesApi');
app.use('/api/sales', salesApi);
```

A relative Sales route such as `/customers` is available at `/api/sales/customers`. React pages pass that full endpoint explicitly, for example `api('/api/sales/customers')`; the HTTP helper does not prepend a hidden prefix. Each sidebar item has its own folder under `src/pages`, containing the matching page and descriptively named forms, for example `SalesOrder/SalesOrder.jsx` and `SalesOrder/CreateOrderForm.jsx`. Shared layout and UI remain under `src/components`.

| System | API namespace | User table | Account roles |
| --- | --- | --- | --- |
| Sales | `/api/sales` | `SalesUserLogin` | admin, saleshead, sales |
| Purchasing | `/api/purchasing` | `PurchasingUserLogin` | admin, purchasing |
| Warehouse | `/api/warehouse` | `WarehouseUserLogin` | admin, warehouse |
| Configuration | `/api/configuration` | `ConfigurationUserLogin` | admin, configuration |

`Api/LoginApiSystem.js` centralizes login, JWT authentication, profile and account management. Password checking and JWT creation are inline in the login endpoint; JWT verification is inline in its namespace middleware. Each namespace retains its own `/auth/login`, `/auth/session`, `/auth/logout`, `/auth/profile`, and `/users` endpoints. Signed HS256 JWT tokens contain the system, audience, user ID and expiry. They are stored in separate HttpOnly cookies scoped to the relevant system; the signing key is derived separately for each system. An account or session from one system does not authenticate another. Configuration masters use `/api/configuration/masters`; other business paths follow their owning system's prefix. Purchasing actor foreign keys reference PurchasingUserLogin. Shared audit records identify the actor's system as well as the account ID.

All SQL files and database/schema checking live under `migration/`: `table-values.sql`, `schema.sql`, `system-accounts.sql`, `configuration-schema.sql`, `erp-schema.sql`, `text-max.sql`, and `run.js`. Backend startup applies these idempotent migrations in one transaction before listening; a failed batch rolls back the schema update. Run `npm run migrate` to apply migrations without starting HTTP. Migrations only manage the database schema; they do not create administrator accounts or business records. A new installation needs its department accounts provisioned in the database before users can sign in. Backend startup uses the same migration runner. The backend contains the actual local `.env`; no `.env.example` is required.

## Appearance

All four apps have matte navy and light themes with blue navigation accents. Use the sun/moon button on the login page or top bar to switch; each app remembers the preference in the browser. Sidebar modules are direct buttons without expandable groups. Page changes use a short transition, initial record loads use animated skeletons, and new table rows fade into place. Realtime refreshes retain loaded records and open drafts. Reduced-motion browser preferences disable these animations. Printed documents remain white with dark text.

## Realtime updates

Each signed-in frontend maintains its own Socket.IO connection. The existing JWT-protected API issues a short-lived, single-use connection ticket; sockets join only their authenticated system room. Tickets and connection state stay in memory, with no extra database records.

After a successful API save, post, cancel or delete, the server emits an invalidation event. Frontends fetch fresh authorized records in the background and update React state without reloading the document or closing open forms. Burst events are combined, and reconnecting fetches changes missed while offline. Each project owns its `src/hooks/useRealtime.js` implementation.

Purchasing receipt changes refresh Warehouse inventory and receiving movements, related Purchasing monitors refresh together, and Configuration changes refresh dependent views. Events contain only resource names and timestamps; account changes and logout revoke affected realtime connections. Direct edits made outside these APIs do not emit application events.

## Administrator and configuration

The local `.env` contains only `PORT`, `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `SESSION_SECRET`. `PORT` is the local Node API port; `DB_SERVER` is `localhost` and `DB_NAME` is `TLPCompany`. The SQL login authenticates the backend to SQL Server; it is separate from department user accounts. `SESSION_SECRET` signs JWTs. Docker overrides the SQL hostname to `host.docker.internal` and uses its fixed API port. The `.env` file is excluded from Git and Docker images; keep a private backup when moving the application to another computer.

The initial administrator is named Lester. Add your mobile number, email, and profile photo through each app's own profile form. Administrators manage accounts in that app's UserLogin screen. Sales retains the following account permissions:

| Role | Account permissions |
| --- | --- |
| Admin (`admin`) | Full system access. Creates and edits Admin, Sales Head, and Sales accounts. |
| Sales Head (`saleshead`) | Uses Sales modules, views Sales accounts, and creates Sales accounts. |
| Sales (`sales`) | Uses Sales modules and edits its own profile. |

**Sales In-charge** selects an active Sales account. Customer assignments reference the account ID, so account name changes appear on the customer record. The customer form omits Company Id.

Purchasing users work in Purchasing; Warehouse users view inventory; Configuration users read reference records. Each system's administrator has full access to its available functions and its own account management. Only Configuration administrators can change configuration masters. Configuration Audit Trail shows events from all four systems with an explicit system field.

## Sales workflow

The **Sales** menu contains **Customer**, **Product**, **Sales Order**, **Invoice**, **Delivery Receipt**, and **Shipping Invoice**. Admin and Sales Head account actions are available in **SalesUserLogin** according to their roles.

1. Add customers in **Customer**.
2. Add products and prices in **Product**. Its four CAS tabs are Basic Info, Customer, Inventory Sched, and Link Supplies. Opening stock is not an Add Product input.
3. Create a **Sales Order**, add product lines, and confirm it when ready.
4. Create an **Invoice** from a confirmed order and record the amount paid.
5. Create a **Delivery Receipt** from a confirmed order. Saving it deducts product stock atomically; insufficient stock prevents the receipt from being saved.
6. Create a **Shipping Invoice** from an existing invoice. Enter its shipping date and any applicable carrier, tracking number, and notes. Customer, items, and totals come from the existing invoice/order; they are not copied into another set of line items. Delivery is optional at this step.

Each order supports one full invoice and one full delivery receipt; each invoice supports one shipping invoice. The shipping date cannot precede the invoice date. Orders linked to an invoice or receipt are protected against editing/deletion. Referenced customers and products cannot be deleted; mark them inactive instead. Unit prices retain six decimal places and document totals round to two. An order uses the common product currency, which its documents inherit; mixed-currency lines are rejected. There is no automatic currency conversion. Legacy prices without a currency use PHP.

Finished-product stock is separate from supplies stock. Purchasing receives supplies/raw materials; it does not convert them into finished products. Production, stock adjustment, issuance, and returns are outside this scope. A delivery requires sufficient existing finished-product stock.

## Purchasing and Warehouse

1. An administrator creates the required reference records in Configuration: units, currencies, VAT codes, terms, categories, warehouses, and locations. No source-company records are automatically copied or seeded.
2. Maintain **Supplier** and **Supplies** in Purchasing. Supplies can reference products and ordered supplier pricing rows. Product Link Supplies uses the same Supplies master.
3. Create and save a **Purchase Request**, then **Post** it. Saving a draft does not affect stock.
4. Create a **Purchase Order** using open, posted PR lines. Choose the supplier, delivery date, currency, rate, terms, shipment, VAT, and quantities. Posting checks the remaining PR quantities.
5. Save a **Receiving Receipt** from a posted PO. Partial receipts are supported. Enter supplier invoice and delivery references, then allocate every received quantity to a warehouse and location, with optional lot number, QC label, manufacturing date, and expiry date.
6. **Post** the receiving receipt to add supplies stock atomically. Incomplete allocations, changed units, and quantities beyond the PO balance are rejected. Repeated or concurrent posting of one receipt cannot add the stock twice.
7. **Warehouse â†’ Supplies Stock** displays category, supplies, UOP, stock totals, lot/storage allocations, and receipt history. It has no stock editing controls.

PR and PO monitoring show posted downstream quantities and remaining balances. Draft documents remain editable; posted documents preserve their source details. Discounts and VAT use decimal arithmetic and the supplier's rounding settings. Shipment choices follow the observed CAS list. Exchange rate is retained as a document reference; line amounts stay in the document currency.

## Configuration

The independent ConfigurationSystem contains ATC, Audit Trail, Bank, Country, Currency, Customer Category, Payment Term, Product Category, Supplies Category, Unit of Product, VAT, Warehouse, and Warehouse Location. Only administrators can change these masters. Deactivation retains referenced records and their history. Audit Trail is read-only and records application mutations without storing passwords or photos.

The observed CAS inputs and limitations are recorded in `docs/cas-purchasing-reference.json`. Blank CAS forms were inspected without saving or posting transactions. Sales retains its existing full-order invoice/delivery relationships described above; CAS printing, unposting, production, and finished-goods allocation are not implemented by the new purchasing workflow.

## Verification

```powershell
npm test
npm run test:browser
```

The default tests run against frontend form validation, the actual receiving SQL route with an in-memory transactional database adapter, and mocked browser API routes. They do not connect to SQL or save business records. HTTP checks use an in-process Express app and invalid requests; Vite proxy checks use a fake local API. Browser tests use installed Google Chrome; run `npm run build` inside each frontend first. Screenshots are saved under `.qa/screenshots/`.

The obsolete ODBC integration scripts for the earlier combined app have been retired. The maintained suites use only isolated fake data and do not create databases or save transactions to SQL Server.
