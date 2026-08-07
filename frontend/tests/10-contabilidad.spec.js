const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { todayIso, uniqueSuffix } = require('./helpers/data.helper');

const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

function firstOption(catalogs, type) {
  const option = catalogs.opciones?.[type]?.[0];
  if (!option) throw new Error(`No existe una opción para ${type}. Ejecutá la migración de Contabilidad.`);
  return option;
}

function rowByText(page, tableName, text) {
  return page
    .getByRole('table', { name: tableName })
    .getByRole('row')
    .filter({ hasText: text })
    .last();
}

test.describe('Contabilidad: cuotas, otros ingresos, egresos y resumen', () => {

  test('elimina físicamente una opción usada sin romper el movimiento guardado', async ({ request }) => {
    const suffix = uniqueSuffix();
    const date = todayIso();
    const [year, month] = date.split('-').map(Number);
    const providerName = `PW E2E PROVEEDOR BORRABLE ${suffix}`;
    const detail = `PW E2E HISTORICO ${suffix}`;
    let providerId = null;
    let incomeId = null;

    try {
      const catalogs = await apiCall(request, 'contable_catalogos');
      const mean = catalogs.medios_pago?.[0];
      const incomeCategory = firstOption(catalogs, 'CATEGORIA_INGRESO');
      const incomeConcept = firstOption(catalogs, 'CONCEPTO_INGRESO');
      expect(mean).toBeTruthy();

      const createdProvider = await apiCall(request, 'contable_opcion_guardar', {
        method: 'POST',
        data: { tipo: 'PROVEEDOR', nombre: providerName },
      });
      providerId = Number(createdProvider.item.id_opcion);

      const savedIncome = await apiCall(request, 'contable_ingreso_guardar', {
        method: 'POST',
        data: {
          fecha: date,
          id_medio_pago: mean.id_medio_pago,
          id_proveedor: providerId,
          id_categoria: incomeCategory.id_opcion,
          id_concepto: incomeConcept.id_opcion,
          importe: 150.25,
          detalle: detail,
        },
      });
      incomeId = Number(savedIncome.id_ingreso);

      const removed = await apiCall(request, 'contable_opcion_eliminar', {
        method: 'POST',
        data: { id_opcion: providerId },
      });
      expect(removed.eliminado_definitivo).toBe(true);
      providerId = null;

      const configured = await apiCall(request, 'contable_opciones_configuracion');
      expect((configured.listas?.PROVEEDOR || []).some((item) => item.nombre === providerName)).toBe(false);

      const incomes = await apiCall(request, 'contable_ingresos_listar', {
        params: { anio: year, mes: month, buscar: suffix },
      });
      expect(incomes.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id_ingreso: incomeId,
          proveedor: providerName,
          detalle: detail,
        }),
      ]));
    } finally {
      if (incomeId) {
        await apiCall(request, 'contable_ingreso_eliminar', {
          method: 'POST',
          data: { id_ingreso: incomeId },
        }).catch(() => undefined);
      }
      if (providerId) {
        await apiCall(request, 'contable_opcion_eliminar', {
          method: 'POST',
          data: { id_opcion: providerId },
        }).catch(() => undefined);
      }
    }
  });
  test('integra todos los submódulos y refleja los movimientos en el resumen', async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const date = todayIso();
    const [year, month] = date.split('-').map(Number);
    const incomeDetail = `PW E2E INGRESO ${suffix}`;
    const expenseDetail = `PW E2E EGRESO ${suffix}`;
    const incomeAmount = 1234.56;
    const expenseAmount = 432.1;
    let incomeId = null;
    let expenseId = null;

    try {
      const catalogs = await apiCall(request, 'contable_catalogos');
      const mean = catalogs.medios_pago?.[0];
      expect(mean, 'Debe existir al menos un medio de pago activo').toBeTruthy();

      const provider = firstOption(catalogs, 'PROVEEDOR');
      const incomeCategory = firstOption(catalogs, 'CATEGORIA_INGRESO');
      const incomeConcept = firstOption(catalogs, 'CONCEPTO_INGRESO');
      const expenseCategory = firstOption(catalogs, 'CATEGORIA_EGRESO');
      const expenseConcept = firstOption(catalogs, 'CONCEPTO_EGRESO');

      const partnerIncome = await apiCall(request, 'contable_ingresos_socios', {
        params: { anio: year, mes: month },
      });
      expect(Array.isArray(partnerIncome.items)).toBeTruthy();
      expect(partnerIncome.resumen).toEqual(expect.objectContaining({
        registros: expect.any(Number),
        importe: expect.any(String),
        estimados: expect.any(Number),
        categorias: expect.any(Array),
      }));
      for (const item of partnerIncome.items) {
        expect(item).toEqual(expect.objectContaining({
          id_pago: expect.any(Number),
          fecha: expect.any(String),
          socio: expect.any(String),
          periodo: expect.any(String),
          monto: expect.any(String),
          monto_estimado: expect.any(Boolean),
        }));
      }

      const savedIncome = await apiCall(request, 'contable_ingreso_guardar', {
        method: 'POST',
        data: {
          fecha: date,
          id_medio_pago: mean.id_medio_pago,
          id_proveedor: provider.id_opcion,
          id_categoria: incomeCategory.id_opcion,
          id_concepto: incomeConcept.id_opcion,
          importe: incomeAmount,
          detalle: incomeDetail,
        },
      });
      incomeId = Number(savedIncome.id_ingreso);
      expect(incomeId).toBeGreaterThan(0);

      const savedExpense = await apiCall(request, 'contable_egreso_guardar', {
        method: 'POST',
        data: {
          fecha: date,
          id_medio_pago: mean.id_medio_pago,
          id_proveedor: provider.id_opcion,
          id_categoria: expenseCategory.id_opcion,
          id_concepto: expenseConcept.id_opcion,
          numero_comprobante: `E2E-${suffix}`,
          importe: expenseAmount,
          detalle: expenseDetail,
        },
      });
      expenseId = Number(savedExpense.id_egreso);
      expect(expenseId).toBeGreaterThan(0);

      const incomes = await apiCall(request, 'contable_ingresos_listar', {
        params: { anio: year, mes: month, buscar: suffix },
      });
      expect(incomes.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id_ingreso: incomeId,
          detalle: incomeDetail,
          importe: incomeAmount.toFixed(2),
        }),
      ]));

      const expenses = await apiCall(request, 'contable_egresos_listar', {
        params: { anio: year, mes: month, buscar: suffix },
      });
      expect(expenses.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id_egreso: expenseId,
          detalle: expenseDetail,
          importe: expenseAmount.toFixed(2),
          tiene_archivo: false,
        }),
      ]));

      const summaryResponse = await apiCall(request, 'contable_resumen', {
        params: { anio: year, mes: month },
      });
      const summary = summaryResponse.resumen;
      expect(summary.totales).toEqual(expect.objectContaining({
        ingresos_socios: expect.any(String),
        otros_ingresos: expect.any(String),
        ingresos: expect.any(String),
        egresos: expect.any(String),
        resultado: expect.any(String),
        pagos_estimados: expect.any(Number),
      }));
      const currentMonth = summary.meses.find((item) => Number(item.mes) === month);
      expect(currentMonth).toBeTruthy();
      expect(Number(currentMonth.otros_ingresos)).toBeGreaterThanOrEqual(incomeAmount);
      expect(Number(currentMonth.egresos)).toBeGreaterThanOrEqual(expenseAmount);
      expect(Number(currentMonth.resultado)).toBeCloseTo(
        Number(currentMonth.ingresos) - Number(currentMonth.egresos),
        2,
      );

      await page.goto('/contable/ingresos');
      await expect(page.getByRole('table', { name: 'Listado de ingresos' })).toBeVisible();
      await page.getByRole('tab', { name: 'Otros ingresos' }).click();
      await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(suffix);
      await expect(rowByText(page, 'Listado de ingresos', suffix)).toBeVisible();

      await page.goto('/contable/egresos');
      await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(suffix);
      await expect(rowByText(page, 'Listado de egresos', suffix)).toBeVisible();

      await page.goto('/contable/resumen');
      await expect(page.getByText('Resumen contable', { exact: true })).toBeVisible();
      const totals = page.getByRole('region', { name: 'Totales del período' });
      await expect(totals).toBeVisible();
      await expect(totals.getByText('Ingresos', { exact: true })).toBeVisible();
      await expect(totals.getByText('Egresos', { exact: true })).toBeVisible();
      await expect(totals.getByText('Resultado', { exact: true })).toBeVisible();

      const chart = page.getByRole('group', {
        name: 'Gráfico de barras de ingresos y egresos por mes',
      });
      await expect(chart).toBeVisible();
      await expect(
        chart.getByLabel(new RegExp(`^${MONTHS[month - 1]}:`, 'i')),
      ).toBeVisible();
    } finally {
      if (incomeId) {
        await apiCall(request, 'contable_ingreso_eliminar', {
          method: 'POST',
          data: { id_ingreso: incomeId },
        }).catch(() => undefined);
      }
      if (expenseId) {
        await apiCall(request, 'contable_egreso_eliminar', {
          method: 'POST',
          data: { id_egreso: expenseId },
        }).catch(() => undefined);
      }
    }
  });
});
