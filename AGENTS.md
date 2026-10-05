# magnit-cli — Developer Guide

**Project**: `magnit-cli` — CLI for the Magnit VMS Integration API (async, feed-based).
**Runtime**: Node.js >= 22, ESM (`"type": "module"`).
**CLI framework**: Commander.js. **Entry point**: `src/index.js`.
**Binaries**: `bin/magnit.js`, `bin/mg.js` (both just import `src/index.js`).
**Sibling project**: `../bh-cli` — same layout and conventions; read its `AGENTS.md` for the barrel/DRY rationale.

## Structure

```
src/
├── index.js            # Commander root
├── lib/
│   ├── config.js       # Conf store (MAGNIT_CONFIG_DIR overrides location, for tests)
│   ├── envs.js         # environment name -> base URL (ends in /api/)
│   ├── auth.js         # password-grant login, refresh, logout (throws, never process.exit)
│   ├── api.js          # per-call axios client; proactive refresh + 401 retry; resolveBaseUrl
│   ├── feeds.js        # REGISTRY of feeds (path, feedId?, status endpoint/style, verify notes)
│   ├── engine.js       # build requests, startFeed, fetchStatus, waitForStatus
│   ├── normalize.js    # ack/status/record flattening across Magnit's differing shapes
│   ├── payload.js      # JSON/XML parse, format detection, case-insensitive pick()
│   ├── correlations.js # local 24h-aware correlation ID store
│   ├── helpers.js      # renderJsonOutput, renderTableOutput, renderKeyValues, renderError
│   ├── raas.js         # RaaS (Reporting as a Service): own Conf file, keys->token, request/status/paged data
│   └── errors.js       # MagnitCliError(message, hint)
└── commands/
    ├── auth.js  correlations.js  call.js
    ├── feed/           # barrel group: index.js + submit/pull/status/list + _shared.js
    └── raas/           # barrel group: index.js + login (login/logout/status) + report + run (run/check/fetch) + _shared.js
dev/mock-server.js      # local mock (npm run mock) — derived from the PDF only
```

## Rules that differ from bh-cli

- **Everything is async.** A push/pull returns a `CorrelationId`; results come from `request-status`. Never assume a POST's response contains data.
- **Add a feed = add an entry to `src/lib/feeds.js`.** Only add a typed command when a feed needs field validation.
- **Errors**: throw `MagnitCliError` (or let axios errors propagate). `src/index.js` renders them once via `renderError`. Do not call `process.exit` in libs or commands (use `process.exitCode`).
- **Responses are text** (`responseType: 'text'`) because Magnit returns XML or JSON; always go through `parseBody()`.
- **RaaS is a separate world** (`raas` group): different host, JSON keys (Credential Key/Client Key/Secret, 90-day expiry), plain `axios` JSON, no `/api/` base, no correlation IDs. Its store is `raas.json` beside the main config so `auth login/logout` never wipes it. Keys are stored (needed to re-auth); there is no refresh token.
- **Never store the user's password.** Client id/secret are stored (needed for refresh).
- **Don't invent endpoints.** Anything not in the PDF must be flagged in a feed's `verify` array.
- **No push commands against production** until the user says so; use `--dry-run` and the mock.

## Workflow

1. `npm run mock` (terminal 1), then with `MAGNIT_CONFIG_DIR=/tmp/mg-test`:
   `node src/index.js auth login --env local --client-id c --client-secret s --username u --password p`
2. Exercise: `feed submit|pull ... --wait`, `feed status`, `correlations`, `call`.
3. Mock knobs: `MOCK_DELAY_MS`, `MOCK_TOKEN_TTL`, `POST /__mock/revoke` (forces a 401), payload containing `FORCE_ERROR` (finishes Errored).
4. **Verify**: `--help` on every command + the mock run above. No lint/test framework configured (same as bh-cli).

## Dependencies

`axios`, `commander`, `chalk`, `cli-table3`, `conf`, `dotenv`, `inquirer`, `ora` (as bh-cli) plus `fast-xml-parser` for XML bodies.

## Status

See `PLAN.md` for phases, the timecard question, and the real-API verification checklist.
