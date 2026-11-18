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

The Socket.IO proxy connects to the authenticated realtime service in the backend. Saves refresh the relevant views in the background without reloading the page or closing drafts. `/Uploads` is reserved; uploaded files are not stored by this backend.

## Accounts and API

Sign in with this app's account from **SalesUserLogin**. Its API namespace is `/api/sales`, with separate login, session, profile, and user endpoints. Its session does not sign in to another system. Administrators manage Admin, Sales Head, and Sales accounts. Sales Heads can view Sales accounts and create Sales accounts. Sales users edit their own profiles.

`src/api.js` makes ordinary same-origin `fetch` requests under `/api/sales`, such as `/api/sales/customers`. The Node server mounts the CommonJS Express router exported by `Api/SalesApi.js` at that prefix; frontend components call HTTP endpoints through the local API helper.

Form validation is organized in `src/helper/validation.js` and runs before fetch. The shared backend `LoginApiSystem.js` handles JWT login, profile and account endpoints while preserving this system's own table and cookie.

## Workflow

Each sidebar item has a named page under `src/pages`. Its forms live inside that page folder or beside the page file. `src/components` contains shared layout and UI. API calls use the full `/api/sales/...` endpoint in the page; `src/api.js` handles HTTP credentials, JSON and errors without adding a hidden URL prefix.

1. Add a customer and product. Product has Basic Info, Customer, Inventory Sched, and Link Supplies tabs.
2. Create a Sales Order with customer/Bill To, dates, document currency, conversion rate, terms, shipment and VAT above its product lines. Customer VAT settings are selected initially and can be overridden for the order. Add optional line/header discounts and confirm when ready.
3. Create its Invoice when sufficient finished-product stock is available. Saving the invoice deducts its saved item quantities once and records the stock-out ledger in the same transaction. The Invoice monitor shows one row per SI; expand a row to see its items.
4. Select that Invoice to create its Delivery Receipt. The DR copies the saved invoice items and quantities without prices or another stock deduction, even if Sales Order quantities have since changed. Each invoice supports one full DR.
5. Create a Shipping Invoice from an existing invoice; this does not deduct stock again.

Each order supports one full invoice and one full delivery receipt. Product prices retain six decimal places in a common source currency. Rate converts those prices to the selected document currency. The Bill To customer's decimal settings determine totals, up to six places; invoice payments retain that precision. Available currencies, terms and VAT codes come from Configuration. The customer VAT selection defaults onto the order and remains editable. Sales In-charge selects an active Sales account by ID. This app contains Sales navigation and SalesUserLogin only, without Branch selection.

The Product monitor includes descriptions, units, pricing, approvals and remarks. Product Color, Thickness, Plan Type, EOL Date and EOL Remarks are omitted; Tag Color remains distinct. Inventory schedules display fixed Monthly or Quarterly reference rows and are not saved as schedule records. **Inventory** includes icon actions for transaction history, manual stock in and manual stock out for all Sales roles. Each confirmed manual entry records its source/destination, reason, date, quantity and actor; safe retries cannot apply it twice. History shows separate quantities in/out, actual stock before/after, invoice and order references, customer/destination, actor username and the linked DR address when available. Earlier DR stock-outs remain visible with unknown historical balances left blank. Stock and open views refresh without losing drafts, with responsive mobile cards.

After invoicing, the Sales Order editor permits only existing line quantities, with the actual invoiced and delivered quantities as minimums. Invoice, delivery and shipping documents retain their saved items and totals. Before documents exist, the regular form edits all order details and items. Desktop navigation retains its collapsible icon rail preference; mobile navigation opens a full labeled drawer.

## Invoice preview and printing

Invoice **View** shows the TTI preprinted Sales Invoice form, with a fit-to-width preview and zoom. **Download Excel** downloads a real `.xlsx` workbook populated from the saved invoice. Open it in Excel and print the Invoice worksheet onto preprinted **A4 portrait** paper at **100%**. Continuation pages use manual page breaks on the same worksheet. The workbook retains the supplied Excel template's margins, columns, row heights and merged fields. The company heading, grid, labels, preprinted serial number and printer details are already on the paper and are omitted from the workbook. Check alignment against a real sheet before using a printer for the first time.

Each page has fourteen physical item slots. Long descriptions continue into additional slots and invoices continue onto another page when needed; final totals appear only on the last page. The system SI number identifies every page. Unit prices display five decimal places and amounts two, following the Excel reference, while the saved prices and totals retain their original precision.

The buyer is **Bill To**, and **Ship To** uses the Sales Order customer's DR Name. New invoices capture the buyer TIN and business style, Ship To name, VAT classification and preparer's name at issuance. Missing historical values stay blank. Prices, quantities, discounts and totals come from the saved invoice, so subsequent Sales Order quantity or master-data changes do not alter the invoice. The discount slot shows the saved monetary invoice discount, including line and header discounts. Downloading a workbook does not create or update a transaction. No approval workflow is added.

## Delivery Receipt preview and printing

Create a DR from an eligible saved Invoice. Its quantities, UOP, product codes and descriptions are fixed to that invoice. Enter the delivery date and address; Received by is optional because the recipient may sign the printed copy later. The list, form, preview and Excel output contain no prices or monetary totals.

**Download Excel** returns a genuine `.xlsx` using the supplied **Letter portrait** template at **100%**, with fourteen item slots per page. All continuation pages are on one worksheet with manual page breaks. Original margins, columns, row heights and populated-field positions are retained. The preview shows the form; the Excel output contains data for the preprinted paper. Final quantity and signatures appear only on the last page. Neither viewing, downloading nor creating the DR changes stock.

The change to invoice-based stock posting does not recalculate old balances or invent movements for previously issued invoices. Existing delivery receipts retain their actual historical stock-out classification.

SQL, migrations, and the backend's local `.env` remain in `NODE JS SERVER`. See its README for backend startup and Docker commands.
