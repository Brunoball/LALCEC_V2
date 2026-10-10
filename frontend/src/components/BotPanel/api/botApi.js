import { BOT_URL } from "../../../config/config";
import { getSession } from "../../_shared/auth/session";

const BOT_SECTIONS = Object.freeze({
  panel: "endpoints",
  management: "puntos",
});

const READ_ENDPOINTS = new Set([
  "panel_chats",
  "panel_mensajes",
  "panel_global_hash",
  "etiquetas_list",
]);

const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);
const READ_RETRY_DELAYS = [350, 900];

const endpointKey = (endpoint) =>
  String(endpoint || "").trim().replace(/\.php$/i, "");

const normalizeEndpoint = (endpoint) => {
  const clean = String(endpoint || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!clean) {
    throw new Error("Falta indicar la ruta del bot.");
  }

  return /\.php$/i.test(clean) ? clean : `${clean}.php`;
};

const buildBotUrl = (section, endpoint, params = {}) => {
  const folder = BOT_SECTIONS[section];
  if (!folder) {
    throw new Error(`Sección del bot no válida: ${section}`);
  }

  const url = new URL(
    `${BOT_URL}/${folder}/${normalizeEndpoint(endpoint)}`,
    window.location.origin,
  );

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const parseResponse = async (response) => {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("El backend del bot devolvió una respuesta no válida.");
    error.status = response.status;
    throw error;
  }
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const requestDirectly = async (
  section,
  endpoint,
  { method = "GET", params, body, formData, signal } = {},
) => {
  const session = getSession();
  return fetch(buildBotUrl(section, endpoint, params), {
    method,
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(formData ? { body: formData } : {}),
  });
};

const request = async (
  section,
  endpoint,
  { method = "GET", params, body, formData, signal } = {},
) => {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const canRetry =
    normalizedMethod === "GET" && READ_ENDPOINTS.has(endpointKey(endpoint));

  let attempt = 0;

  while (true) {
    let response;

    try {
      response = await requestDirectly(section, endpoint, {
        method: normalizedMethod,
        params,
        body,
        formData,
        signal,
      });
    } catch (error) {
      const aborted = signal?.aborted || error?.name === "AbortError";
      const offline = navigator.onLine === false;
      if (
        !canRetry ||
        aborted ||
        offline ||
        attempt >= READ_RETRY_DELAYS.length
      ) {
        throw error;
      }

      await wait(READ_RETRY_DELAYS[attempt]);
      attempt += 1;
      continue;
    }

    if (
      canRetry &&
      RETRYABLE_HTTP_STATUSES.has(response.status) &&
      attempt < READ_RETRY_DELAYS.length &&
      !signal?.aborted
    ) {
      // Consumir/cerrar el body antes de repetir para no dejar recursos de la
      // respuesta anterior pendientes en navegadores/proxies.
      try {
        await response.text();
      } catch {}

      await wait(READ_RETRY_DELAYS[attempt]);
      attempt += 1;
      continue;
    }

    const data = await parseResponse(response);

    if (!response.ok || !data?.success) {
      const error = new Error(
        data?.error || data?.mensaje || `Error HTTP ${response.status}`,
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }
};

const readsInFlight = new Map();

const get = (section, endpoint, params, options = {}) => {
  const readOnly = READ_ENDPOINTS.has(endpointKey(endpoint));
  // Sólo agrupar lecturas. Los GET que marcan leído/no leído son mutaciones.
  const key = readOnly && !options.signal ? JSON.stringify([
    getSession()?.token || "", section, endpoint,
    Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b)),
  ]) : null;
  if (key && readsInFlight.has(key)) return readsInFlight.get(key);
  const controller = !options.signal ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : null;
  const pending = request(section, endpoint, {
    method: "GET",
    params: { ...(params || {}), _: Date.now() },
    ...(controller ? { signal: controller.signal } : {}),
    ...options,
  }).finally(() => {
    if (timeout !== null) window.clearTimeout(timeout);
    if (key && readsInFlight.get(key) === pending) readsInFlight.delete(key);
  });
  if (key) readsInFlight.set(key, pending);
  return pending;
};

const post = (section, endpoint, body, options = {}) =>
  request(section, endpoint, {
    method: "POST",
    body,
    ...options,
  });

const formPost = (section, endpoint, formData, options = {}) =>
  request(section, endpoint, {
    method: "POST",
    formData,
    ...options,
  });

export const botPanelGet = (endpoint, params, options) =>
  get("panel", endpoint, params, options);

export const botPanelPost = (endpoint, body, options) =>
  post("panel", endpoint, body, options);

export const botPanelFormPost = (endpoint, formData, options) =>
  formPost("panel", endpoint, formData, options);

export const botManagementGet = (endpoint, params, options) =>
  get("management", endpoint, params, options);

export const botManagementPost = (endpoint, body, options) =>
  post("management", endpoint, body, options);
