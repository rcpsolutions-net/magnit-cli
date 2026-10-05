// src/lib/envs.js — Magnit environments (from "Magnit API" reference v1.1, "BASE URL").
// Base URLs always end with "/api/" and a trailing slash so relative paths join correctly.

export const ENVIRONMENTS = {
  'us-prod':   { label: 'US production', baseUrl: 'https://integration.pro-unlimited.com/api/' },
  'eu-prod':   { label: 'EU production', baseUrl: 'https://integrationeu.pro-unlimited.com/api/' },
  csol3:       { label: 'US sandbox (CSOL3)', baseUrl: 'https://csol3-integration.prounlimited.com/api/' },
  web03:       { label: 'US sandbox (WEB03)', baseUrl: 'https://cfuatweb03-integration.prounlimited.com/api/' },
  eupmwand3:   { label: 'EU sandbox (EUPMWAND3)', baseUrl: 'https://eupmwand3-integration.prounlimited.com/api/' },
  local:       { label: 'Local mock server (npm run mock)', baseUrl: 'http://localhost:4010/api/' },
};

export function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url : `${url}/`;
}
