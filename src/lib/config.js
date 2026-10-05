// src/lib/config.js — Local session store (e.g. ~/.config/magnit-cli on Linux).
// Set MAGNIT_CONFIG_DIR to point at a throwaway directory (used for testing against the mock server).

import Conf from 'conf';

const schema = {
  env: { type: 'string', description: 'Selected environment key (see envs.js).' },
  baseUrl: { type: 'string', description: 'API base URL, always ends with a slash.' },
  accessToken: { type: 'string' },
  refreshToken: { type: 'string' },
  expiresAt: { type: 'number', description: 'Epoch ms when accessToken expires.' },
  clientId: { type: 'string', description: 'Basic-auth client id, needed to refresh the token.' },
  clientSecret: { type: 'string', description: 'Basic-auth client secret, needed to refresh the token.' },
  username: { type: 'string' },
  correlations: { type: 'array', description: 'Recent correlation IDs (valid 24h on the Magnit side).' },
};

const config = new Conf({
  projectName: 'magnit-cli',
  schema,
  ...(process.env.MAGNIT_CONFIG_DIR && { cwd: process.env.MAGNIT_CONFIG_DIR }),
});

export default config;
