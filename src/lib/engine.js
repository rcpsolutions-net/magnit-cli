// src/lib/engine.js — The async feed workflow every Magnit operation shares:
//   POST request  ->  { ResponseCode, CorrelationId }  ->  poll request-status until Completed | Errored

import { createApi } from './api.js';
import { MagnitCliError } from './errors.js';
import { MIME, parseBody } from './payload.js';
import { isTerminal, normalizeStatus, parseAck } from './normalize.js';
import { recordCorrelation, updateCorrelation } from './correlations.js';

// ── Request builders (pure — also used by --dry-run) ────────────────

export function feedPath(feed, feedId, override) {
  if (override) return override;
  if (feed.feedId && !feedId) {
    throw new MagnitCliError(
      `Feed "${feed.name}" needs a <feedId> argument.`,
      'Magnit assigns feed identifiers during integration setup; ask your Program Representative.',
    );
  }
  if (!feed.feedId && feedId) {
    throw new MagnitCliError(`Feed "${feed.name}" does not take a feed identifier.`);
  }
  return feed.feedId ? `${feed.path}/${encodeURIComponent(feedId)}` : feed.path;
}

/** Push (with body) or pull (no body) request. */
export function buildFeedRequest(feed, { feedId, path, format = 'json', body }) {
  return {
    method: 'POST',
    path: feedPath(feed, feedId, path),
    headers: { 'Content-Type': MIME[format] },
    data: feed.direction === 'push' ? body : undefined,
  };
}

export function buildStatusRequest(feed, correlationId, { method, format = 'json' } = {}) {
  const verb = (method ?? feed.statusStyle).toUpperCase();
  const base = feed.statusPath ?? `${feed.statusBase}/request-status`;
  const headers = { 'Content-Type': MIME[format] };

  if (verb === 'GET') {
    return { method: 'GET', path: `${base}/${encodeURIComponent(correlationId)}`, headers };
  }
  const data = format === 'xml'
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<RequestStatus xmlns="http://integration.prounlimited.com/xsd">\n<CorrelationId>${correlationId}</CorrelationId>\n</RequestStatus>`
    : JSON.stringify({ correlationId });
  return { method: 'POST', path: base, headers, data };
}

// ── Network calls ───────────────────────────────────────────────────

function send(request) {
  return createApi().request({ method: request.method, url: request.path, headers: request.headers, data: request.data });
}

/** Send a push/pull request and record the correlation ID Magnit returns. */
export async function startFeed(feed, request, { feedId }) {
  const response = await send(request);
  const ack = parseAck(parseBody(response.data));
  if (!ack.correlationId) {
    throw new MagnitCliError('Magnit accepted the request but returned no CorrelationId.', `Raw response: ${response.data}`);
  }
  recordCorrelation({ correlationId: ack.correlationId, feed: feed.name, feedId, kind: feed.direction });
  return ack;
}

export async function fetchStatus(feed, correlationId, options = {}) {
  const response = await send(buildStatusRequest(feed, correlationId, options));
  const status = normalizeStatus(parseBody(response.data));
  status.correlationId ??= correlationId;
  updateCorrelation(correlationId, status.requestStatus);
  return status;
}

/** Poll until Completed or Errored. `onTick(status)` is called after every poll. */
export async function waitForStatus(feed, correlationId, { method, format, intervalMs = 5000, timeoutMs = 300_000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await fetchStatus(feed, correlationId, { method, format });
    onTick?.(status);
    if (isTerminal(status.requestStatus)) return status;
    if (Date.now() + intervalMs > deadline) {
      throw new MagnitCliError(
        `Timed out after ${timeoutMs / 1000}s; request is still ${status.requestStatus}.`,
        `Correlation IDs are valid for 24 hours. Check later with \`magnit feed status ${correlationId} --feed ${feed.name}\`.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Raw request for the `call` escape hatch. */
export function sendRaw(request) {
  return send(request);
}
