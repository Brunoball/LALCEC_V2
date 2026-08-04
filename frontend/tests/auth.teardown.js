const fs = require('fs');
const { request } = require('@playwright/test');
const { AUTH_FILE, actionUrl } = require('./helpers/api.helper');

module.exports = async function globalTeardown() {
  if (!fs.existsSync(AUTH_FILE)) return;
  const session = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    await api.post(actionUrl('auth_logout'), {
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      data: {},
      failOnStatusCode: false,
    });
  } finally {
    await api.dispose();
    fs.rmSync(AUTH_FILE, { force: true });
  }
};
