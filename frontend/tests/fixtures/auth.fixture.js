const base = require('@playwright/test');
const { readAuthSession, normalizedApiBase } = require('../helpers/api.helper');
const { SESSION_KEY } = require('../helpers/auth.helper');

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    const session = readAuthSession();
    const appOrigin = new URL(process.env.PW_BASE_URL || 'http://localhost:3000').origin;
    await page.addInitScript(
      ({ origin, key, value }) => {
        try {
          if (window.location.origin === origin) {
            window.sessionStorage.setItem(key, JSON.stringify(value));
          }
        } catch (_error) {
          // about:blank puede bloquear sessionStorage antes de la primera navegación.
        }
      },
      { origin: appOrigin, key: SESSION_KEY, value: session },
    );

    const technicalFailures = [];
    page.on('pageerror', (error) => {
      technicalFailures.push(`Error JavaScript: ${error.message}`);
    });
    page.on('response', (response) => {
      if (
        response.url().startsWith(normalizedApiBase()) &&
        response.status() >= 500
      ) {
        technicalFailures.push(`HTTP ${response.status()} en ${response.url()}`);
      }
    });

    await use(page);

    if (technicalFailures.length) {
      await testInfo.attach('fallos-tecnicos.txt', {
        body: Buffer.from(technicalFailures.join('\n'), 'utf8'),
        contentType: 'text/plain',
      });
      if (!testInfo.errors.length) {
        throw new Error(technicalFailures.join('\n'));
      }
    }
  },
});

module.exports = { expect: base.expect, test };
