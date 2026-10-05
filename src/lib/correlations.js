// src/lib/correlations.js — Local record of recent correlation IDs.
// Magnit only honours a correlation ID for 24 hours, so we remember when each was issued.

import config from './config.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

export function recordCorrelation({ correlationId, feed, feedId, kind }) {
  const list = config.get('correlations') ?? [];
  list.unshift({ correlationId, feed, feedId, kind, status: 'Pending', createdAt: new Date().toISOString() });
  config.set('correlations', list.slice(0, MAX_ENTRIES));
}

export function updateCorrelation(correlationId, status) {
  const list = config.get('correlations') ?? [];
  const entry = list.find((c) => c.correlationId === correlationId);
  if (!entry) return;
  entry.status = status;
  config.set('correlations', list);
}

export function listCorrelations() {
  return (config.get('correlations') ?? []).map((c) => ({
    ...c,
    expired: Date.now() - Date.parse(c.createdAt) > TTL_MS,
  }));
}

export function findCorrelation(correlationId) {
  return listCorrelations().find((c) => c.correlationId === correlationId);
}

export function clearCorrelations() {
  config.delete('correlations');
}
