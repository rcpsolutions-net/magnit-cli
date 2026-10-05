// src/lib/raas.js — Reporting as a Service (RaaS): saved Customizable Reports pulled as JSON.
//
// Source: https://magnitglobal.com/reporting-as-a-service (there is no separate spec PDF).
// Different host and auth from the Integration API:
//   POST {tokenUrl}  JSON { credentialKey, clientKey, clientSecret }  -> access token (Bearer)
//   POST  request report   -> { runid, message }  (same runid if re-requested within 15 minutes)
//   GET   status by runid  -> { runid, reportid, status: "Completed", message }
//   GET   {base}/reports/{reportid}/requests/{runid}/retrievePagedData?page=&size=
//         -> { nextpage, totalrecords, totalpages, data: [...] }   (size default 5000, max 20000)
//
// The report-specific URLs are shown in the "RaaS" window of a saved Customizable Report; we store them
// per report name. Items the page does not spell out are flagged in VERIFY and printed by `raas report list`.
//
// Kept in its own Conf file so `magnit auth login|logout` (which clear the Integration API session)
// never wipe RaaS keys.

import axios from 'axios';
import Conf from 'conf';
import { MagnitCliError } from './errors.js';

export const TOKEN_URLS = {
  us: 'https://api.us.magnitglobal.com/wand2/publicapi/v1/get-api-token',
  eu: 'https://api.eu.magnitglobal.com/wand2/publicapi/v1/get-api-token',
  local: 'http://localhost:4010/wand2/publicapi/v1/get-api-token',
};

export const VERIFY = [
  'Token response field name (we accept access_token / accessToken / token) and whether it carries expires_in.',
  'Status URL shape: derived as {requestUrl}/{runid} unless --status-url is given.',
  'Other status values besides "Completed" (anything matching fail|error is treated as failed).',
  'Page-size cap is documented as 20000; a larger --size is clamped by Magnit.',
];

const store = new Conf({
  projectName: 'magnit-cli',
  configName: 'raas',
  ...(process.env.MAGNIT_CONFIG_DIR && { cwd: process.env.MAGNIT_CONFIG_DIR }),
});

const TOKEN_MARGIN_MS = 60_000;
const DEFAULT_KEY_DAYS = 90;
const WARN_DAYS = 14;

// ---- stored settings -------------------------------------------------------------------------------

export function getReports() {
  return store.get('reports') ?? {};
}

export function saveReport(name, report) {
  store.set('reports', { ...getReports(), [name]: report });
}

export function removeReport(name) {
  const { [name]: removed, ...rest } = getReports();
  store.set('reports', rest);
  return Boolean(removed);
}

export function getReport(name) {
  const report = getReports()[name];
  if (!report) {
    throw new MagnitCliError(`Unknown report "${name}".`, 'Save it with `magnit raas report add <name> --request-url <url>`; see `magnit raas report list`.');
  }
  return report;
}

export function logoutRaas() {
  for (const key of ['tokenUrl', 'region', 'credentialKey', 'clientKey', 'clientSecret', 'accessToken', 'expiresAt', 'keysCreatedAt', 'keyDays']) {
    store.delete(key);
  }
}

// ---- keys + token ----------------------------------------------------------------------------------

function pickToken(data) {
  if (typeof data === 'string' && data.trim()) return { token: data.trim() };
  if (!data || typeof data !== 'object') return {};
  const lower = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]));
  const token = lower.access_token ?? lower.accesstoken ?? lower.token;
  const expiresIn = Number(lower.expires_in ?? lower.expiresin);
  return { token, expiresIn: expiresIn > 0 ? expiresIn : undefined };
}

async function postForToken({ tokenUrl, credentialKey, clientKey, clientSecret }) {
  const body = {
    credentialKey: /^\d+$/.test(String(credentialKey)) ? Number(credentialKey) : credentialKey,
    clientKey,
    clientSecret,
  };
  const response = await axios.post(tokenUrl, body, { headers: { 'Content-Type': 'application/json' } });
  const { token, expiresIn } = pickToken(response.data);
  if (!token) {
    throw new MagnitCliError('RaaS token response did not include a recognisable access token.', `Raw response: ${JSON.stringify(response.data)}`);
  }
  return { token, expiresIn };
}

/** Token request with RaaS-specific error text (the generic 401 hint points at `magnit auth login`). */
async function requestToken(creds) {
  try {
    return await postForToken(creds);
  } catch (error) {
    if (error instanceof MagnitCliError) throw error;
    throw new MagnitCliError(
      `RaaS token request failed${error.response ? ` (HTTP ${error.response.status})` : `: ${error.message}`}.`,
      'Check the Credential Key, Client Key and Client Secret. Keys expire after 90 days by default; create new ones in your Magnit profile, then run `magnit raas login`.',
    );
  }
}

/** Save the RaaS keys and fetch a first token (proves the keys work). */
export async function loginRaas({ tokenUrl, region, credentialKey, clientKey, clientSecret, keysCreatedAt, keyDays }) {
  const { token, expiresIn } = await requestToken({ tokenUrl, credentialKey, clientKey, clientSecret });
  const sameKeys = store.get('clientKey') === clientKey && String(store.get('credentialKey')) === String(credentialKey);
  store.set({
    tokenUrl,
    credentialKey: String(credentialKey),
    clientKey,
    clientSecret,
    accessToken: token,
    keyDays: keyDays ?? store.get('keyDays') ?? DEFAULT_KEY_DAYS,
    keysCreatedAt: keysCreatedAt ?? (sameKeys ? store.get('keysCreatedAt') : undefined) ?? Date.now(),
  });
  if (region) store.set('region', region);
  else store.delete('region');
  if (expiresIn) store.set('expiresAt', Date.now() + expiresIn * 1000);
  else store.delete('expiresAt');
}

async function freshToken() {
  const creds = {
    tokenUrl: store.get('tokenUrl'),
    credentialKey: store.get('credentialKey'),
    clientKey: store.get('clientKey'),
    clientSecret: store.get('clientSecret'),
  };
  if (!creds.tokenUrl || !creds.clientKey || !creds.clientSecret) {
    throw new MagnitCliError('No RaaS keys saved.', 'Run `magnit raas login`.');
  }
  const result = await requestToken(creds);
  store.set('accessToken', result.token);
  if (result.expiresIn) store.set('expiresAt', Date.now() + result.expiresIn * 1000);
  else store.delete('expiresAt');
  return result.token;
}

async function currentToken() {
  const token = store.get('accessToken');
  const expiresAt = store.get('expiresAt');
  if (token && !(expiresAt && expiresAt - Date.now() < TOKEN_MARGIN_MS)) return token;
  return freshToken();
}

export function raasSession() {
  const clientKey = store.get('clientKey');
  const createdAt = store.get('keysCreatedAt');
  const keyDays = store.get('keyDays') ?? DEFAULT_KEY_DAYS;
  const daysLeft = createdAt ? Math.floor((createdAt + keyDays * 86_400_000 - Date.now()) / 86_400_000) : undefined;
  return {
    loggedIn: Boolean(clientKey && store.get('clientSecret')),
    region: store.get('region'),
    tokenUrl: store.get('tokenUrl'),
    credentialKey: store.get('credentialKey'),
    clientKey,
    keyDays,
    keysCreatedAt: createdAt,
    keyDaysLeft: daysLeft,
    keysExpiring: daysLeft !== undefined && daysLeft <= WARN_DAYS,
    reports: Object.keys(getReports()),
  };
}

// ---- report URLs -----------------------------------------------------------------------------------

const RUN_PLACEHOLDER = /\{runid\}/gi;

function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

/** Fill in the status/data URL templates for a saved report. `{runid}` is replaced at call time. */
export function reportUrls(report) {
  const base = trimSlash(report.requestUrl);
  return {
    requestUrl: report.requestUrl,
    statusUrl: report.statusUrl ?? `${base}/{runid}`,
    dataUrl: report.dataUrl ?? `${base}/{runid}/retrievePagedData`,
    inferred: [!report.statusUrl && 'statusUrl', !report.dataUrl && 'dataUrl'].filter(Boolean),
  };
}

const fill = (template, runId) => template.replace(RUN_PLACEHOLDER, encodeURIComponent(runId));

// ---- calls -----------------------------------------------------------------------------------------

async function call(config) {
  const send = async (token) => axios({ ...config, headers: { ...config.headers, Authorization: `Bearer ${token}` } });
  try {
    return await send(await currentToken());
  } catch (error) {
    if (error.response?.status !== 401) throw error;
    try {
      return await send(await freshToken());
    } catch (retry) {
      if (retry.response?.status === 401) {
        throw new MagnitCliError('RaaS rejected the access token, even after re-authenticating.', 'Check that the report is still shared with this user and the keys are current; run `magnit raas login`.');
      }
      throw retry;
    }
  }
}

export async function requestRun(report) {
  const response = await call({ method: 'POST', url: reportUrls(report).requestUrl });
  const runId = response.data?.runid ?? response.data?.runId;
  if (!runId) throw new MagnitCliError('RaaS accepted the request but returned no runid.', `Raw response: ${JSON.stringify(response.data)}`);
  return { runId, message: response.data.message };
}

export async function runStatus(report, runId) {
  const response = await call({ method: 'GET', url: fill(reportUrls(report).statusUrl, runId) });
  const data = response.data ?? {};
  const status = String(data.status ?? '');
  return {
    runId: data.runid ?? runId,
    reportId: data.reportid,
    status,
    message: data.message,
    done: /^completed$/i.test(status),
    failed: /fail|error/i.test(status),
  };
}

export async function waitForRun(report, runId, { intervalMs = 5000, timeoutMs = 600_000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await runStatus(report, runId);
    onTick?.(status);
    if (status.done || status.failed) return status;
    if (Date.now() + intervalMs > deadline) {
      throw new MagnitCliError(`Timed out after ${timeoutMs / 1000}s; report run is still "${status.status}".`, `Check later with \`magnit raas check <report> ${runId}\`.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Fetch one page: { page, totalPages, totalRecords, data }. */
export async function fetchPage(report, runId, { page = 1, size } = {}) {
  const params = { page, ...(size && { size }) };
  const response = await call({ method: 'GET', url: fill(reportUrls(report).dataUrl, runId), params });
  const body = response.data ?? {};
  const data = Array.isArray(body) ? body : body.data;
  if (!Array.isArray(data)) {
    throw new MagnitCliError('RaaS data response had no "data" array.', `Raw response: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    page,
    data,
    totalPages: Number(body.totalpages) || undefined,
    totalRecords: Number(body.totalrecords) || undefined,
    hasNext: Boolean(body.nextpage),
  };
}

/** Fetch one page, or every page (`all`). `onPage(pageResult)` fires after each. */
export async function fetchData(report, runId, { page = 1, size, all = false, onPage } = {}) {
  const first = await fetchPage(report, runId, { page, size });
  onPage?.(first);
  const rows = [...first.data];
  if (!all) return { rows, totalRecords: first.totalRecords, totalPages: first.totalPages };

  let last = first;
  while ((last.totalPages ? last.page < last.totalPages : last.hasNext) && last.data.length) {
    last = await fetchPage(report, runId, { page: last.page + 1, size });
    onPage?.(last);
    rows.push(...last.data);
  }
  return { rows, totalRecords: first.totalRecords, totalPages: first.totalPages };
}
