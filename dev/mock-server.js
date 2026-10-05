// dev/mock-server.js — Local stand-in for the Magnit Integration API (no credentials needed).
//
// Built ONLY from "Magnit API" reference v1.1, so it proves the CLI matches the spec — not that the
// real Magnit behaves this way. Run:  npm run mock   then   magnit auth login --env local
//
// Env knobs:
//   PORT=4010                port
//   MOCK_DELAY_MS=3000       how long a request stays Pending
//   MOCK_TOKEN_TTL=1799      access token lifetime in seconds
//   RaaS (separate host/auth in real life; same port here, under /wand2/ and /raas/):
//     POST /wand2/publicapi/v1/get-api-token   body { credentialKey, clientKey, clientSecret } (clientSecret "wrong" -> 401)
//     POST /raas/reports/<id>/requests         -> { runid }   (same runid within 15 min per report; id 99999 finishes Failed)
//     GET  /raas/reports/<id>/requests/<runid> -> status
//     GET  /raas/reports/<id>/requests/<runid>/retrievePagedData?page=&size=   (MOCK_RAAS_ROWS rows, default 12)
// Test helpers:
//   POST /__mock/revoke      invalidates all access tokens (refresh tokens survive) -> next call gets 401
//   a payload containing FORCE_ERROR makes that request finish as Errored

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4010);
const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 3000);
const TOKEN_TTL_S = Number(process.env.MOCK_TOKEN_TTL ?? 1799);

const accessTokens = new Map(); // token -> expiresAt
const refreshTokens = new Set();
const jobs = new Map(); // correlationId -> job

const PUSH_BASES = ['costcenter', 'location', 'manager', 'cfreflist', 'po', 'worker/inbound', 'approval', 'onboarding/inbound'];
const PULL_BASES = ['worker/outbound', 'request/outbound'];

const RAAS_ROWS = Number(process.env.MOCK_RAAS_ROWS ?? 12);
const raasRuns = new Map(); // runid -> run
const raasLatest = new Map(); // reportId -> run (for the 15-minute de-dup)

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function issueTokens() {
  const access = `mock-access-${randomUUID()}`;
  const refresh = `mock-refresh-${randomUUID()}`;
  accessTokens.set(access, Date.now() + TOKEN_TTL_S * 1000);
  refreshTokens.add(refresh);
  return { access_token: access, token_type: 'bearer', refresh_token: refresh, expires_in: TOKEN_TTL_S, scope: 'write' };
}

function handleToken(req, res, rawBody) {
  if (!req.headers.authorization?.startsWith('Basic ')) return send(res, 401, { error: 'invalid_client' });
  const form = new URLSearchParams(rawBody);
  const grant = form.get('grant_type');

  if (grant === 'password') {
    if (form.get('scope') !== 'write') return send(res, 400, { error: 'invalid_scope' });
    if (!form.get('username') || !form.get('password') || form.get('password') === 'wrong') {
      return send(res, 401, { error: 'invalid_grant' });
    }
    return send(res, 200, issueTokens());
  }
  if (grant === 'refresh_token') {
    const token = form.get('refresh_token');
    if (!refreshTokens.has(token)) return send(res, 401, { error: 'invalid_grant' });
    refreshTokens.delete(token);
    return send(res, 200, issueTokens());
  }
  return send(res, 400, { error: 'unsupported_grant_type' });
}

function isAuthorized(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const expiresAt = match && accessTokens.get(match[1]);
  return Boolean(expiresAt && expiresAt > Date.now());
}

const ack = (xml, correlationId) => (xml
  ? [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><RequestAcknowledgement xmlns="http://integration.prounlimited.com/xsd"><ResponseCode>200</ResponseCode><CorrelationId>${correlationId}</CorrelationId></RequestAcknowledgement>`, 'application/xml']
  : [{ ResponseCode: 200, CorrelationId: correlationId }, 'application/json']);

function sampleRecords(base) {
  if (base === 'worker/outbound') {
    return [
      { 'Magnit Worker ID': '1001', GUID: 'a1b2c3', 'First name': 'Ada', 'Last Name': 'Lovelace', Email: 'ada@example.test', 'Engagement ID': '5001', 'Engagement Status': 'Active', 'Job Title': 'Analyst' },
      { 'Magnit Worker ID': '1002', GUID: 'd4e5f6', 'First name': 'Alan', 'Last Name': 'Turing', Email: 'alan@example.test', 'Engagement ID': '5002', 'Engagement Status': 'Active', 'Job Title': 'Engineer' },
    ];
  }
  return [
    { 'Request ID': '35521102', Status: 'Pending', 'Status Reason': 'Pending Sourcing', 'Job Title': 'Administrative Assistant - 1', 'Bill Rate': '356' },
  ];
}

function statusPayload(job, xml) {
  const ready = Date.now() >= job.readyAt;
  const requestStatus = !ready ? 'Pending' : job.fail ? 'Errored' : 'Completed';
  const records = ready && !job.fail && job.kind === 'pull' ? sampleRecords(job.base) : [];

  if (xml) {
    const fields = records.map((r) => `<DataRecord>${Object.entries(r).map(([n, v]) => `<Field><Name>${n}</Name><Value>${v}</Value></Field>`).join('')}</DataRecord>`).join('');
    return [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Status xmlns="http://integration.prounlimited.com/xsd"><CorrelationId>${job.id}</CorrelationId><RequestStatus>${requestStatus}</RequestStatus>${records.length ? `<Data>${fields}</Data>` : ''}</Status>`, 'application/xml'];
  }

  // Shapes mirror the spec examples: worker outbound uses Data.DataRecord[].Field[{Name,Value}];
  // request outbound returns { dataRecords: [{ fields: [{ name, value }] }] } with no status wrapper.
  if (job.base === 'request/outbound' && ready && !job.fail) {
    return [{ dataRecords: records.map((r) => ({ fields: Object.entries(r).map(([name, value]) => ({ name, value })) })) }, 'application/json'];
  }
  const body = { CorrelationId: job.id, RequestStatus: requestStatus };
  if (records.length) {
    body.Data = { Attachment: null, DataRecord: records.map((r) => ({ Field: Object.entries(r).map(([Name, Value]) => ({ Name, Value })) })) };
  }
  return [body, 'application/json'];
}

function startJob(base, kind, isXml, payload) {
  const job = { id: randomUUID(), base, kind, xml: isXml, readyAt: Date.now() + DELAY_MS, fail: payload.includes('FORCE_ERROR') };
  jobs.set(job.id, job);
  return job;
}

function correlationIdFrom(body) {
  const json = /"correlationid"\s*:\s*"([^"]+)"/i.exec(body);
  const xml = /<CorrelationId>([^<]+)<\/CorrelationId>/i.exec(body);
  return (json ?? xml)?.[1];
}


function raasRows(reportId) {
  return Array.from({ length: RAAS_ROWS }, (_, i) => ({
    'Billing Line #': String(9000 + i),
    'Engagement ID': String(5001 + (i % 2)),
    'Worker': i % 2 ? 'Alan Turing' : 'Ada Lovelace',
    'Work Date': `2026-09-${String(1 + (i % 7)).padStart(2, '0')}`,
    'Time In': '08:00',
    'Time Out': '16:30',
    'Labor Type': 'Labor',
    'Hours': 8,
    'Status': 'Approved',
    'Report': reportId,
  }));
}

function handleRaas(req, res, url, body) {
  const path = url.pathname.replace(/\/+$/, '');

  if (req.method === 'POST' && path === '/wand2/publicapi/v1/get-api-token') {
    let keys;
    try { keys = JSON.parse(body); } catch { return send(res, 400, { title: 'Bad Request' }, 'application/problem+json'); }
    if (!keys.credentialKey || !keys.clientKey || !keys.clientSecret || keys.clientSecret === 'wrong') {
      return send(res, 401, { title: 'Unauthorized', status: 401 }, 'application/problem+json');
    }
    const token = `mock-raas-${randomUUID()}`;
    accessTokens.set(token, Date.now() + TOKEN_TTL_S * 1000);
    return send(res, 200, { access_token: token, expires_in: TOKEN_TTL_S });
  }

  if (!path.startsWith('/raas/')) return null;
  if (!isAuthorized(req)) return send(res, 401, { title: 'Unauthorized', status: 401 }, 'application/problem+json');

  const run = /^\/raas\/reports\/([^/]+)\/requests(?:\/([^/]+)(\/retrievePagedData)?)?$/.exec(path);
  if (!run) return send(res, 404, { title: 'Not Found' }, 'application/problem+json');
  const [, reportId, runId, paged] = run;

  if (req.method === 'POST' && !runId) {
    const latest = raasLatest.get(reportId);
    if (latest && Date.now() - latest.createdAt < 15 * 60_000) return send(res, 200, { runid: latest.id, message: 'Your request has been added to the queue, please refer to the Run ID.' });
    const created = { id: randomUUID(), reportId, createdAt: Date.now(), readyAt: Date.now() + DELAY_MS, fail: reportId === '99999' };
    raasRuns.set(created.id, created);
    raasLatest.set(reportId, created);
    return send(res, 200, { runid: created.id, message: 'Your request has been added to the queue, please refer to the Run ID.' });
  }

  const found = runId && raasRuns.get(runId);
  if (req.method !== 'GET' || !found || found.reportId !== reportId) return send(res, 404, { title: 'Run not found', status: 404 }, 'application/problem+json');
  const ready = Date.now() >= found.readyAt;
  const status = !ready ? 'In Progress' : found.fail ? 'Failed' : 'Completed';

  if (!paged) {
    const message = status === 'Completed' ? 'Report generation is complete. Please retrieve the report data.' : status === 'Failed' ? 'Report generation failed.' : 'Report is being generated.';
    return send(res, 200, { runid: found.id, reportid: Number(reportId), status, message });
  }
  if (status !== 'Completed') return send(res, 400, { title: 'Report is not ready', status: 400 }, 'application/problem+json');

  const size = Math.min(Number(url.searchParams.get('size') ?? 5000), 20000);
  const page = Number(url.searchParams.get('page') ?? 1);
  const all = raasRows(reportId);
  const totalpages = Math.max(1, Math.ceil(all.length / size));
  const next = page < totalpages ? `${url.origin}${url.pathname}?page=${page + 1}&size=${size}` : null;
  return send(res, 200, { nextpage: next, totalrecords: all.length, totalpages, data: all.slice((page - 1) * size, page * size) });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '');
  const body = await readBody(req);
  const isXml = (req.headers['content-type'] ?? '').includes('xml');
  log(req.method, path);

  if (req.method === 'POST' && path === '/__mock/revoke') {
    accessTokens.clear();
    return send(res, 200, { revoked: true });
  }
  if (req.method === 'POST' && path === '/api/oauth/token') return handleToken(req, res, body);
  if (path.startsWith('/wand2/') || path.startsWith('/raas/')) {
    if (handleRaas(req, res, url, body) !== null) return;
    return send(res, 404, { error: 'not found' });
  }

  if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });
  if (!isAuthorized(req)) return send(res, 401, { error: 'invalid_token' });
  const rest = path.slice('/api/'.length);

  // GET {base}/request-status/{id}
  const getStatus = /^(.+)\/request-status\/([^/]+)$/.exec(rest);
  if (req.method === 'GET' && getStatus) {
    const job = jobs.get(decodeURIComponent(getStatus[2]));
    if (!job) return send(res, 400, { error: 'unknown or expired correlationId' });
    const [payload, type] = statusPayload(job, isXml);
    return send(res, 200, payload, type);
  }

  // POST {base}/request-status  { correlationId }
  const postStatus = /^(.+)\/request-status$/.exec(rest);
  if (req.method === 'POST' && postStatus) {
    const job = jobs.get(correlationIdFrom(body));
    if (!job) return send(res, 400, { error: 'unknown or expired correlationId' });
    const [payload, type] = statusPayload(job, isXml);
    return send(res, 200, payload, type);
  }

  // POST {base}/request[/<feed identifier>]
  const request = /^(.+?)\/request(?:\/([^/]+))?$/.exec(rest);
  if (req.method === 'POST' && request) {
    const [, base] = request;
    const kind = PULL_BASES.includes(base) ? 'pull' : PUSH_BASES.includes(base) ? 'push' : null;
    if (!kind) return send(res, 404, { error: 'unknown feed' });
    if (kind === 'push') {
      if (!body.trim()) return send(res, 400, { error: 'empty body' });
      if (!isXml) {
        try { JSON.parse(body); } catch { return send(res, 400, { error: 'malformed JSON' }); }
      }
    }
    const job = startJob(base, kind, isXml, body);
    const [payload, type] = ack(isXml, job.id);
    return send(res, 200, payload, type);
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => log(`Magnit mock listening on http://localhost:${PORT}/api/ (delay ${DELAY_MS}ms, token ttl ${TOKEN_TTL_S}s)`));
