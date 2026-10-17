const base = require('@playwright/test');
const { createHash } = require('node:crypto');
const { ensureAuthSession, normalizedApiBase } = require('../helpers/api.helper');
const { SESSION_KEY } = require('../helpers/auth.helper');
const { installHostingerPageThrottle } = require('../helpers/hostinger-throttle.helper');

const test = base.test.extend({
  page: async ({ page, request }, use, testInfo) => {
    await installHostingerPageThrottle(page);
    // Las escrituras reales de la UI ya generan claves; identificamos las de
    // Playwright con un prefijo limpiable, sin cambiar el resto del payload.
    // Una misma clave original se transforma siempre en la misma clave E2E.
    await page.route(/api\.php\?[^#]*action=medicamentos_/, async route => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fallback();
      const action = new URL(req.url()).searchParams.get('action');
      if (!new Set(['medicamentos_guardar','medicamentos_cambiar_estado',
        'medicamentos_ingresar','medicamentos_salida','medicamentos_anular',
        'medicamentos_revisar_lote','medicamentos_prestar','medicamentos_devolver',
        'medicamentos_cerrar','medicamentos_sena']).has(action)) return route.fallback();
      let data;
      try { data = req.postDataJSON(); } catch (_error) { return route.fallback(); }
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          typeof data._idempotency_key !== 'string') return route.fallback();
      const hash = createHash('sha256').update(data._idempotency_key).digest('hex').slice(0,48);
      return route.fallback({ postData: JSON.stringify({
        ...data, _idempotency_key: `med-PWE2E-${hash}`,
      }) });
    });
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
