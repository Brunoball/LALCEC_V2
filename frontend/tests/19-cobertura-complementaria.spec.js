const { test, expect } = require('./fixtures/auth.fixture');
const { categoryData } = require('./fixtures/categorias.fixture');
const { personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupCategoriesByPrefix,
  cleanupDiscountsByThresholds,
  cleanupSocioByDocument,
  expectApiError,
  readAuditActions,
} = require('./helpers/api.helper');
const { createPerson } = require('./helpers/entities.helper');
const { todayIso } = require('./helpers/data.helper');

function isoDaysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function actionNames(rows) {
  return rows.map((row) => row.accion);
}

async function cleanupPerson(request, person) {
  await cleanupSocioByDocument(request, {
    tipo: 'PERSONA',
    documento: person.dni,
  }).catch(() => undefined);
}

test.describe.configure({ mode: 'serial' });

test.describe('Cobertura complementaria de contratos y regresiones', () => {
  test('ejercita por API el ciclo completo de categoría: alta, historial, baja, reactivación y auditoría', async ({ request }) => {
    const category = categoryData();
    await cleanupCategoriesByPrefix(request, category.prefix);

    try {
      const created = await apiCall(request, 'categorias_guardar', {
        method: 'POST',
        data: {
          nombre: category.nombre,
          descripcion: category.descripcion,
          monto_actual: category.montoInicial,
          vigente_desde: todayIso(),
        },
      });
      const id = Number(created.item?.id_categoria);
      expect(id).toBeGreaterThan(0);
      expect(created.item?.activo).toBe(true);
      expect(created.item?.monto_actual).toBe(category.montoInicial);

      const history = await apiCall(request, 'categorias_historial', {
        params: { id },
      });
      expect(history.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            monto_anterior: '0.00',
            monto_nuevo: category.montoInicial,
          }),
        ]),
      );

      const disabled = await apiCall(request, 'categorias_eliminar', {
        method: 'POST',
        data: { id },
      });
      expect(disabled.item?.activo).toBe(false);

      const inactive = await apiCall(request, 'categorias_listar', {
        params: { estado: 'inactivo', buscar: category.nombre },
      });
      expect(inactive.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id_categoria: id, activo: false }),
        ]),
      );

      const reactivated = await apiCall(request, 'categorias_reactivar', {
        method: 'POST',
        data: { id },
      });
      expect(reactivated.item?.activo).toBe(true);

      await expectApiError(
        request,
        'categorias_eliminar',
        { method: 'POST', data: { id: 999999999 } },
        { status: 404, code: 'CATEGORIA_NO_ENCONTRADA' },
      );

      const audit = await readAuditActions(request, 'categorias', id);
      expect(actionNames(audit)).toEqual(
        expect.arrayContaining(['CREAR', 'DAR_BAJA', 'REACTIVAR']),
      );
    } finally {
      await cleanupCategoriesByPrefix(request, category.prefix).catch(() => undefined);
    }
  });

  test('blinda reglas históricas y validaciones de rango/vigencia de descuentos familiares', async ({ request }) => {
    const threshold = 47;
    await cleanupDiscountsByThresholds(request, [threshold]);

    try {
      await expectApiError(
        request,
        'descuentos_familiares_guardar',
        {
          method: 'POST',
          data: {
            cantidad_integrantes_desde: threshold,
            cantidad_integrantes_hasta: threshold - 1,
            porcentaje_descuento: '12.50',
            vigencia_desde: '1997-01-01',
            vigencia_hasta: '1997-12-31',
            descripcion: 'PW E2E RANGO INVALIDO',
          },
        },
        { status: 422, code: 'RANGO_INTEGRANTES_INVALIDO' },
      );

      await expectApiError(
        request,
        'descuentos_familiares_guardar',
        {
          method: 'POST',
          data: {
            cantidad_integrantes_desde: threshold,
            cantidad_integrantes_hasta: threshold,
            porcentaje_descuento: '12.50',
            vigencia_desde: '1997-12-31',
            vigencia_hasta: '1997-01-01',
            descripcion: 'PW E2E VIGENCIA INVALIDA',
          },
        },
        { status: 422, code: 'VIGENCIA_DESCUENTO_INVALIDA' },
      );

      const created = await apiCall(request, 'descuentos_familiares_guardar', {
        method: 'POST',
        data: {
          cantidad_integrantes_desde: threshold,
          cantidad_integrantes_hasta: threshold,
          porcentaje_descuento: '12.50',
          vigencia_desde: '1997-01-01',
          vigencia_hasta: '1997-12-31',
          descripcion: 'PW E2E DESCUENTO HISTORICO COMPLEMENTARIO',
        },
      });
      const id = Number(created.item?.id_descuento_familiar);
      expect(id).toBeGreaterThan(0);

      await apiCall(request, 'descuentos_familiares_eliminar', {
        method: 'POST',
        data: { id },
      });

      const historical = await apiCall(request, 'descuentos_familiares_listar', {
        params: { estado: 'historial' },
      });
      expect(historical.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id_descuento_familiar: id,
            activo: false,
          }),
        ]),
      );

      await expectApiError(
        request,
        'descuentos_familiares_eliminar',
        { method: 'POST', data: { id } },
        { status: 409, code: 'ESTADO_SIN_CAMBIOS' },
      );

      await expectApiError(
        request,
        'descuentos_familiares_guardar',
        {
          method: 'POST',
          data: {
            id_descuento_familiar: id,
            cantidad_integrantes_desde: threshold,
            cantidad_integrantes_hasta: threshold,
            porcentaje_descuento: '13.50',
            vigencia_desde: '1997-01-01',
            vigencia_hasta: '1997-12-31',
            descripcion: 'PW E2E NO EDITAR HISTORICO',
          },
        },
        { status: 409, code: 'DESCUENTO_FAMILIAR_HISTORICO' },
      );

      const audit = await readAuditActions(request, 'descuentos_familiares', id);
      expect(actionNames(audit)).toEqual(expect.arrayContaining(['CREAR', 'ELIMINAR']));
    } finally {
      await cleanupDiscountsByThresholds(request, [threshold]).catch(() => undefined);
    }
  });

  test('condona una cuota por API, evita duplicados, la lista y revierte la condonación', async ({ request }) => {
    const category = categoryData();
    const person = personData();
    await cleanupCategoriesByPrefix(request, category.prefix);
    await cleanupPerson(request, person);

    try {
      const createdCategory = await apiCall(request, 'categorias_guardar', {
        method: 'POST',
        data: {
          nombre: category.nombre,
          descripcion: 'PW E2E CATEGORIA PARA CONDONACION',
          monto_actual: '1000.00',
          vigente_desde: todayIso(),
        },
      });
      const categoryId = Number(createdCategory.item.id_categoria);
      const savedPerson = await createPerson(request, person, {
        id_categoria: categoryId,
      });
      const idSocio = Number(savedPerson.id_socio);
      const [year, month] = todayIso().split('-').map(Number);

      await expectApiError(
        request,
        'cuotas_condonar_pago',
        {
          method: 'POST',
          data: {
            id_socio: idSocio,
            anio: year,
            mes: month,
            fecha_condonacion: isoDaysFromNow(1),
          },
        },
        { status: 422, code: 'VALIDATION_ERROR' },
      );

      const condoned = await apiCall(request, 'cuotas_condonar_pago', {
        method: 'POST',
        data: {
          id_socio: idSocio,
          anio: year,
          mes: month,
          fecha_condonacion: todayIso(),
        },
      });
      const paymentId = Number(condoned.item?.id_pago);
      expect(paymentId).toBeGreaterThan(0);
      expect(condoned.item?.estado).toBe('CONDONADO');
      expect(Number(condoned.item?.monto)).toBe(0);

      const listed = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: 'PERSONA',
          estado: 'CONDONADOS',
          anio: year,
          mes: month,
          buscar: person.dni,
          incluir_catalogos: 0,
        },
      });
      expect(listed.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id_socio: idSocio,
            id_pago: paymentId,
            estado: 'CONDONADO',
          }),
        ]),
      );

      await expectApiError(
        request,
        'cuotas_condonar_pago',
        {
          method: 'POST',
          data: {
            id_socio: idSocio,
            anio: year,
            mes: month,
            fecha_condonacion: todayIso(),
          },
        },
        { status: 409, code: 'PAGO_YA_REGISTRADO' },
      );

      const reverted = await apiCall(request, 'cuotas_eliminar_pago', {
        method: 'POST',
        data: { id_pago: paymentId },
      });
      expect(reverted.item?.estado).toBe('CONDONADO');

      const debt = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: 'PERSONA',
          estado: 'DEUDORES',
          anio: year,
          mes: month,
          buscar: person.dni,
          incluir_catalogos: 0,
        },
      });
      expect(debt.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id_socio: idSocio })]),
      );
    } finally {
      await cleanupPerson(request, person);
      await cleanupCategoriesByPrefix(request, category.prefix).catch(() => undefined);
    }
  });

  test('rechaza filtros y operaciones inválidas en categorías, descuentos, contable y saldos a favor', async ({ request }) => {
    await expectApiError(
      request,
      'categorias_listar',
      { params: { estado: 'desconocido' } },
      { status: 422, code: 'FILTRO_INVALIDO' },
    );
    await expectApiError(
      request,
      'descuentos_familiares_listar',
      { params: { estado: 'desconocido' } },
      { status: 422, code: 'FILTRO_INVALIDO' },
    );
    await expectApiError(
      request,
      'cuotas_saldos_favor',
      { params: { tipo: 'OTRO' } },
      { status: 422, code: 'FILTRO_INVALIDO' },
    );
    await expectApiError(
      request,
      'contable_ingresos_socios',
      { params: { tipo: 'OTRO' } },
      { status: 422, code: 'TIPO_SOCIO_INVALIDO' },
    );
    await expectApiError(
      request,
      'cuotas_ajustar_saldo_favor',
      {
        method: 'POST',
        data: { id_socio: 999999999, operacion: 'OTRA', saldo_objetivo: '10.00' },
      },
      { status: 422, code: 'VALIDATION_ERROR' },
    );
  });

  test('Cuotas mantiene filtros separados con sidebar expandido y el modal de saldo conserva floating labels y ayudas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/cuotas');

    const filters = page.locator('.cuotas-head-filters');
    await expect(filters).toBeVisible();
    await expect(filters.locator('.cuotas-year-filter')).toBeHidden();
    await expect(page.locator('.cuotas-lower-year-filter')).toBeVisible();

    const sidebar = page.locator('.pp-sidebar');
    await sidebar.hover();
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width || 0)).toBeGreaterThan(200);

    const selectors = [
      '.module-filter--tabs',
      '.cuotas-search-filter',
      '.cuotas-month-filter',
      '.cuotas-payment-method-filter',
    ];
    const boxes = [];
    for (const selector of selectors) {
      const locator = filters.locator(selector);
      await expect(locator).toBeVisible();
      boxes.push(await locator.boundingBox());
    }

    for (let index = 0; index < boxes.length - 1; index += 1) {
      const current = boxes[index];
      const next = boxes[index + 1];
      expect(current).toBeTruthy();
      expect(next).toBeTruthy();
      const gap = next.x - (current.x + current.width);
      expect(gap, `Gap incorrecto entre filtros ${index + 1} y ${index + 2}`).toBeGreaterThanOrEqual(8);
      expect(gap, `Gap incorrecto entre filtros ${index + 1} y ${index + 2}`).toBeLessThanOrEqual(12);
      expect(Math.abs((current.y + current.height / 2) - (next.y + next.height / 2))).toBeLessThanOrEqual(3);
    }

    const searchControl = filters.locator('.cuotas-search-filter');
    const searchLabel = searchControl.locator('.module-floatingLabel');
    const [searchBox, labelBox] = await Promise.all([
      searchControl.boundingBox(),
      searchLabel.boundingBox(),
    ]);
    expect(labelBox.x).toBeGreaterThanOrEqual(searchBox.x - 1);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(searchBox.x + searchBox.width + 1);

    await page.getByRole('tab', { name: /Saldos a favor/i }).click();
    await expect(filters).toHaveClass(/cuotas-head-filters--balance/);
    await expect(filters.locator('.cuotas-month-filter')).toHaveCount(0);
    await expect(filters.locator('.cuotas-payment-method-filter')).toHaveCount(0);
    await expect(filters.locator('.cuotas-year-filter')).toHaveCount(0);

    const balanceTabs = filters.locator('.module-filter--tabs');
    const balanceSearch = filters.locator('.cuotas-search-filter');
    const [tabsBox, balanceSearchBox] = await Promise.all([
      balanceTabs.boundingBox(),
      balanceSearch.boundingBox(),
    ]);
    const balanceGap = balanceSearchBox.x - (tabsBox.x + tabsBox.width);
    expect(balanceGap).toBeGreaterThanOrEqual(8);
    expect(balanceGap).toBeLessThanOrEqual(12);

    await page.getByRole('button', { name: 'Agregar saldo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Agregar saldo a favor' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: 'Buscar socio' })).toHaveAttribute(
      'placeholder',
      'Nombre, apellido o DNI...',
    );
    await expect(dialog.getByRole('textbox', { name: 'Saldo a favor total' })).toHaveAttribute(
      'placeholder',
      '0.00',
    );
    await expect(dialog.getByRole('textbox', { name: 'Observación del saldo a favor' })).toHaveAttribute(
      'placeholder',
      'Motivo opcional del ajuste...',
    );
    await expect(dialog).toContainText('Este importe quedará disponible para próximos pagos.');
    await expect(dialog).toContainText('el sistema registra un ajuste manual para conservar toda la trazabilidad');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
  });
});
