# magnit-cli

CLI for Magnit (WAND) VMS data, **focused on timecards**: pull timecard lines out of Magnit as JSON/CSV, plus a generic client for the Magnit Integration API feeds (workers, requests, cost centers, ...).

> Status: **not yet tested against a real Magnit environment** (no credentials yet). Built from public docs and a local mock. Magnit documents **no timecard API**; the working route is **RaaS** (Reporting as a Service) over a saved Customizable Report. See `PLAN.md`.

## Timecards — how to get them

Timecards live in Magnit's WAND platform: weekly, per engagement, lines with in/out times, labor type (Labor, Lunch, multi-rate types), a no-lunch flag, notes, optional allocations, piece-rate units, a `Billing Line #`, and approval status. Neither the Integration API (v1.1) nor the supplier Gateway API exposes them, so:

1. In the Magnit Platform, build and **save a Customizable Report** with the timecard columns you need (renaming a column renames its JSON key).
2. Ask your Program Representative for **RaaS permission**; create RaaS keys in your profile (Credential Key, Client Key, Client Secret — valid 90 days).
3. Open the report's **RaaS** window and copy its request URL.

```bash
magnit raas login --region us                                  # prompts for the three keys
magnit raas report add timecards --request-url <URL from the RaaS window>
magnit raas run timecards --dry-run                            # show the calls, send nothing
magnit raas run timecards --all -o csv --out timecards.csv     # request -> wait -> download all pages
magnit raas status                                             # key expiry countdown
```

Other options: `--size` (default 5000, max 20000), `--page`, `-o json|table|csv|ndjson`, `--no-wait` then `raas check|fetch <report> <runId>`. RaaS will not schedule runs for you; use cron/systemd. Same report re-requested within 15 minutes returns the same run.

Not timecards, but related: Bullhorn VMS Sync / Time & Expense carries Magnit time on the Bullhorn side (use `bh pay-bill timesheet` for that); worker outbound may include per-worker `billingItems` (hours, rates, bill status) — unverified.

## Install

```bash
npm install
npm link        # optional: puts `magnit` / `mg` on your PATH
```

Node >= 22. Copy `.env.example` to `.env` to prefill credentials (`MAGNIT_*`, `MAGNIT_RAAS_*`).

## Quick start (no credentials needed — local mock)

```bash
npm run mock                                                   # terminal 1
magnit raas login --region local --credential-key 1234 --client-key k --client-secret s
magnit raas report add timecards --request-url http://localhost:4010/raas/reports/70183/requests
magnit raas run timecards --all --size 5 -o table              # 12 sample timecard lines
```

Integration API feeds against the same mock:

```bash
magnit auth login --env local --client-id c --client-secret s --username u --password p
magnit feed pull worker-outbound W1 --wait
magnit feed submit costcenter -f cc.json --dry-run --env csol3   # preview, no login needed
```

## Commands

| Command | Purpose |
|---|---|
| `raas login\|logout\|status` | RaaS keys (separate host + auth from `auth`); verifies keys, shows expiry |
| `raas report add\|list\|remove` | Save a Customizable Report's URLs; `list` shows what is still unverified |
| `raas run <report>` | Request → wait → print rows (`--all`, `--size`, `--out file`, `-o json\|table\|csv\|ndjson`) |
| `raas check\|fetch <report> <runId>` | Status / rows of an earlier run |
| `auth login\|logout\|status` | Integration API session (OAuth password grant, auto-refresh) |
| `feed submit <feed> [feedId] -f <file>` | Push a JSON/XML payload |
| `feed pull <feed> [feedId]` | Start an outbound feed |
| `feed status <correlationId>` | Check / `--wait` on a request (24h validity) |
| `feed list` | Known feeds + what still needs verifying |
| `correlations` | Recent correlation IDs recorded locally |
| `call <GET\|POST> <path>` | Any other Integration API endpoint |

Feed options: `-o json|table`, `--wait [--interval s] [--timeout s]`, `--format json|xml`, `--dry-run`.

Endpoints per command: `ENGLISH.md`. Plan and open questions: `PLAN.md`, `TIMECARD_INQUIRY.md`. Developer guide: `AGENTS.md`. Current state: `HAND_OFF.md`.
