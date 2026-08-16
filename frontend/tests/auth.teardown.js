const fs = require('fs');
const { request } = require('@playwright/test');
const {
  AUTH_FILE,
  BASELINE_FILE,
  cleanupAllE2E,
  closeApiSession,
  e2eRequestHeaders,
  e2eSnapshot,
  e2eStatus,
} = require('./helpers/api.helper');
const { loadTestEnv } = require('./helpers/env.helper');

loadTestEnv();

function sumValues(values) {
  return Object.values(values || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function snapshotDiff(before, after) {
  const names = new Set([
    ...Object.keys(before?.tablas || {}),
    ...Object.keys(after?.tablas || {}),
  ]);
  const changed = [];
  for (const name of [...names].sort()) {
    const a = before?.tablas?.[name];
    const b = after?.tablas?.[name];
    if (!a || !b || Number(a.count) !== Number(b.count) || a.sha256 !== b.sha256) {
      changed.push({ tabla: name, antes: a || null, despues: b || null });
    }
  }
  return changed;
}

module.exports = async function globalTeardown() {
  if (!fs.existsSync(AUTH_FILE)) {
    fs.rmSync(BASELINE_FILE, { force: true });
    return;
  }

  const session = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  const baseline = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    : null;
  const api = await request.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: e2eRequestHeaders(),
  });
  let teardownError = null;

  try {
    // Siempre se limpia. En producción env.helper fuerza PW_FINAL_CLEANUP=true.
    const cleanup = await cleanupAllE2E(api, session);
    const skipped = cleanup?.omitidos_por_seguridad || {};
    if (Object.keys(skipped).length > 0) {
      throw new Error(
        `La limpieza final omitió registros por seguridad: ${JSON.stringify(skipped)}`,
      );
    }

    const deleted = cleanup?.eliminados || {};
    console.log(
      `[Playwright cleanup] ${sumValues(deleted)} registro(s)/archivo(s) E2E eliminados.`,
    );

    // Si quedó un solo residuo E2E, la corrida se considera fallida.
    const status = await e2eStatus(api, session);
    const remaining = sumValues(status?.residuos || {});
    if (remaining !== 0) {
      throw new Error(
        `La limpieza final dejó residuos E2E: ${JSON.stringify(status?.residuos || {})}`,
      );
    }

    // Comprueba que los registros NO E2E sigan exactamente con la misma huella.
    if (!baseline?.snapshot?.sha256) {
      throw new Error('No existe baseline de integridad de datos reales para comparar al finalizar.');
    }
    const currentBody = await e2eSnapshot(api, session);
    const current = currentBody?.snapshot;
    if (!current?.sha256) {
      throw new Error('El backend no devolvió la huella final de datos reales.');
    }
    if (baseline.snapshot.sha256 !== current.sha256) {
      const changed = snapshotDiff(baseline.snapshot, current);
      throw new Error(
        'La huella de datos reales cambió durante el testing. ' +
          `Tablas distintas: ${JSON.stringify(changed)}`,
      );
    }

    console.log('[Playwright safety] Integridad OK: ningún registro NO E2E cambió durante la corrida.');
  } catch (error) {
    teardownError = error;
  } finally {
    // auth_logout en modo E2E elimina físicamente la sesión usada por Playwright.
    try {
      await closeApiSession(api, session);
    } catch (logoutError) {
      if (!teardownError) {
        teardownError = new Error(
          `No se pudo eliminar la sesión E2E final: ${logoutError?.message || logoutError}`,
        );
      }
    }

    await api.dispose();
    fs.rmSync(AUTH_FILE, { force: true });
    fs.rmSync(BASELINE_FILE, { force: true });
  }

  if (teardownError) throw teardownError;
};
