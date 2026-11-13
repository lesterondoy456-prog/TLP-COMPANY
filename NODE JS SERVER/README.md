# TLP Company Systems

Four independent React projects connect to one Node.js backend and the SQL Server database **TLP Company**. Every frontend has its own package, entry point, build output, development server, port, and Docker container. Each system authenticates against its own user table and has its own session cookie and API namespace.

## Folders

```text
TLP COMPANY/
  NODE JS SERVER/   Shared Node.js backend and local .env
    Api/            SalesApi.js, PurchasingApi.js, ConfigurationApi.js, WarehouseApi.js
    migration/      SQL schemas, database/schema checks, runner, and CLI
    tests/          In-memory workflow and mocked browser checks
  SalesSystem/      Independent React project: Sales and SalesUserLogin
  PurchasingSystem/ Independent React project: Supplier, Supplies, PR, PO, Receiving
  WarehouseSystem/  Independent React project: read-only supplies inventory
  ConfigurationSystem/ Independent React project: reference masters and audit trail
```

## Run

Requires Node.js 22 or later and SQL Server. Windows integrated authentication also needs Microsoft ODBC Driver 18. The configured local instance is `.\MSSQLSERVER01`.

## Docker and LAN access

From this `NODE JS SERVER` folder:

```powershell
docker compose up -d --build --remove-orphans
docker compose ps
```

Each frontend container runs its own built React app with Vite preview. The Node API runs separately on port 5189. Open each app on this computer:

| Project | Address |
| --- | --- |
| SalesSystem | http://localhost:5188 |
| Shared Node API | http://localhost:5189/api/health |
| WarehouseSystem | http://localhost:5190 |
| PurchasingSystem | http://localhost:5191 |
| ConfigurationSystem | http://localhost:5192 |

For another device on the same LAN, replace `localhost` with this computer's LAN IP address. Each Vite app keeps its own port and serves only its own system. Its `/api` proxy uses `API_PROXY_TARGET`, defaulting to `http://localhost:5189`; Docker sets it to `http://nodejs-server:5189`. The proxy preserves the request host and the per-system API paths and cookies. No frontend imports another project's source or build. Docker host ports can be configured in this server's local `.env`. If Windows Firewall blocks LAN clients, `allow-lan.ps1` permits only these five TCP ports from the local subnet when run as Administrator.

Sign in separately to each app with its local administrator account. Startup creates an administrator from the server's local `.env` only when that system has none. User accounts and salted password hashes are stored in `SalesUserLogin`, `PurchasingUserLogin`, `WarehouseUserLogin`, and `ConfigurationUserLogin`. Credentials remain in the local environment file.

Docker uses the existing Windows SQL Server instance at `host.docker.internal:1433`, database `TLP Company`. Its dedicated SQL login is scoped to that database; credentials and session configuration come from the local `.env`, which is excluded from the Docker build context and Git. SQL Server must remain running. Business data remains in SQL Server when the app container is restarted or rebuilt.

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

The optional backend commands `npm run dev:all` and `npm run build` launch all five development processes or build the four frontends after their dependencies have been installed. `npm start` inside this backend folder starts only the Node API.

## Per-system APIs and migrations

`Api/SalesApi.js`, `PurchasingApi.js`, `ConfigurationApi.js`, and `WarehouseApi.js` contain their own login, session, profile, account, and business routes. `server.js` connects these four APIs to the shared HTTP server. Both `ClientApi.js` and `router.js` are removed.

| System | API namespace | User table | Account roles |
| --- | --- | --- | --- |
| Sales | `/api/sales` | `SalesUserLogin` | admin, saleshead, sales |
| Purchasing | `/api/purchasing` | `PurchasingUserLogin` | admin, purchasing |
| Warehouse | `/api/warehouse` | `WarehouseUserLogin` | admin, warehouse |
| Configuration | `/api/configuration` | `ConfigurationUserLogin` | admin, configuration |

Each namespace has its own `/auth/login`, `/auth/session`, `/auth/logout`, `/auth/profile`, and `/users` endpoints. Cookies and signed sessions are scoped to the relevant system. An account or session from one system does not authenticate another. Configuration masters use `/api/configuration/masters`; other business paths follow their owning system's prefix. Purchasing actor foreign keys reference PurchasingUserLogin. Shared audit records identify the actor's system as well as the account ID.

All SQL files and database/schema checking live under `migration/`: `schema.sql`, `system-accounts.sql`, `configuration-schema.sql`, `erp-schema.sql`, and `run.js`. Backend startup applies these idempotent migrations before listening. To run only the migrations, use `npm run migrate`; its CLI does not create administrator or business records. Startup creates each system's administrator only when needed. The backend contains the actual local `.env`; no `.env.example` is required.

## Administrator and configuration

The actual local configuration is `.env` inside this server folder. It contains `ADMIN_USERNAME`, `ADMIN_PASSWORD`, a private session secret, and the SQL Server connection settings. Sign in using those administrator credentials. Passwords in `SalesUserLogin` are stored as salted hashes. The `.env` file is excluded from Git; keep a private backup when moving the application to another computer.

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
7. **Warehouse → Supplies Stock** displays category, supplies, UOP, stock totals, lot/storage allocations, and receipt history. It has no stock editing controls.

PR and PO monitoring show posted downstream quantities and remaining balances. Draft documents remain editable; posted documents preserve their source details. Discounts and VAT use decimal arithmetic and the supplier's rounding settings. Shipment choices follow the observed CAS list. Exchange rate is retained as a document reference; line amounts stay in the document currency.

## Configuration

The independent ConfigurationSystem contains ATC, Audit Trail, Bank, Country, Currency, Customer Category, Payment Term, Product Category, Supplies Category, Unit of Product, VAT, Warehouse, and Warehouse Location. Only administrators can change these masters. Deactivation retains referenced records and their history. Audit Trail is read-only and records application mutations without storing passwords or photos.

The observed CAS inputs and limitations are recorded in `docs/cas-purchasing-reference.json`. Blank CAS forms were inspected without saving or posting transactions. Sales retains its existing full-order invoice/delivery relationships described above; CAS printing, unposting, production, and finished-goods allocation are not implemented by the new purchasing workflow.

## Verification

```powershell
npm test
npm run test:browser
```

The default tests run against pure validation, the actual receiving coordinator with an in-memory transactional repository, and mocked browser API routes. They do not start the API or write SQL/business records. Browser tests use installed Google Chrome; run `npm run build` first. Screenshots are saved under `.qa/screenshots/`.

Historical SQL integration suites remain behind the explicit `test:sql` and `test:browser:sql` scripts. They still target the earlier endpoint/hosting layout and need adaptation before use with these independent apps. They create disposable databases and business fixtures; they were not run for this update because test transactions were prohibited. The verified commands above use only pure and mocked tests.
