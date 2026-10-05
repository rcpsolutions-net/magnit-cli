// src/lib/feeds.js — Registry of Magnit integration feeds, from "Magnit API" reference v1.1.
//
// Adding a feed (e.g. a timecard feed once Magnit supplies its spec) means adding one entry here.
//
//   direction     'push' sends a payload, 'pull' asks Magnit to build an outbound data set
//   path          request endpoint, relative to the base URL (which already ends in /api/)
//   feedId        true when the endpoint takes a Magnit-assigned "<feed identifier>" path segment
//   statusPath    explicit status endpoint (documented for po + outbound feeds)
//   statusBase    prefix for the generic "<<feedtype>>/request-status" endpoint (INFERRED from the PO example)
//   statusStyle   'get'  -> GET  {status}/{correlationId}
//                 'post' -> POST {status} with {"correlationId": "..."}
//   verify        things that must be confirmed against the real API (shown by `magnit feed list`)

import { MagnitCliError } from './errors.js';

const GENERIC_STATUS = 'Generic request-status endpoint is documented as "<<feedtype>>/request-status"; prefix inferred from the PO feed.';

export const FEEDS = {
  costcenter: {
    label: 'Departments / Cost Centers',
    direction: 'push',
    path: 'costcenter/request',
    statusBase: 'costcenter',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  location: {
    label: 'Locations',
    direction: 'push',
    path: 'location/request',
    statusBase: 'location',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  manager: {
    label: 'Managers / Client Users',
    direction: 'push',
    path: 'manager/request',
    statusBase: 'manager',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  cfreflist: {
    label: 'Custom Field Reference Lists',
    direction: 'push',
    path: 'cfreflist/request',
    feedId: true,
    statusBase: 'cfreflist',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  po: {
    label: 'Purchase Orders',
    direction: 'push',
    path: 'po/request',
    feedId: true,
    statusPath: 'po/request-status',
    statusStyle: 'post',
    verify: [],
  },
  'worker-inbound': {
    label: 'Worker Inbound (update worker profiles)',
    direction: 'push',
    path: 'worker/inbound/request',
    feedId: true,
    statusBase: 'worker/inbound',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  approval: {
    label: 'Approval Status',
    direction: 'push',
    path: 'approval/request',
    feedId: true,
    statusBase: 'approval',
    statusStyle: 'get',
    verify: [GENERIC_STATUS],
  },
  onboarding: {
    label: 'Onboarding Item Status',
    direction: 'push',
    path: 'onboarding/inbound/request',
    statusBase: 'onboarding/inbound',
    statusStyle: 'get',
    verify: [
      'PDF lists this endpoint as /api/onboarding/inbound/request but the base URL already ends in /api/; assumed NOT doubled (override with --path).',
      GENERIC_STATUS,
    ],
  },
  'worker-outbound': {
    label: 'Worker Outbound (worker data out of Magnit)',
    direction: 'pull',
    path: 'worker/outbound/request',
    feedId: true,
    statusPath: 'worker/outbound/request-status',
    statusStyle: 'post',
    verify: [],
  },
  'request-outbound': {
    label: 'Request Outbound (requisitions out of Magnit)',
    direction: 'pull',
    path: 'request/outbound/request',
    feedId: true,
    statusPath: 'request/outbound/request-status',
    statusStyle: 'post',
    verify: ['Documented status response has no CorrelationId/RequestStatus wrapper; a body with dataRecords is treated as Completed.'],
  },
};

export function getFeed(name) {
  const feed = FEEDS[name];
  if (!feed) {
    throw new MagnitCliError(`Unknown feed "${name}".`, `Valid feeds: ${Object.keys(FEEDS).join(', ')} (see \`magnit feed list\`).`);
  }
  return { name, ...feed };
}
