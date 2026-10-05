// src/lib/auth.js — OAuth 2.0 against POST {base}/oauth/token.
//
// Spec: Basic Authorization header (client credentials) + form body
//   grant_type=password, scope=write, username, password
// returns { access_token, token_type, refresh_token, expires_in (~1799s), scope }.
//
// The spec does not describe a refresh request; we use the standard OAuth grant_type=refresh_token.
// The user's password is never stored, so if refresh fails the user must log in again.

import axios from 'axios';
import config from './config.js';
import { MagnitCliError } from './errors.js';

function basicHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function requestToken(baseUrl, clientId, clientSecret, fields) {
  const url = new URL('oauth/token', baseUrl).toString();
  const response = await axios.post(url, new URLSearchParams(fields).toString(), {
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!response.data?.access_token) {
    throw new MagnitCliError('Token response did not include an access_token.');
  }
  return response.data;
}

function saveTokens(data) {
  config.set('accessToken', data.access_token);
  if (data.refresh_token) config.set('refreshToken', data.refresh_token);
  config.set('expiresAt', Date.now() + (Number(data.expires_in) || 1800) * 1000);
}

/** Password-grant login. Stores tokens plus the client credentials needed for later refreshes. */
export async function login({ env, baseUrl, clientId, clientSecret, username, password }) {
  const data = await requestToken(baseUrl, clientId, clientSecret, {
    grant_type: 'password',
    scope: 'write',
    username,
    password,
  });

  config.clear();
  if (env) config.set('env', env);
  config.set('baseUrl', baseUrl);
  config.set('clientId', clientId);
  config.set('clientSecret', clientSecret);
  config.set('username', username);
  saveTokens(data);
}

/** Exchange the refresh token for a new access token. Returns the new access token. */
export async function refreshSession() {
  const baseUrl = config.get('baseUrl');
  const refreshToken = config.get('refreshToken');
  const clientId = config.get('clientId');
  const clientSecret = config.get('clientSecret');

  if (!baseUrl || !refreshToken || !clientId || !clientSecret) {
    throw new MagnitCliError('Cannot refresh the session: refresh data is missing.', 'Run `magnit auth login`.');
  }

  try {
    const data = await requestToken(baseUrl, clientId, clientSecret, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'write',
    });
    saveTokens(data);
    return data.access_token;
  } catch (error) {
    throw new MagnitCliError(
      `Session refresh failed${error.response ? ` (HTTP ${error.response.status})` : `: ${error.message}`}.`,
      'Run `magnit auth login` to start a new session.',
    );
  }
}

export function logout() {
  config.clear();
}

export function sessionInfo() {
  const accessToken = config.get('accessToken');
  const expiresAt = config.get('expiresAt');
  return {
    loggedIn: Boolean(accessToken && config.get('baseUrl')),
    env: config.get('env'),
    baseUrl: config.get('baseUrl'),
    username: config.get('username'),
    expiresAt,
    expiresInSeconds: expiresAt ? Math.round((expiresAt - Date.now()) / 1000) : undefined,
    canRefresh: Boolean(config.get('refreshToken')),
  };
}
