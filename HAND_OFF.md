# magnit-cli — Hand-off

Updated: 2026-10-05 · Read `AGENTS.md` (conventions) and `PLAN.md` (phases) alongside this. This file is the "where things stand" snapshot.

## One-paragraph summary

`magnit-cli` is a Node 22 ESM Commander CLI for Magnit (WAND), **focused on timecards**. Magnit has no timecard API, so the timecard route is **RaaS** (a saved Customizable Report pulled as JSON/CSV via the `raas` command group). A generic client for the asynchronous, feed-based Integration API (`feed`, `auth`, `call`) is also built, modelled on `../bh-cli`. Everything is tested only against a local mock: the project has **never talked to a real Magnit environment** (no RaaS keys, credentials or sandbox yet).

## State

| Area | State |
|---|---|
| Scaffold, bins `magnit` / `mg`, `lib/` | Done |
| Auth (`auth login\|logout\|status`, proactive + 401 refresh) | Done, mock-tested only |
| Feed engine: `feed submit\|pull\|status\|list`, `--wait`, `--dry-run`, JSON + XML | Done, mock-tested only |
| `correlations`, `call` | Done |
| Mock server `dev/mock-server.js` (`npm run mock`) | Done |
| Docs: `README.md`, `AGENTS.md`, `ENGLISH.md`, `PLAN.md` | Done |
| Typed per-feed commands with field validation (PLAN phase 5) | **Not started** |
| Timecards (PLAN phase 6) | **Blocked** — no documented API (see below) |
| RaaS group: `raas login\|logout\|status`, `raas report add\|list\|remove`, `raas run\|check\|fetch` (json/table/csv/ndjson, paging, 90-day key warning) | Done, mock-tested only; needs real RaaS keys + a saved report |
| Real-API verification (PLAN phase 7) | **Blocked** — no credentials |
| git | Not a repo; nothing committed (the parent `../` dir isn't a repo either) |

## Source material

- **Magnit API reference v1.1** (2025-03-26): https://magnitglobal.com/content/dam/prounlimited/content/support/magnit-api-reference-document.pdf — the only real spec. 96 pages; feeds, base URLs, auth, field tables, XSD/JSON schemas. Convert with `pdftotext -layout` (WebFetch can't read it; the first attempt returned binary).
- Landing page: https://magnitglobal.com/us/en/workforce-management-platform/magnit-platform-integrations/magnit-api.html (Client API, RaaS, Gateway API for suppliers).
- RaaS: https://magnitglobal.com/reporting-as-a-service — token endpoints `https://api.{us|eu}.magnitglobal.com/wand2/publicapi/v1/get-api-token`; Client Key + Client Secret + Credential Key (90-day); run id → status → fetch; `page`/`size` (default 5,000, max 20,000).
- Gateway API (suppliers): https://magnitglobal.com/us/en/workforce-management-platform/magnit-platform-integrations/magnit-api/supplier-api.html — no public spec; via support ticket.
- Bullhorn side: https://kb.bullhorn.com/vmssync/Content/VMSSync/Topics/portalSupportList.htm — lists "Magnit API" as a VMS-for-Jobs portal; says nothing about timecards.
- `magnit-bullhorn-timekeeping.md` — plain-English overview and flow chart, rewritten 2026-10-05 to show only confirmed flow; the old "Time Source must be `WAND`" claim was unsourced and is now an inquiry question.

## Key facts about the API (from the PDF)

- Base URLs end in `/api/`: US prod `https://integration.pro-unlimited.com/api/`, EU prod `https://integrationeu.pro-unlimited.com/api/`, sandboxes CSOL3 / WEB03 (US) and EUPMWAND3 (EU) on `*.prounlimited.com` (no hyphen — as written in the PDF).
- Auth: `POST /oauth/token`, Basic header (client creds from the Magnit Integrations team) + form body `grant_type=password`, `scope=write`, `username`, `password`. Returns bearer token, `expires_in` ≈ 1799, `refresh_token`.
- Verbs: POST and GET only. Status codes: 200 / 400 / 401 / 500 only.
- Every request is async; `CorrelationId` valid 24 hours; status values `Pending | Errored | Completed`.
- Push feeds: costcenter, location, manager, cfreflist, po, worker inbound, approval, onboarding. Pull feeds: worker outbound, request outbound. Several take a Magnit-assigned `<feed identifier>` path segment.
- **No timecard / time-entry feed anywhere in the PDF.**

## Decisions made (and why)

- **Generic engine + registry instead of one command per feed.** The feeds share one workflow; adding a feed (e.g. a timecard feed) is one registry entry.
- **Client built per call, not a module singleton** (differs from bh-cli's `api.js`), so login in-process and `--dry-run` without a session work. No `process.argv` sniffing for "is this an auth command".
- **Libs throw `MagnitCliError`; only `src/index.js` prints and exits.** bh-cli's libs call `process.exit` directly.
- **Password never stored**; client id/secret are (needed for refresh). If refresh fails the user re-logs in.
- **Responses kept as text** and parsed by sniffing (`parseBody`), because Magnit answers in XML or JSON depending on the request.
- **Onboarding path de-duplicated** to `onboarding/inbound/request` (the PDF's `/api/onboarding/...` would double `/api/`). Flagged in the registry; `--path` overrides.
- **Status endpoints for 7 feeds are inferred.** The PDF only documents `<<feedtype>>/request-status` generically; explicit ones exist for `po`, `worker/outbound`, `request/outbound`. Inferred feeds use `GET {statusBase}/request-status/{id}`. Flagged via each feed's `verify` array and shown by `magnit feed list`.

## WAND findings (checked 2026-10-05)

- **NovaTime is unrelated to Magnit.** No public link found; the NovaTime meeting notes describe a separate NovaTime -> Microsoft Fabric -> Bullhorn pipeline (CA wage-and-hour / PAGA analytics). Out of scope for this project.
- **WAND = Magnit's own VMS** (Pro Unlimited; `prowand.pro-unlimited.com`, `wand2` in RaaS URL). Timecards live there, entered per engagement (UI help PDFs under `prowand.pro-unlimited.com/help/worker/`).
- **Timecard shape (from worker QRGs):** weekly range ending Sunday (submit by Sun 11:59PM PT; some programs say Sat), per-day lines with in/out, labor type (Labor/Lunch/other multi-rate types), `No Lunch Break Taken` flag, Billing Notes, optional allocations, piece-rate = units per task; submit -> manager approval; each saved line gets a `Billing Line #` (old term: Timecard ID). Supplier nav: Billing = search/create timecards + expenses, **export billing**, confirm expenses; Reporting = scheduled reports.
- **Gateway API (suppliers) does not cover time**: only staffing requests, reference data, candidate create/submit. Spec via support ticket; credentials generated in the VMS.
- **Bulk Upload in WAND** is for engagements (Fill / staffing / payroll / managed services), not timecards.
- **Best remaining route for time data = A (RaaS Customizable Report)**; see "Research on the remaining routes" below.

## Research on the remaining routes (2026-10-05)

**Route A, RaaS (best bet).** From https://magnitglobal.com/reporting-as-a-service (no separate spec PDF exists; the page is the spec):
- Auth: `POST https://api.{us|eu}.magnitglobal.com/wand2/publicapi/v1/get-api-token`, JSON body `{credentialKey (numeric), clientKey, clientSecret}` -> access token, used as Bearer. Keys last 90 days (configurable 30/60), expiry emails, new key overlaps: old one expires a week after new is created. Direct-login users must log in at least every 60 days.
- Flow: POST report (returns `runid`, UUID; same report re-requested within 15 min returns the same runid) -> GET status by runid (`runid, reportid, status, message`; `Completed`) -> GET data (JSON). Paged: `https://{baseurl}/reports/{reportid}/requests/{runid}/retrievePagedData?page=2&size=2000`; `page` default 1, `size` default 5000, max 20000 (lowercase, case-sensitive); response has `nextpage, totalrecords, totalpages, data`. Errors `application/problem` JSON, 2xx/4xx/500.
- Only **Customizable Reports** support RaaS; save the report, then a "RaaS" link shows the exact token + report endpoints (this gives `{baseurl}` and `{reportid}`). **Renaming a report column changes the JSON key.** Platform does not schedule RaaS calls; we must. Available to Client and Supplier users with RaaS permission (ask Program Representative).
- Unknown: which Customizable Report data sources include timecard lines, and the field set. Not public (Magnit Platform User Guide, login required).

**Route B, Integration API.** Re-grepped the v1.1 PDF: no timecard feed. But **Worker Outbound's XSD (PDF p.67-68) has `billingItems/billingItem`**: `billingItemId, billRate, OTRate, workedHour, dateInvoiced, billStatus, statusReason, hourPerWeek, hourPerDay, rateApplicationType, currency`. Billing-line level, not in-out punches, and absent from the PDF's example payloads, so unverified; could be a partial time/billing source via `worker-outbound` (read-only, safe to test first). Approval feed also has an optional `BillingID`.

**Bullhorn side.** Bullhorn Time & Expense "VMS Exchange" imports VMS time files (manual upload or an email inbox; custom mapping templates for unsupported VMSs; docs name only Beeline and Fieldglass). "VMS Time" automates retrieval; no public detail on method or on Magnit. So Bullhorn most likely gets Magnit time via file/report, which fits a scheduled WAND report; ask Bullhorn how their Magnit connector pulls time.

**Dead ends:** Gateway API (no time), WAND Bulk Upload (engagements only), NovaTime.

**Built (route A):** `src/lib/raas.js` + `src/commands/raas/`. Status/data URLs default to `{requestUrl}/{runid}` and `{requestUrl}/{runid}/retrievePagedData` (documented pattern) and are flagged as inferred; override per report with `--status-url/--data-url` (use `{runid}`). Token response field is guessed (`access_token|accessToken|token`). Mock: `/wand2/publicapi/v1/get-api-token`, `/raas/reports/<id>/requests...` (report id 99999 fails; `MOCK_RAAS_ROWS`). Usage: `raas login --region local --credential-key 1234 --client-key k --client-secret s`, `raas report add timecards --request-url http://localhost:4010/raas/reports/70183/requests`, `raas run timecards --all -o csv`.

**Do next:** (1) ask your Magnit Program Rep for RaaS permission + which Customizable Report has timecard lines (inquiry Q2/Q5); (2) when credentials arrive, pull `worker-outbound` and check whether `billingItems` appears; (3) meanwhile build the `raas` command group against a mock (auth, run, status, paged fetch, flatten `data`) since the contract is fully public, with the report id/base URL as config.

## Open questions / blockers

1. **Where do timecards live?** See `TIMECARD_INQUIRY.md` (draft message, **not sent**). Routes: (A) RaaS saved report, (B) a timecard feed from Magnit Integrations, (C) Bullhorn-side only via VMS Sync / Time & Expense (then use `bh pay-bill timesheet`, not this CLI).
2. **Credentials + sandbox** (client id/secret, API username/password, feed identifiers). Issued by the Magnit Integrations team / Program Representative.
3. **RaaS permission** for the API user, if route A.
4. Real-API checklist in `PLAN.md` §"Real-API verification checklist" (status prefixes, onboarding path, hostnames, refresh shape, JSON casing, request-outbound status shape, feed identifiers).

## How to run it

```bash
cd /home/lham/dev/cli/magnit-cli
npm install                                  # already done; node_modules present
npm run mock                                 # terminal 1 → http://localhost:4010/api/
export MAGNIT_CONFIG_DIR=/tmp/mg-test        # isolate the session store
node src/index.js auth login --env local --client-id c --client-secret s --username u --password p
node src/index.js feed pull worker-outbound W1 --wait --interval 1
echo '{"x":1}' > /tmp/cc.json
node src/index.js feed submit costcenter -f /tmp/cc.json --wait --interval 1
node src/index.js feed submit costcenter -f /tmp/cc.json --dry-run --env csol3   # no login needed
```

Mock knobs: `PORT`, `MOCK_DELAY_MS` (default 3000), `MOCK_TOKEN_TTL` (default 1799), `POST /__mock/revoke` (next call gets 401 → exercises refresh), payload containing `FORCE_ERROR` (request finishes `Errored`). The mock is derived from the PDF only — passing against it proves spec conformance, not real-API behaviour.

## Verified so far (against the mock, 2026-10-05)

Login (good + bad password); push and pull with `--wait` in JSON and XML; Errored outcome (exit code 1); reactive 401 → refresh → retry (confirmed in the mock log); proactive refresh with 30s tokens; polling timeout; missing feed id; wrong direction (push vs. pull); malformed JSON file; unknown correlation id; `call`; `--help` on every command. No lint/test framework (same as bh-cli) — `--help` + mock run is the standard.

## Gotchas

- `npm run mock` binds :4010; `--env local` points there. Don't `pkill -f mock-server` from a shell whose command line contains that string (it kills itself, exit 144) — use `pgrep`/`kill <pid>`.
- Use `MAGNIT_CONFIG_DIR` in tests or you'll overwrite the real stored session in `~/.config/magnit-cli`.
- Outbound status shapes differ: worker outbound → `Data.DataRecord[].Field[{Name,Value}]`; request outbound → `dataRecords[].fields[{name,value}]` with no status wrapper (treated as Completed). `normalize.js` handles both; XML variants are guessed (the PDF shows XML only as XSD).
- `.env` is gitignored; only `.env.example` is meant to be tracked.
- Never run push commands against `us-prod` / `eu-prod` without the user saying so.

## Suggested next steps

1. Send `TIMECARD_INQUIRY.md` (edit the brackets first): RaaS permission, the timecard report, any private time feed, sandbox. Also ask Bullhorn how their Magnit connector pulls time.
2. When RaaS keys arrive: `raas login --region us`, `raas report add timecards --request-url <RaaS window URL>`, `raas run timecards --dry-run`, then a real run. Update `VERIFY` in `src/lib/raas.js`, `PLAN.md` and `ENGLISH.md` as items are confirmed.
3. Once the real column set is known: a `timecards pull` that selects/renames columns and normalises dates/hours (PLAN phase 7); optional reconcile against `bh pay-bill timesheet` (phase 8).
4. If Integration API credentials arrive: `auth login --env csol3`, pull `worker-outbound` (read-only), check whether `billingItems` appears, work through the Integration API checklist in `PLAN.md`.
5. Optional: `git init`, first commit.
