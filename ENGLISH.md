# magnit-cli — Capabilities & API Endpoints

Base URLs (end in `/api/`): US prod `https://integration.pro-unlimited.com/api/` · EU prod `https://integrationeu.pro-unlimited.com/api/` · sandboxes `csol3`, `web03` (US), `eupmwand3` (EU) · `local` mock.
Auth (feeds): OAuth 2.0 password grant, bearer token (~1799s) with refresh · Source: Magnit API reference v1.1.
All feed calls are asynchronous: POST → `{ ResponseCode, CorrelationId }` → poll status (ID valid 24h) → `Pending | Errored | Completed`.

## auth

| Command | Endpoint |
|---|---|
| `auth login --env <env>` | POST `/oauth/token` (Basic header; `grant_type=password`, `scope=write`, username, password) |
| `auth logout` / `auth status` | local config only |
| (automatic) | POST `/oauth/token` with `grant_type=refresh_token` on expiry or 401 — shape not in the spec, to verify |

## feed — push (`magnit feed submit <feed> [feedId] -f payload.json|xml`)

| Feed | Endpoint | Status endpoint |
|---|---|---|
| `costcenter` | POST `/costcenter/request` | GET `costcenter/request-status/{id}` ⚠ inferred |
| `location` | POST `/location/request` | GET `location/request-status/{id}` ⚠ inferred |
| `manager` | POST `/manager/request` | GET `manager/request-status/{id}` ⚠ inferred |
| `cfreflist` | POST `/cfreflist/request/<feedId>` | GET `cfreflist/request-status/{id}` ⚠ inferred |
| `po` | POST `/po/request/<feedId>` | POST `/po/request-status` ✔ documented |
| `worker-inbound` | POST `/worker/inbound/request/<feedId>` | GET `worker/inbound/request-status/{id}` ⚠ inferred |
| `approval` | POST `/approval/request/<feedId>` | GET `approval/request-status/{id}` ⚠ inferred |
| `onboarding` | POST `/onboarding/inbound/request` ⚠ PDF says `/api/onboarding/...` | GET `onboarding/inbound/request-status/{id}` ⚠ inferred |

## feed — pull (`magnit feed pull <feed> <feedId> --wait`)

| Feed | Endpoint | Status endpoint (returns records) |
|---|---|---|
| `worker-outbound` | POST `/worker/outbound/request/<feedId>` | POST `/worker/outbound/request-status` ✔ |
| `request-outbound` | POST `/request/outbound/request/<feedId>` | POST `/request/outbound/request-status` ✔ |

## feed — tracking

| Command | Endpoint |
|---|---|
| `feed status <correlationId> [--feed f] [--wait]` | the feed's status endpoint (above) |
| `feed list` | local registry (no API call) |
| `correlations [--clear]` | local store (no API call) |

## escape hatch

| Command | Endpoint |
|---|---|
| `call <GET\|POST> <path> [-f body]` | any path relative to the base URL |

## raas — timecards via Reporting as a Service (separate host and auth)

Source: https://magnitglobal.com/reporting-as-a-service. Token host: `https://api.us.magnitglobal.com/wand2/publicapi/v1/get-api-token` (US) · `https://api.eu.magnitglobal.com/...` (EU) · `local` mock. Report URLs come from the report's "RaaS" window. JSON only; POST and GET only.

| Command | Call |
|---|---|
| `raas login --region us\|eu\|local` | POST token URL, JSON `{ credentialKey, clientKey, clientSecret }` → access token (Bearer). Re-auth is automatic on expiry/401; keys last 90 days |
| `raas logout` / `raas status` | local only (status shows key days left) |
| `raas report add\|list\|remove` | local only; stores request/status/data URLs per report name |
| `raas run <report>` | POST `{request-url}` → `{ runid }` (same runid within 15 min) → GET status until `Completed` → GET data |
| `raas check <report> <runId>` | GET `{status-url}` ⚠ default `{request-url}/{runid}` is inferred |
| `raas fetch <report> <runId>` | GET `{request-url}/{runid}/retrievePagedData?page=&size=` → `{ nextpage, totalrecords, totalpages, data }` (size default 5000, max 20000) |

Prerequisites: RaaS permission (Program Representative), a saved **Customizable Report** with the timecard columns (renamed column = renamed JSON key). Timecard fields to include: Billing Line #, engagement, worker, work date, time in/out, labor type, no-lunch flag, hours, notes, status/approval.

## Not in the v1.1 PDF

- **Timecards** — no feed in the Integration API or the supplier Gateway API (Gateway covers staffing requests, reference data, candidates only). Route A (RaaS, above) is built; route B (private time feed) needs the Magnit Integrations team. See `PLAN.md`.
- **`billingItems`** — worker outbound's XSD lists per-worker billing items (`billingItemId, billRate, OTRate, workedHour, billStatus, ...`); not in the PDF examples, unverified.
- **Gateway API for suppliers** — spec only via support ticket.
