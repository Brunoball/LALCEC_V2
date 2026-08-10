import BASE_URL, {
  BOT_URL,
  isLocalFrontendRuntime,
} from "../../../config/config";
import { getSession } from "../../_shared/auth/session";

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

const buildLocalProxyUrl = () => {
  const normalizedBaseUrl = String(BASE_URL || "").trim().replace(/\/+$/, "");
  const apiUrl = /\/api\.php$/i.test(normalizedBaseUrl)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api.php`;
  const url = new URL(apiUrl, window.location.origin);
  url.searchParams.set("action", "bot_panel_proxy");
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

const buildProxyFormData = (section, endpoint, params, formData) => {
  const proxied = new FormData();
  proxied.append("__bot_proxy_section", section);
  proxied.append("__bot_proxy_endpoint", normalizeEndpoint(endpoint));
  proxied.append("__bot_proxy_method", "POST");
  proxied.append("__bot_proxy_params", JSON.stringify(params || {}));

  for (const [key, value] of formData.entries()) {
    proxied.append(key, value);
  }

  return proxied;
};

const requestThroughLocalProxy = async (
  section,
  endpoint,
  { method = "GET", params, body, formData, signal } = {},
) => {
  const session = getSession();
  const headers = {
    Accept: "application/json",
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };

  const fetchOptions = {
    method: "POST",
    signal,
    cache: "no-store",
    credentials: "include",
    headers,
  };

  if (formData) {
    fetchOptions.body = buildProxyFormData(section, endpoint, params, formData);
  } else {
    fetchOptions.headers = {
      ...headers,
      "Content-Type": "application/json",
    };
    fetchOptions.body = JSON.stringify({
      section,
      endpoint: normalizeEndpoint(endpoint),
      method,
      params: params || {},
      body: body || {},
    });
  }

  return fetch(buildLocalProxyUrl(), fetchOptions);
};

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
  // Los navegadores bloquean por CORS localhost -> Hostinger. En desarrollo
  // se usa el backend local como puente; en producción se conserva exactamente
  // la llamada directa actual al bot alojado en Hostinger.
  const response = isLocalFrontendRuntime()
    ? await requestThroughLocalProxy(section, endpoint, {
        method,
        params,
        body,
        formData,
        signal,
      })
    : await requestDirectly(section, endpoint, {
        method,
        params,
        body,
        formData,
        signal,
      });

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
