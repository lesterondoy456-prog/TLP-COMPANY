# TLP Company Systems

A shared React workspace for Sales, Purchasing, Warehouse inventory, and Configuration, backed by Node.js and the SQL Server database **TLP Company**. Signed login sessions check the current user and role in the database on each request.

## Folders

```text
TLP COMPANY/
  NODE JS SERVER/   Node.js API, SQL schema, authentication, local .env
    tests/          In-memory workflow and mocked browser checks
  SalesSystem/      Shared app entry, login, and Sales modules
  PurchasingSystem/ Supplier, Supplies, PR, PO, and Receiving modules
  WarehouseSystem/  Read-only supplies stock and receipt history
  ConfigurationSystem/ CAS reference masters and audit trail
```

## Run

Requires Node.js 22 or later, SQL Server, and Microsoft ODBC Driver 18 for SQL Server. The configured local instance is `.\MSSQLSERVER01` using your Windows account.

## Docker and LAN access

From this `NODE JS SERVER` folder:

```powershell
docker compose up -d --build
docker compose ps
```

Open **http://192.168.1.5:5189** from this computer or another device on the same Wi-Fi/LAN. This is the computer's current LAN address and may change when the router assigns another address. The container listens on all host interfaces at port 5189. If Windows Firewall blocks another device, run `allow-lan.ps1` from an Administrator PowerShell to permit only this app port from the local subnet.

Sign in with the local administrator credentials configured in `.env`. The existing administrator is active with role `admin` in `dbo.SalesUserLogin`; the database stores a salted password hash. Credentials remain in the local environment file.

Docker uses the existing Windows SQL Server instance at `host.docker.internal:1433`, database `TLP Company`. Its dedicated SQL login is scoped to that database; credentials and session configuration come from the local `.env`, which is excluded from the Docker build context and Git. SQL Server must remain running. Business data remains in SQL Server when the app container is restarted or rebuilt.

```powershell
docker compose logs --tail 50
docker compose restart
docker compose down
```

`docker compose down` stops the app; it does not delete the SQL database. Start the stack again with `docker compose up -d`.

## Local development

```powershell
cd "NODE JS SERVER"
npm install
npm --prefix ../SalesSystem install
npm run dev
```

Open http://127.0.0.1:5188. The API runs on http://127.0.0.1:5189. Startup creates the database and tables if they do not exist, then creates the first administrator if needed. Your Windows account needs permission to create the database on first startup; subsequent runs use the existing database.

For a single production-style server:

```powershell
npm run build
npm start
```

Then open http://127.0.0.1:5189.

## Administrator and configuration

The actual local configuration is `.env` inside this server folder. It contains `ADMIN_USERNAME`, `ADMIN_PASSWORD`, a private session secret, and the SQL Server connection settings. Sign in using those administrator credentials. Passwords in `SalesUserLogin` are stored as salted hashes. The `.env` file is excluded from Git; keep a private backup when moving the application to another computer.

The first administrator is named Lester. Add your mobile number, email, and profile photo through the profile form. Account roles are enforced by the API and shown in **SalesUserLogin**.

| Role | Account permissions |
| --- | --- |
| Admin (`admin`) | Full system access. Creates and edits Admin, Sales Head, and Sales accounts. |
| Sales Head (`saleshead`) | Uses business modules, reads configuration, views Sales accounts, and creates Sales accounts. |
| Sales (`sales`) | Uses business modules, reads configuration, and edits its own profile. |

**Sales In-charge** selects an active Sales account. Customer assignments reference the account ID, so account name changes appear on the customer record. The customer form omits Company Id.

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

The configuration group contains ATC, Audit Trail, Bank, Country, Currency, Customer Category, Payment Term, Product Category, Supplies Category, Unit of Product, VAT, Warehouse, and Warehouse Location. Only administrators can change these masters. Deactivation retains referenced records and their history. Audit Trail is read-only and records application mutations without storing passwords or photos.

The observed CAS inputs and limitations are recorded in `docs/cas-purchasing-reference.json`. Blank CAS forms were inspected without saving or posting transactions. Sales retains its existing full-order invoice/delivery relationships described above; CAS printing, unposting, production, and finished-goods allocation are not implemented by the new purchasing workflow.

## Verification

```powershell
npm test
npm run test:browser
```

The default tests run against pure validation, the actual receiving coordinator with an in-memory transactional repository, and mocked browser API routes. They do not start the API or write SQL/business records. Browser tests use installed Google Chrome; run `npm run build` first. Screenshots are saved under `.qa/screenshots/`.

Legacy SQL integration suites are available only through explicit `test:sql` and `test:browser:sql` scripts. They create disposable databases and business fixtures; they were not run for this update because real test transactions were prohibited.
