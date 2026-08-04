const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { normalizeUiText } = require('./helpers/data.helper');

function ars(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function metric(page, title) {
  return page.locator('.admin-dashboard__metric').filter({ hasText: title });
}

function activity(page, label) {
  return page.locator('.admin-dashboard__activityItem').filter({ hasText: label });
}

function financeRow(page, label) {
  return page.locator('.admin-dashboard__financeRows > div').filter({ hasText: label });
}

const emptySummary = {
  periodo: { mes_nombre: 'AGOSTO', anio: 2026 },
  socios: {
    activos: 0,
    inactivos: 0,
    personas_activas: 0,
    empresas_activas: 0,
    con_categoria: 0,
    con_familia: 0,
    con_recordatorio: 0,
  },
  familias: { activas: 0 },
  categorias: { distribucion: [] },
  cuotas: {
    pagadas_mes: 0,
    pendientes_mes: 0,
    cumplimiento_mes: 0,
    cobros_registrados_mes: 0,
    cobros_sin_importe_mes: 0,
  },
  contable: {
    ingresos_socios_mes: 0,
    otros_ingresos_mes: 0,
    egresos_mes: 0,
    saldo_mes: 0,
  },
  estado: {
    socios_con_categoria: 0,
    socios_con_familia: 0,
    socios_con_recordatorio: 0,
  },
  actividad: {
    altas_mes: 0,
    bajas_mes: 0,
    reactivaciones_mes: 0,
    cobros_mes: 0,
  },
  serie_cuotas: [],
  pagos_recientes: [],
  fuentes: { contable_disponible: false },
};

test.describe('Dashboard', () => {
  test('muestra todos los datos reales y consistentes con la API', async ({ page, request }) => {
    const api = await apiCall(request, 'dashboard_resumen');
    const summary = api.resumen;

    await page.goto('/panel');
    await expect(page.getByRole('heading', { name: 'Panel de gestión' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.admin-dashboard__period')).toContainText(
      summary.periodo?.mes_nombre || 'MES ACTUAL',
    );
    await expect(page.locator('.admin-dashboard__period')).toContainText(
      String(summary.periodo?.anio || new Date().getFullYear()),
    );

    await expect(metric(page, 'Socios activos').locator('strong')).toHaveText(
      String(Number(summary.socios.activos || 0)),
    );
    await expect(metric(page, 'Socios activos')).toContainText(
      `${Number(summary.socios.inactivos || 0)} de baja`,
    );
    await expect(metric(page, 'Personas activas').locator('strong')).toHaveText(
      String(Number(summary.socios.personas_activas || 0)),
    );
    await expect(metric(page, 'Empresas activas').locator('strong')).toHaveText(
      String(Number(summary.socios.empresas_activas || 0)),
    );
    await expect(metric(page, 'Cuotas pagadas').locator('strong')).toHaveText(
      String(Number(summary.cuotas.pagadas_mes || 0)),
    );
    await expect(metric(page, 'Cuotas pendientes').locator('strong')).toHaveText(
      String(Number(summary.cuotas.pendientes_mes || 0)),
    );

    const balanceText = await metric(page, 'Saldo del mes').locator('strong').innerText();
    expect(normalizeUiText(balanceText)).toBe(normalizeUiText(ars(summary.contable.saldo_mes)));

    await expect(activity(page, 'Altas del mes').locator('strong')).toHaveText(
      String(Number(summary.actividad.altas_mes || 0)),
    );
    await expect(activity(page, 'Bajas del mes').locator('strong')).toHaveText(
      String(Number(summary.actividad.bajas_mes || 0)),
    );
    await expect(activity(page, 'Reactivaciones').locator('strong')).toHaveText(
      String(Number(summary.actividad.reactivaciones_mes || 0)),
    );
    await expect(activity(page, 'Cobros cargados').locator('strong')).toHaveText(
      String(Number(summary.actividad.cobros_mes || 0)),
    );

    await expect(
      page.getByLabel(
        `Socios con categoría: ${Number(summary.estado.socios_con_categoria || 0)}%`,
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel(
        `Personas con familia: ${Number(summary.estado.socios_con_familia || 0)}%`,
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel(
        `Recordatorios habilitados: ${Number(summary.estado.socios_con_recordatorio || 0)}%`,
      ),
    ).toBeVisible();

    const chart = page.getByRole('img', {
      name: 'Cuotas registradas durante los últimos seis períodos',
    });
    await expect(chart).toBeVisible();
    await expect(chart.locator('.admin-dashboard__chartMonth')).toHaveCount(
      (summary.serie_cuotas || []).length,
    );
    for (const [index, item] of (summary.serie_cuotas || []).entries()) {
      const column = chart.locator('.admin-dashboard__chartMonth').nth(index);
      await expect(column.locator('.admin-dashboard__chartValue')).toHaveText(
        String(Number(item.pagadas || 0)),
      );
      await expect(column).toContainText(item.etiqueta || '');
    }

    await expect(financeRow(page, 'Cuotas cobradas').locator('strong')).toHaveText(
      ars(summary.contable.ingresos_socios_mes),
    );
    await expect(financeRow(page, 'Otros ingresos').locator('strong')).toHaveText(
      ars(summary.contable.otros_ingresos_mes),
    );
    await expect(financeRow(page, 'Egresos').locator('strong')).toHaveText(
      ars(summary.contable.egresos_mes),
    );
    await expect(financeRow(page, 'Resultado').locator('strong')).toHaveText(
      ars(summary.contable.saldo_mes),
    );

    if (!summary.fuentes?.contable_disponible) {
      await expect(page.getByText(/se mostrarán cuando estén disponibles las tablas del módulo Contable/i)).toBeVisible();
    }
    if (Number(summary.cuotas.cobros_sin_importe_mes || 0) > 0) {
      await expect(page.getByText(/cobro.*sin monto/i)).toBeVisible();
    }

    const recent = summary.pagos_recientes || [];
    if (recent.length) {
      await expect(page.locator('.admin-dashboard__recentItem')).toHaveCount(recent.length);
      for (const [index, payment] of recent.entries()) {
        const item = page.locator('.admin-dashboard__recentItem').nth(index);
        await expect(item).toContainText(payment.socio);
        await expect(item).toContainText(payment.mes_nombre);
        await expect(item).toContainText(payment.medio_pago);
        await expect(item).toContainText(
          payment.monto === null ? 'Sin importe' : ars(payment.monto),
        );
      }
    } else {
      await expect(page.locator('.admin-dashboard__empty')).toContainText(
        'Todavía no hay pagos registrados.',
      );
    }

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Panel de gestión' })).toBeVisible();
  });

  test('renderiza correctamente un escenario vacío y los avisos de disponibilidad', async ({ page }) => {
    await page.route('**/api.php?action=dashboard_resumen', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, exito: true, resumen: emptySummary }),
      });
    });

    await page.goto('/panel');
    await expect(metric(page, 'Socios activos').locator('strong')).toHaveText('0');
    await expect(metric(page, 'Saldo del mes').locator('strong')).toHaveText(ars(0));
    await expect(
      page.getByRole('img', { name: 'Cuotas registradas durante los últimos seis períodos' })
        .locator('.admin-dashboard__chartMonth'),
    ).toHaveCount(0);
    await expect(page.locator('.admin-dashboard__empty')).toHaveText(
      'Todavía no hay pagos registrados.',
    );
    await expect(page.getByText(/tablas del módulo Contable/i)).toBeVisible();
  });

  test('muestra el error del backend y permite reintentar sin recargar la aplicación', async ({ page }) => {
    // React.StrictMode monta, limpia y vuelve a montar los efectos en desarrollo.
    // Por eso no se debe decidir la respuesta usando "la primera solicitud":
    // esa solicitud puede quedar abortada antes de que el componente procese el error.
    let responseMode = 'error';
    let errorAttempts = 0;
    let successAttempts = 0;

    await page.route('**/api.php?action=dashboard_resumen', async (route) => {
      if (responseMode === 'error') {
        errorAttempts += 1;
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            exito: false,
            codigo: 'E2E_CONTROLADO',
            mensaje: 'Fallo controlado del dashboard.',
          }),
        });
        return;
      }

      successAttempts += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, exito: true, resumen: emptySummary }),
      });
    });

    await page.goto('/panel');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('No se pudo cargar el dashboard');
    await expect(alert).toContainText('Fallo controlado del dashboard.');
    expect(errorAttempts).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      window.__e2eDashboardRetryMarker = 'preserved';
    });
    responseMode = 'success';

    await alert.getByRole('button', { name: /Reintentar/i }).click();
    await expect(alert).toHaveCount(0);
    await expect(metric(page, 'Socios activos').locator('strong')).toHaveText('0');
    expect(successAttempts).toBeGreaterThanOrEqual(1);
    await expect(page).toHaveURL(/\/panel$/);
    expect(
      await page.evaluate(() => window.__e2eDashboardRetryMarker),
    ).toBe('preserved');
  });
});
