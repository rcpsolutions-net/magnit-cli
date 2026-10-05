// src/lib/api.js — Authenticated axios client.
//
// Unlike a module-level singleton, the client is built per call so `auth login` in the same process
// (and `--dry-run` without a session) behave. Responses are kept as text because Magnit returns XML or JSON.

import axios from 'axios';
import config from './config.js';
import { ENVIRONMENTS, normalizeBaseUrl } from './envs.js';
import { refreshSession } from './auth.js';
import { MagnitCliError } from './errors.js';

const REFRESH_MARGIN_MS = 60_000;

/** Base URL from --base-url, then --env, then the stored session. Used by login and --dry-run. */
export function resolveBaseUrl({ baseUrl, env } = {}) {
  if (baseUrl) return normalizeBaseUrl(baseUrl);
  if (env) {
    const found = ENVIRONMENTS[env];
    if (!found) {
      throw new MagnitCliError(`Unknown environment "${env}".`, `Valid: ${Object.keys(ENVIRONMENTS).join(', ')}.`);
    }
    return found.baseUrl;
  }
  const stored = config.get('baseUrl');
  if (stored) return stored;
  throw new MagnitCliError('No environment selected.', 'Run `magnit auth login --env <env>` (or pass --env with --dry-run).');
}

export function buildUrl(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ''), baseUrl).toString();
}

export function createApi() {
  const baseURL = config.get('baseUrl');
  if (!baseURL || !config.get('accessToken')) {
    throw new MagnitCliError('You are not logged in.', 'Run `magnit auth login --env <env>` to start a session.');
  }

  const api = axios.create({ baseURL, responseType: 'text', transformResponse: [(data) => data] });

  api.interceptors.request.use(async (request) => {
    const expiresAt = config.get('expiresAt');
    if (expiresAt && expiresAt - Date.now() < REFRESH_MARGIN_MS && config.get('refreshToken')) {
      try {
        await refreshSession();
      } catch {
        // Send the request anyway; a 401 below reports the real problem.
      }
    }
    request.headers.Authorization = `Bearer ${config.get('accessToken')}`;
    return request;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      if (error.response?.status === 401 && original && !original._retry) {
        original._retry = true;
        await refreshSession(); // throws MagnitCliError with a re-login hint if it fails
        return api(original);
      }
      throw error;
    },
  );

  return api;
}
