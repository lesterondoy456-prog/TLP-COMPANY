# TLP Company Sales System

React app entry and Sales modules for the shared TLP Company workspace. The **Sales** menu contains **Customer**, **Product**, **Sales Order**, **Invoice**, **Delivery Receipt**, and **Shipping Invoice**. Sibling folders provide Purchasing, Warehouse inventory, and Configuration. Records are persisted through the shared Node.js API to SQL Server; business records are never kept in browser local storage.

## Start the complete workspace

From `NODE JS SERVER`:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5188`. The server reads its local `.env` and connects to the `TLP Company` database. Sign in using the administrator account configured there.

## Frontend commands

Run these commands from `SalesSystem`:

```powershell
npm install
npm run dev
npm run build
```

Vite runs on port 5188 and forwards `/api` requests to the Node server on port 5189. For the built application, run `npm start` and open `http://127.0.0.1:5189`.

## Workflow

1. Add customers in **Customer** and products in **Product**.
2. Create a **Sales Order**, choose its customer and items, and set the status to **Confirmed** when ready.
3. Create an **Invoice** from the confirmed order. **Payment** records the total amount received to date.
4. Create a **Delivery Receipt** from the confirmed order. Saving the receipt deducts its quantities from stock; insufficient stock prevents delivery.
5. Create a **Shipping Invoice** from an existing invoice, then enter the shipping date and any applicable carrier, tracking number, or notes. Delivery is optional; this document does not deduct stock again.
6. Use **View** to review or print sales documents.

Each confirmed order supports one full invoice and one full delivery receipt. Each invoice supports one shipping invoice, whose date cannot precede its invoice date. Shipping documents read customer, items, and amounts from the existing sales records. An order linked to an invoice or delivery is locked against editing and deletion. Referenced master records cannot be deleted; mark them inactive instead.

The Sales, Purchasing, Warehouse, and Configuration groups can be expanded or collapsed. The menu search was removed as requested; record search remains available. No sample business records are seeded at startup. Production is excluded.

Product contains all four observed CAS tabs: Basic Info, Customer, Inventory Sched, and Link Supplies. Prices retain six decimal places. Sales orders use the common product currency and their documents preserve it; mixed-currency product lines are rejected. Purchasing connects Supplier and Supplies masters to posted Purchase Requests, Purchase Orders, and Receiving Receipts. Posting a fully allocated receiving receipt updates supplies inventory; Warehouse is read-only. Finished-product stock remains separate because Production is excluded.

See `../NODE JS SERVER/README.md` for the purchasing sequence, permissions, Docker/LAN address, and safe verification commands. Configuration fields come from API metadata, and only Admin can change reference masters.

Administrators use **SalesUserLogin** to create or edit accounts with the **Admin**, **Sales Head**, or **Sales** role. Sales Heads use it to view Sales accounts and create Sales accounts. Click your account at the bottom of the sidebar to edit your own name, username, mobile number, email, and photo. New account passwords need at least 12 characters. Profile photos accept JPG, PNG, or WebP files up to 250 KB.

The customer form's **Sales In-charge** field selects an active Sales account. Its account ID is saved with the assignment, and the account's current name is displayed. Company Id is omitted from the form.

## Source

- `src/pages/Workspace.jsx`: navigation, record lists, search, pagination, and refresh.
- `src/components/SalesForms.jsx`: customer/product/account forms, sales documents, and payment entry.
- `src/pages/Login.jsx`: account sign-in.
- `src/api.js`: API requests and PHP/date formatting.
- `src/styles/global.css`: responsive workspace, forms, and print styles.
