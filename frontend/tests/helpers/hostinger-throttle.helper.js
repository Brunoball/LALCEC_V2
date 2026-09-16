const { loadTestEnv } = require('./env.helper');

loadTestEnv();

const DEFAULT_MIN_INTERVAL_MS = 125;
const MIN_INTERVAL_MS = 60;
const MAX_INTERVAL_MS = 2000;

let queueTail = Promise.resolve();
let nextStartAt = 0;

function hostingerMinIntervalMs() {
  const configured = Number(process.env.PW_HOSTINGER_MIN_REQUEST_INTERVAL_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MIN_INTERVAL_MS;
  }
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(configured)));
}

function isHostingerEnvironment() {
  return String(process.env.PW_ENVIRONMENT || '').trim().toLowerCase() === 'hostinger';
}

function isHostingerBackendUrl(input) {
  if (!isHostingerEnvironment()) return false;

  try {
    const url = input instanceof URL ? input : new URL(String(input));
    const allowedHost = String(process.env.PW_REMOTE_HOST || 'lalcec.3devsnet.com')
      .trim()
      .toLowerCase();
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === allowedHost &&
      /^\/api(?:\/|$)/i.test(url.pathname)
    );
  } catch (_error) {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserva un instante de inicio para una llamada al backend remoto.
 *
 * El límite se aplica únicamente contra Hostinger. No cambia respuestas,
 * no reintenta HTTP 500 y no oculta errores funcionales: solamente evita
 * ráfagas artificiales del E2E espaciando el inicio de requests reales.
 */
async function waitForHostingerRequestSlot() {
  if (!isHostingerEnvironment()) return;

  let releaseQueue;
  const previous = queueTail;
  queueTail = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  await previous;
  try {
    const waitMs = Math.max(0, nextStartAt - Date.now());
    if (waitMs > 0) await delay(waitMs);
    nextStartAt = Date.now() + hostingerMinIntervalMs();
  } finally {
    releaseQueue();
  }
}

/**
 * Instala el limitador sobre las llamadas reales que dispara React desde
 * una page de Playwright. Los mocks registrados por cada spec siguen
 * pudiendo responder normalmente y no consumen slots de Hostinger.
 */
async function installHostingerPageThrottle(page) {
  if (!isHostingerEnvironment()) return;

  await page.route(
    (url) => isHostingerBackendUrl(url),
    async (route) => {
      await waitForHostingerRequestSlot();
      await route.fallback();
    },
  );
}

module.exports = {
  hostingerMinIntervalMs,
  installHostingerPageThrottle,
  isHostingerBackendUrl,
  isHostingerEnvironment,
  waitForHostingerRequestSlot,
};
