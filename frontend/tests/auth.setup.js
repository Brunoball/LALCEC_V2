const fs = require('fs');
const path = require('path');
const { request } = require('@playwright/test');
const {
  AUTH_FILE,
  BASELINE_FILE,
  apiResult,
  cleanupAllE2E,
  closeApiSession,
  createApiSession,
  e2eRequestHeaders,
  e2eSnapshot,
  e2eStatus,
  normalizedApiBase,
} = require('./helpers/api.helper');
const { loadTestEnv } = require('./helpers/env.helper');

function skippedFrom(body) {
  return body?.omitidos_por_seguridad || {};
}

function residueTotal(body) {
  const residues = body?.residuos || {};
  return Object.values(residues).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

module.exports = async function globalSetup() {
  loadTestEnv(path.resolve(__dirname, '..'));
  const username = process.env.PW_USER;
  const password = process.env.PW_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `Faltan credenciales para ${process.env.PW_ENVIRONMENT || 'el entorno seleccionado'}. ` +
        'Completá PW_LOCAL_USER/PW_LOCAL_PASSWORD o PW_HOSTINGER_USER/PW_HOSTINGER_PASSWORD en .env.test.',
    );
  }

  const api = await request.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: e2eRequestHeaders(),
  });
  let session = null;

  try {
    session = await createApiSession(api, { username, password });
    if (session.usuario?.rol !== 'admin') {
      throw new Error('PW_USER debe corresponder a un administrador para probar altas, edición y bajas.');
    }

    // 0) Probe sin efectos: si el Router no está ejecutando el guard E2E,
    // el handler respondería E2E_GUARD_NOT_ACTIVE y se aborta la suite.
    const guardProbe = await apiResult(api, 'e2e_guard_probe', {
      method: 'POST',
      data: {},
      session,
    });
    if (guardProbe.status !== 409 || guardProbe.body?.codigo !== 'E2E_SCOPE_BLOCKED') {
      throw new Error(
        'El backend remoto NO confirmó el escudo de mutaciones E2E. ' +
          `Respuesta probe: HTTP ${guardProbe.status} ${JSON.stringify(guardProbe.body || {})}`,
      );
    }

    // 1) Limpia restos de una ejecución anterior ANTES de comenzar.
    const cleanup = await cleanupAllE2E(api, session);
    const skipped = skippedFrom(cleanup);
    if (Object.keys(skipped).length > 0) {
      throw new Error(
        `La limpieza inicial omitió registros por seguridad: ${JSON.stringify(skipped)}`,
      );
    }

    // 2) No se inicia ninguna prueba si quedó basura E2E previa.
    const status = await e2eStatus(api, session);
    const remaining = residueTotal(status);
    if (remaining !== 0) {
      throw new Error(
        `La base no quedó limpia antes del testing. Residuos E2E: ${JSON.stringify(status.residuos || {})}`,
      );
    }

    // 3) Guarda una huella de todos los registros NO E2E. El teardown la
    // compara para detectar cualquier cambio real durante la ejecución.
    const snapshotBody = await e2eSnapshot(api, session);
    if (!snapshotBody?.snapshot?.sha256) {
      throw new Error('El backend no devolvió una huella E2E válida de los datos reales.');
    }

    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(
      BASELINE_FILE,
      JSON.stringify(
        {
          api: normalizedApiBase(),
          environment: process.env.PW_ENVIRONMENT,
          created_at: new Date().toISOString(),
          snapshot: snapshotBody.snapshot,
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), 'utf8');

    console.log(
      `[Playwright safety] Entorno=${process.env.PW_ENVIRONMENT}; API=${normalizedApiBase()}; ` +
        'cleanup inicial OK; baseline de datos reales guardado.',
    );
  } catch (error) {
    if (session) {
      await closeApiSession(api, session).catch(() => undefined);
    }
    fs.rmSync(AUTH_FILE, { force: true });
    fs.rmSync(BASELINE_FILE, { force: true });
    throw error;
  } finally {
    await api.dispose();
  }
};
