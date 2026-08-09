const { expect } = require('@playwright/test');
const { loadTestEnv } = require('./env.helper');

loadTestEnv();

const DEFAULT_BOT_API_BASE =
  'https://lalcec.3devsnet.com/api/bot_whatsapp/funciones/Panel';
const DEFAULT_BOT_TEST_LOCAL_NUMBER = '3492253860';
const DEFAULT_BOT_TEST_WA_ID = '5493492253860';

function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function normalizeBotWaId(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);

  let national = null;
  if (digits.startsWith('549')) {
    national = digits.slice(3);
  } else if (digits.startsWith('54')) {
    national = digits.slice(2);
  } else if (digits.startsWith('0') || digits.length === 10 || /^\d{2,4}15\d{6,8}$/.test(digits)) {
    national = digits;
  }

  if (national === null) return digits;

  national = national.replace(/^0+/, '');
  const oldMobile = national.match(/^(\d{2,4})15(\d{6,8})$/);
  if (oldMobile) national = `${oldMobile[1]}${oldMobile[2]}`;
  if (national.length > 10) national = national.slice(-10);

  return national.length === 10 ? `549${national}` : digits;
}

function normalizedBotApiBase() {
  return String(
    process.env.PW_BOT_API_URL ||
      process.env.REACT_APP_BOT_URL ||
      DEFAULT_BOT_API_BASE,
  )
    .trim()
    .replace(/\/+$/, '');
}

function botTestWaId() {
  const raw = process.env.PW_BOT_WA_ID || DEFAULT_BOT_TEST_LOCAL_NUMBER;
  const value = normalizeBotWaId(raw);
  if (!value) throw new Error('PW_BOT_WA_ID no puede estar vacío.');
  return value;
}

function normalizeBotEndpoint(endpoint) {
  const clean = String(endpoint || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Falta indicar el endpoint del bot.');
  return /\.php$/i.test(clean) ? clean : `${clean}.php`;
}

function botApiUrl(section, endpoint, params = {}) {
  const folders = {
    panel: 'endpoints',
    management: 'puntos',
  };
  const folder = folders[section];
  if (!folder) throw new Error(`Sección del bot no válida: ${section}`);

  const url = new URL(
    `${normalizedBotApiBase()}/${folder}/${normalizeBotEndpoint(endpoint)}`,
  );
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseBotResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(
      `Respuesta no JSON (${response.status()}) desde ${response.url()}: ${text.slice(0, 300)}`,
    );
  }
}

const BOT_RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BOT_READ_RETRY_DELAYS_MS = [350, 800, 1600];

function isSafeBotReadMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function isTransientBotNetworkError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'socket hang up',
    'econnreset',
    'econnrefused',
    'etimedout',
    'esockettimedout',
    'eai_again',
    'enotfound',
    'network socket disconnected',
    'connection reset',
    'connection closed',
    'fetch failed',
  ].some((token) => message.includes(token));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function botApiResult(requestContext, section, endpoint, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const url = botApiUrl(section, endpoint, options.params);
  const safeRead = isSafeBotReadMethod(method);

  // Las lecturas contra Hostinger pueden sufrir cortes transitorios (por ejemplo
  // "socket hang up"). Reintentamos solo GET/HEAD para no duplicar escrituras.
  const configuredRetries = Number(options.retries);
  const retryCount = safeRead
    ? (Number.isFinite(configuredRetries) && configuredRetries >= 0
      ? Math.floor(configuredRetries)
      : BOT_READ_RETRY_DELAYS_MS.length)
    : 0;
  const maxAttempts = retryCount + 1;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await requestContext.fetch(url, {
        method,
        failOnStatusCode: false,
        headers: {
          Accept: 'application/json',
          ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
        ...(options.data !== undefined ? { data: options.data } : {}),
      });

      const status = response.status();
      if (
        safeRead &&
        BOT_RETRYABLE_HTTP_STATUS.has(status) &&
        attempt < maxAttempts
      ) {
        const delay = BOT_READ_RETRY_DELAYS_MS[Math.min(attempt - 1, BOT_READ_RETRY_DELAYS_MS.length - 1)];
        console.warn(
          `[PW Bot] ${method} ${endpoint} respondió HTTP ${status}. ` +
          `Reintento ${attempt + 1}/${maxAttempts} en ${delay}ms.`,
        );
        await wait(delay);
        continue;
      }

      const body = await parseBotResponse(response);
      return {
        ok: response.ok() && body?.success !== false,
        status,
        body,
        url: response.url(),
      };
    } catch (error) {
      lastError = error;
      const canRetry =
        safeRead &&
        attempt < maxAttempts &&
        isTransientBotNetworkError(error);

      if (!canRetry) throw error;

      const delay = BOT_READ_RETRY_DELAYS_MS[Math.min(attempt - 1, BOT_READ_RETRY_DELAYS_MS.length - 1)];
      console.warn(
        `[PW Bot] ${method} ${endpoint} tuvo un error transitorio de red ` +
        `(${String(error?.message || error).split('\n')[0]}). ` +
        `Reintento ${attempt + 1}/${maxAttempts} en ${delay}ms.`,
      );
      await wait(delay);
    }
  }

  throw lastError || new Error(`No se pudo completar ${method} ${endpoint}.`);
}

async function botApiCall(requestContext, section, endpoint, options = {}) {
  const result = await botApiResult(requestContext, section, endpoint, options);
  if (!result.ok || result.body?.success !== true) {
    throw new Error(
      result.body?.error ||
        result.body?.mensaje ||
        `Falló ${String(options.method || 'GET').toUpperCase()} ${endpoint} con HTTP ${result.status}`,
    );
  }
  return result.body;
}

async function getBotContact(requestContext, waId = botTestWaId()) {
  const data = await botApiCall(requestContext, 'panel', 'panel_chats');
  return (data.chats || []).find(
    (row) => digitsOnly(row?.wa_id) === digitsOnly(waId),
  ) || null;
}

async function openBotTestChat(page, waId = botTestWaId()) {
  await page.goto('/panel-bot');
  await expect(page.getByText('Panel Bot WhatsApp', { exact: true })).toBeVisible();

  const search = page.getByPlaceholder('Buscar por nombre, número, mensaje…');
  await expect(search).toBeVisible();
  await search.fill(waId);

  const row = page.locator('.wp-chatitem').filter({ hasText: waId }).first();
  await expect(
    row,
    `No apareció el contacto de testing ${waId} en el Panel Bot.`,
  ).toBeVisible({ timeout: 15000 });
  await row.click();

  await expect(page.locator('.wp-chat-top-id')).toHaveText(waId, {
    timeout: 15000,
  });
  await expect(page.locator('.wp-messages')).toBeVisible();
  return row;
}

async function openChatOptions(page) {
  await page.getByRole('button', { name: 'Opciones del chat' }).click();
  const menu = page.getByRole('menu', { name: 'Opciones del chat' });
  await expect(menu).toBeVisible();
  return menu;
}

function endpointMatcher(endpoint) {
  const file = normalizeBotEndpoint(endpoint);
  return (url) => {
    try {
      return new URL(url).pathname.endsWith(`/${file}`);
    } catch (_error) {
      return false;
    }
  };
}

async function waitForBotResponse(page, endpoint, predicate = () => true) {
  return page.waitForResponse(async (response) => {
    if (!endpointMatcher(endpoint)(response.url())) return false;
    if (!predicate(response)) return false;
    return true;
  });
}

module.exports = {
  DEFAULT_BOT_API_BASE,
  DEFAULT_BOT_TEST_LOCAL_NUMBER,
  DEFAULT_BOT_TEST_WA_ID,
  botApiCall,
  botApiResult,
  botApiUrl,
  botTestWaId,
  digitsOnly,
  endpointMatcher,
  getBotContact,
  normalizeBotWaId,
  normalizedBotApiBase,
  openBotTestChat,
  openChatOptions,
  waitForBotResponse,
};
