# magnit-cli — Plan

Updated: 2026-10-05 · Sources: Magnit API reference v1.1 (PDF), Magnit RaaS page, WAND worker/supplier help PDFs, Bullhorn VMS Sync KB.

## Goal

Get **timecards** out of Magnit (WAND) with a CLI in the same shape as `bh-cli` (Commander, ESM, `lib/` + `commands/`), so they can be reconciled against Bullhorn timesheets and payroll. Everything else (Integration API feeds) is secondary.

## What Magnit exposes

| Surface | Timecards? | Notes |
|---|---|---|
| **RaaS** (Reporting as a Service) | **Yes, via a saved Customizable Report** | Own host + keys; JSON; paged. Built (`raas` group). |
| Integration API v1.1 (feeds) | No feed | Cost center, location, manager, ref lists, PO, worker in/out, approval, onboarding, request out. Worker outbound XSD has `billingItems` (hours, rates, bill status) — unverified. |
| Gateway API (suppliers) | No | Staffing requests, reference data, candidate submission only. |
| WAND Bulk Upload | No | Engagements only (fill / staffing / payroll). |
| WAND Billing > export (UI) | Manual | Suppliers can export billing from the UI; no API. |
| NovaTime | Unrelated | Separate time-clock vendor; a separate NovaTime→Fabric→Bullhorn analytics project. |

Timecard shape (worker QRGs): weekly, per engagement; per-day lines with in/out, labor type (Labor/Lunch/multi-rate), no-lunch flag, notes, optional allocations, piece-rate units; each saved line has a `Billing Line #`; submit → manager approval (deadline Sunday 11:59pm PT, some programs Saturday).

## Phases

- [x] **1. Scaffold** — package, bins `magnit`/`mg`, `lib/`
- [x] **2. Auth** — `auth login|logout|status` (Integration API session)
- [x] **3. Mock server** — `npm run mock`; Integration API + RaaS endpoints
- [x] **4. Generic feed engine** — `feed submit|pull|status|list`, `call`, `correlations`
- [x] **5. RaaS command group (timecard route A)** — `raas login|logout|status|report|run|check|fetch`; json/table/csv/ndjson; paging; 90-day key warning. Mock-tested only.
- [ ] **6. Real RaaS verification** — needs RaaS keys + a saved timecard report (see `TIMECARD_INQUIRY.md`)
- [ ] **7. Timecard shaping** — once the real column set is known: `timecards pull` that selects/renames columns, normalises dates/hours, one row per Billing Line #
- [ ] **8. Reconcile** (optional) — compare against Bullhorn timesheets (`../bh-cli` `pay-bill timesheet`)
- [ ] **9. Typed Integration API commands** (workers, requests, ...) — low priority

## Blockers / next actions

1. **Send `TIMECARD_INQUIRY.md`** to the Program Representative: RaaS permission, which report holds timecard lines, any private time feed, sandbox.
2. Ask **Bullhorn** how their Magnit connector pulls time (likely a scheduled report file).
3. When RaaS keys exist: `raas login --region us`, `raas report add`, `raas run <name> --dry-run`, then a real run; update `VERIFY` in `src/lib/raas.js`.
4. If Integration API credentials arrive: `worker-outbound` pull (read-only) and check whether `billingItems` appears.

## RaaS items to verify against the real API

1. Token response field name (`access_token` / `accessToken` / `token`) and `expires_in`.
2. Status URL shape (derived as `{request-url}/{runid}`; override with `--status-url`).
3. Status values other than `Completed`.
4. Which Customizable Report data source carries timecard lines, and its columns.
5. Column rename → JSON key behaviour (documented; confirm).
6. Whether supplier-user reports see all workers or only their own.

## Integration API verification checklist (secondary)

1. Generic `<<feedtype>>/request-status` prefix per feed (inferred from `po/request-status`).
2. Onboarding path: PDF says `/api/onboarding/inbound/request`, base URL already ends `/api/`.
3. Prod host is `pro-unlimited.com` (hyphen); sandboxes are `prounlimited.com` — as written in the PDF.
4. Refresh-token request shape (spec only documents the password grant).
5. Status JSON casing (`correlationId` vs `CorrelationId`) — normalised on read.
6. Request-outbound status response has no status wrapper in the example.
7. Feed identifiers: assigned by Magnit per integration — need yours.
8. No push commands against production until you say so.
