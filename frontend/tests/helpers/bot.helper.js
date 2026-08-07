const { expect } = require('@playwright/test');
const { loadTestEnv } = require('./env.helper');

loadTestEnv();

const DEFAULT_BOT_API_BASE =
  'https://lalcec.3devsnet.com/api/bot_whatsapp/funciones/Panel';
const DEFAULT_BOT_TEST_WA_ID = '5493492253860';

function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
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
  const value = digitsOnly(process.env.PW_BOT_WA_ID || DEFAULT_BOT_TEST_WA_ID);
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

async function botApiResult(requestContext, section, endpoint, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const response = await requestContext.fetch(
    botApiUrl(section, endpoint, options.params),
    {
      method,
      failOnStatusCode: false,
      headers: {
        Accept: 'application/json',
        ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...(options.data !== undefined ? { data: options.data } : {}),
    },
  );
  const body = await parseBotResponse(response);
  return {
    ok: response.ok() && body?.success !== false,
    status: response.status(),
    body,
    url: response.url(),
  };
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
  DEFAULT_BOT_TEST_WA_ID,
  botApiCall,
  botApiResult,
  botApiUrl,
  botTestWaId,
  digitsOnly,
  endpointMatcher,
  getBotContact,
  normalizedBotApiBase,
  openBotTestChat,
  openChatOptions,
  waitForBotResponse,
};
