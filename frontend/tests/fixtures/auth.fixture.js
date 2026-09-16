const base = require('@playwright/test');
const { ensureAuthSession, normalizedApiBase } = require('../helpers/api.helper');
const { SESSION_KEY } = require('../helpers/auth.helper');
const { installHostingerPageThrottle } = require('../helpers/hostinger-throttle.helper');

const test = base.test.extend({
  page: async ({ page, request }, use, testInfo) => {
    await installHostingerPageThrottle(page);
    const session = await ensureAuthSession(request);
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
      const url = response.url();
      let isLocalBotProxy = false;
      try {
        isLocalBotProxy = new URL(url).searchParams.get('action') === 'bot_panel_proxy';
      } catch (_error) {
        // Una URL no válida seguirá tratándose como cualquier otra respuesta.
      }
      // El Panel Bot queda fuera de esta suite. Si Principal consulta su badge
      // mediante el proxy local, esa respuesta no forma parte de las verificaciones
      // técnicas de los módulos administrativos.
      const monitoredApi = url.startsWith(normalizedApiBase()) && !isLocalBotProxy;
      if (monitoredApi && response.status() >= 500) {
        technicalFailures.push(`HTTP ${response.status()} en ${url}`);
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
