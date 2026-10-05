// src/lib/normalize.js — Flatten the status/ack shapes Magnit uses into one structure.
//
// Seen in the spec:
//   ack            { ResponseCode, CorrelationId }  (XML: <RequestAcknowledgement>)
//   status         { CorrelationId | correlationId, RequestStatus | requestStatus }
//   worker outbound  adds Data.DataRecord[].Field[{ Name, Value }]
//   request outbound { dataRecords: [{ fields: [{ name, value }] }] } (no status wrapper in the example)

import { pick } from './payload.js';

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

export function parseAck(data) {
  return {
    responseCode: pick(data, 'ResponseCode'),
    correlationId: pick(data, 'CorrelationId'),
  };
}

function extractRecords(data) {
  const container = pick(data, 'Data') ?? data;
  const records = pick(container, 'DataRecord', 'dataRecords');
  return asArray(records).map((record) => {
    const fields = asArray(pick(record, 'Field', 'fields'));
    return Object.fromEntries(fields.map((f) => [String(pick(f, 'Name') ?? ''), pick(f, 'Value') ?? '']));
  });
}

/** @returns {{ correlationId?: string, requestStatus: string, records: Array<Record<string,string>> }} */
export function normalizeStatus(data) {
  const obj = data !== null && typeof data === 'object' ? data : {};
  const records = extractRecords(obj);
  const requestStatus = pick(obj, 'RequestStatus') ?? (records.length ? 'Completed' : 'Unknown');
  return { correlationId: pick(obj, 'CorrelationId'), requestStatus, records };
}

export const isTerminal = (status) => ['completed', 'errored'].includes(String(status).toLowerCase());
