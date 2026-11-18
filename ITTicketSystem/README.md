# TTI ITTicketSystem

The IT support workspace uses the same TTI theme, account screens and responsive layout as the other company systems. It has its own React package and runs on port **5193**.

Department users submit tickets from **Help Desk** inside Sales, Purchasing, Warehouse or Configuration. They can see only their own tickets. IT accounts use this application to monitor tickets, update status and correct status notes while retaining the original audit history.

## Local development

Run the shared backend in `NODE JS SERVER` with SQL Server available, then run:

```powershell
npm ci
npm run dev
```

Open `http://localhost:5193`. Sign in with a separately provisioned IT account. Administrators can manage `ITTUserLogin` accounts; the other supported role is `IT Support`.

The Vite proxy forwards `/api` to `http://localhost:5188`. Docker sets `API_PROXY_TARGET=http://nodejs-server:5188` and builds this project independently:

```powershell
cd "..\NODE JS SERVER"
docker compose up -d --build it-ticket-system
```

## Ticket workflow

- Choose **Request** or **Support Request** and enter an initial note. Category has no default.
- Support requests may include up to five PDF, image or Office files, at most 10 MB each. Requests have no attachments.
- A Request moves from Pending to On going after IT confirms **Proceed**. Completing a Request requires a note and confirmation that the item return was verbally confirmed.
- Support requests can move through Pending, In progress and On going to Complete or Declined.
- Status changes require a note except On going. Note corrections append an audit event and preserve the original author, note and time.
- Timelines display Philippine time (`Asia/Manila`). Ticket lists and open details refresh periodically; manual refresh is also available.

Production output is generated with `npm run build`; dependencies, builds and local environment files are ignored by Git.
