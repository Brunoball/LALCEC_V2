const path = require('path');
const base = require('@playwright/test');
const { ensureAuthSession, normalizedApiBase } = require('../helpers/api.helper');
const { SESSION_KEY } = require('../helpers/auth.helper');
const { normalizedBotApiBase } = require('../helpers/bot.helper');

const test = base.test.extend({
  page: async ({ page, request }, use, testInfo) => {
    const session = await ensureAuthSession(request);
    const appOrigin = new URL(process.env.PW_BASE_URL || 'http://localhost:3000').origin;
    const isBotSpec = path.basename(testInfo.file || '') === '14-panel-bot.spec.js';
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
      const directBotApi = url.startsWith(normalizedBotApiBase());
      const monitoredApi =
        url.startsWith(normalizedApiBase()) || directBotApi;

      // Principal consulta el Panel Bot en segundo plano para mostrar su badge.
      // En local esa lectura puede pasar por bot_panel_proxy; apuntando a Hostinger
      // puede ir directo a /api/bot_whatsapp. En ambos casos es una función opcional
      // para Dashboard, Socios, Cuotas, etc., y no debe convertir esos specs en rojo.
      // El spec del Panel Bot conserva el monitoreo estricto de sus propias llamadas.
      const optionalBotFailure = !isBotSpec && (isLocalBotProxy || directBotApi);
      if (monitoredApi && response.status() >= 500 && !optionalBotFailure) {
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
