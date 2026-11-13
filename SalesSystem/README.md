# TLP Company Sales System

Independent React/Vite project for TLP Company Sales, on port **5188**. Its menu contains Customer, Product, Sales Order, Invoice, Delivery Receipt, Shipping Invoice, and SalesUserLogin. It owns its package, lockfile, source, login, styles, build, and Docker image. Other frontend projects are not imported into this app.

## Start the backend

From `NODE JS SERVER`:

```powershell
npm ci
npm run dev
```

The API runs on port 5189 and reads its own local `.env`. Start this frontend separately using the commands below. Sales authenticates only against `SalesUserLogin`, through `/api/sales/auth/...`; its session is separate from the other systems.

## Frontend commands

Run these commands from `SalesSystem`:

```powershell
npm ci
npm run dev
npm run build
```

Vite runs on port 5188 and proxies `/api/sales` to the Node server on port 5189. For the built application, run `npm start`, also on port 5188. The Docker/LAN address is **http://192.168.1.5:5188**.

## Workflow

1. Add customers in **Customer** and products in **Product**.
2. Create a **Sales Order**, choose its customer and items, and set the status to **Confirmed** when ready.
3. Create an **Invoice** from the confirmed order. **Payment** records the total amount received to date.
4. Create a **Delivery Receipt** from the confirmed order. Saving the receipt deducts its quantities from stock; insufficient stock prevents delivery.
5. Create a **Shipping Invoice** from an existing invoice, then enter the shipping date and any applicable carrier, tracking number, or notes. Delivery is optional; this document does not deduct stock again.
6. Use **View** to review or print sales documents.

Each confirmed order supports one full invoice and one full delivery receipt. Each invoice supports one shipping invoice, whose date cannot precede its invoice date. Shipping documents read customer, items, and amounts from the existing sales records. An order linked to an invoice or delivery is locked against editing and deletion. Referenced master records cannot be deleted; mark them inactive instead.

This app contains only Sales navigation and SalesUserLogin. The menu search was removed; record search remains available. Startup creates the required administrator only when absent and does not seed business records. Production is excluded.

Product contains all four observed CAS tabs: Basic Info, Customer, Inventory Sched, and Link Supplies. Prices retain six decimal places. Sales orders use the common product currency and their documents preserve it; mixed-currency product lines are rejected. Product links read the common Supplies master through SalesApi. Purchasing and Warehouse run as separate projects and use their own APIs and logins.

See `../NODE JS SERVER/README.md` for all app ports, per-system APIs, migration commands, and safe verification commands.

Administrators use **SalesUserLogin** to create or edit accounts with the **Admin**, **Sales Head**, or **Sales** role. Sales Heads use it to view Sales accounts and create Sales accounts. Click your account at the bottom of the sidebar to edit your own name, username, mobile number, email, and photo. New account passwords need at least 12 characters. Profile photos accept JPG, PNG, or WebP files up to 250 KB.

The customer form's **Sales In-charge** field selects an active Sales account. Its account ID is saved with the assignment, and the account's current name is displayed. Company Id is omitted from the form.

## Source

- `src/pages/Workspace.jsx`: navigation, record lists, search, pagination, and refresh.
- `src/components/SalesForms.jsx`: customer/product/account forms, sales documents, and payment entry.
- `src/pages/Login.jsx`: account sign-in.
- `src/api.js`: API requests and PHP/date formatting.
- `src/styles/global.css`: responsive workspace, forms, and print styles.
