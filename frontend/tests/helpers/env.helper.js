const fs = require('fs');
const path = require('path');

let loaded = false;

function parseEnv(text) {
  const result = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function assertSingleApiDefinition(text) {
  const active = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && /^PW_API_URL\s*=/.test(line));
  if (active.length !== 1) {
    throw new Error(
      `En .env.test debe haber exactamente una PW_API_URL activa. Encontradas: ${active.length}.`,
    );
  }
}

function isLocalApi(apiUrl) {
  const value = String(apiUrl || '').trim();
  if (!value) return true;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch (_error) {
    return /(^|\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i.test(value);
  }
}

function resolveEnvironment() {
  const apiUrl = String(process.env.PW_API_URL || 'http://localhost:3001/routes')
    .trim()
    .replace(/\/+$/, '');
  const local = isLocalApi(apiUrl);

  if (!local) {
    let parsed;
    try {
      parsed = new URL(apiUrl);
    } catch (_error) {
      throw new Error(`PW_API_URL remota inválida: ${apiUrl}`);
    }
    const allowedHost = String(process.env.PW_REMOTE_HOST || 'lalcec.3devsnet.com')
      .trim()
      .toLowerCase();
    if (parsed.protocol !== 'https:') {
      throw new Error('El testing contra Hostinger exige una PW_API_URL HTTPS.');
    }
    if (parsed.hostname.toLowerCase() !== allowedHost) {
      throw new Error(
        `Host remoto bloqueado por seguridad: ${parsed.hostname}. Permitido: ${allowedHost}.`,
      );
    }
    if (!/^\/api\/routes(?:\/api\.php)?\/?$/i.test(parsed.pathname)) {
      throw new Error(
        `Ruta remota bloqueada por seguridad: ${parsed.pathname}. Se esperaba /api/routes o /api/routes/api.php.`,
      );
    }
  }

  process.env.PW_API_URL = apiUrl;
  process.env.PW_ENVIRONMENT = local ? 'local' : 'hostinger';

  // Una sola PW_API_URL controla también a qué API apunta el frontend React local.
  process.env.REACT_APP_API_URL = apiUrl;

  // Todas las llamadas disparadas por Playwright llevan este header. En el
  // backend activa un escudo que bloquea cualquier mutación sobre datos no E2E.
  process.env.PW_E2E_HEADER = 'PLAYWRIGHT';
  process.env.REACT_APP_E2E_HEADER = 'PLAYWRIGHT';
  process.env.PW_ALLOW_DB_CLEANUP = 'false';
  process.env.PW_FINAL_CLEANUP = 'true';

  // El frontend siempre se ejecuta local. El backend PHP solo se levanta para API local.
  process.env.PW_START_FRONTEND = 'true';
  process.env.PW_START_BACKEND = local ? 'true' : 'false';

  if (local) {
    process.env.PW_USER = String(process.env.PW_LOCAL_USER || process.env.PW_USER || '').trim();
    process.env.PW_PASSWORD = String(
      process.env.PW_LOCAL_PASSWORD || process.env.PW_PASSWORD || '',
    );
  } else {
    process.env.PW_USER = String(
      process.env.PW_HOSTINGER_USER || process.env.PW_USER || '',
    ).trim();
    process.env.PW_PASSWORD = String(
      process.env.PW_HOSTINGER_PASSWORD || process.env.PW_PASSWORD || '',
    );

  }

  return {
    apiUrl,
    environment: process.env.PW_ENVIRONMENT,
    isLocal: local,
  };
}

function loadTestEnv(rootDir = path.resolve(__dirname, '..', '..')) {
  if (loaded) return process.env;
  const envPath = path.join(rootDir, '.env.test');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    assertSingleApiDefinition(envText);
    const values = parseEnv(envText);
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }

    // La selección LOCAL/HOSTINGER se hace deliberadamente comentando una sola
    // PW_API_URL en .env.test. Esa elección debe ganar incluso si PowerShell dejó
    // una PW_API_URL vieja exportada de una ejecución anterior.
    if (Object.prototype.hasOwnProperty.call(values, 'PW_API_URL')) {
      process.env.PW_API_URL = values.PW_API_URL;
    }
  }
  resolveEnvironment();
  loaded = true;
  return process.env;
}

function envBoolean(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(value);
}

module.exports = {
  assertSingleApiDefinition,
  envBoolean,
  isLocalApi,
  loadTestEnv,
  parseEnv,
  resolveEnvironment,
};
