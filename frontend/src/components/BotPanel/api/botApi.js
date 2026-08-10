import { BOT_URL } from "../../../config/config";
import { clearSession, getSession } from "../../_shared/auth/session";

const BOT_SECTIONS = Object.freeze({
  panel: "endpoints",
  management: "puntos",
});

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

const request = async (
  section,
  endpoint,
  { method = "GET", params, body, formData, signal } = {},
) => {
  const session = getSession();
  const response = await fetch(buildBotUrl(section, endpoint, params), {
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

  const data = await parseResponse(response);

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok || !data?.success) {
    const error = new Error(
      data?.error || data?.mensaje || `Error HTTP ${response.status}`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const get = (section, endpoint, params, options = {}) =>
  request(section, endpoint, {
    method: "GET",
    params: {
      ...(params || {}),
      _: Date.now(),
    },
    ...options,
  });

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
