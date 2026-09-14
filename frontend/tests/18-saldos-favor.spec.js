const { test, expect } = require('./fixtures/auth.fixture');
const { personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  apiResult,
  cleanupSocioByDocument,
  cleanupSocioById,
  expectApiError,
  seedSaldoFavorE2E,
} = require('./helpers/api.helper');
const { createPerson } = require('./helpers/entities.helper');
const { todayIso } = require('./helpers/data.helper');

const partialPerson = personData();
const fullPerson = personData();
const concurrentPerson = personData();
const growthPerson = personData();
const batchPersonOne = personData();
const batchPersonTwo = personData();
const uiPerson = personData();
const manualPerson = personData();

const today = todayIso();
const [currentYear, currentMonth] = today.split('-').map(Number);
const previousPeriod = currentMonth > 1
  ? { anio: currentYear, mes: currentMonth - 1 }
  : { anio: currentYear - 1, mes: 12 };

const moneyNumber = (value) => Number(Number(value || 0).toFixed(2));
const moneyTextNumber = (value) =>
  moneyNumber(
    String(value || "")
      .replace(/[^0-9,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );

async function activeCategoryAndMedium(request) {
  const categories = await apiCall(request, 'categorias_listar', {
    params: { estado: 'activo' },
  });
  const category = (categories.items || []).find(
    (item) => item.activo && Number(item.monto_actual || 0) > 0,
  );
  expect(category, 'Debe existir una categoría activa con cuota mayor a cero').toBeTruthy();

  const catalogs = await apiCall(request, 'cuotas_catalogos');
  const medium = catalogs.catalogos?.medios_pago?.[0];
  expect(medium, 'Debe existir al menos un medio de pago activo').toBeTruthy();

  return { category, medium };
}

async function debtFor(request, idSocio, { anio = currentYear, mes = currentMonth } = {}) {
  const response = await apiCall(request, 'cuotas_contexto_pago', {
    params: {
      id_socio: idSocio,
      anio,
      mes,
      fecha_pago: today,
    },
  });

  const item = response.principal;
  expect(item, `Debe existir contexto ${mes}/${anio} para el socio E2E`).toBeTruthy();
  expect(item.puede_pagar, `La cuota ${mes}/${anio} debe estar disponible`).toBe(true);
  expect(Number(item.monto_sugerido)).toBeGreaterThan(0);
  return item;
}

async function contextFor(request, idSocio, { anio = currentYear, mes = currentMonth } = {}) {
  return apiCall(request, 'cuotas_contexto_pago', {
    params: {
      id_socio: idSocio,
      anio,
      mes,
      fecha_pago: today,
    },
  });
}

async function cleanupPerson(request, data) {
  await cleanupSocioByDocument(request, {
    tipo: 'PERSONA',
    documento: data.dni,
  }).catch(() => false);
}

function singlePaymentDialog(page, person) {
  return page.getByRole('dialog', {
    name: new RegExp(person.apellido, 'i'),
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Saldos a favor de socios', () => {
  test.afterEach(async ({ request }) => {
    for (const person of [
      partialPerson,
      fullPerson,
      concurrentPerson,
      growthPerson,
      batchPersonOne,
      batchPersonTwo,
      uiPerson,
      manualPerson,
    ]) {
      await cleanupPerson(request, person);
    }
  });

  test('acredita un SOBRANTE, lo aplica parcialmente y Contable no cuenta la plata dos veces', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, partialPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const debt = await debtFor(request, saved.id_socio);
    const total = moneyNumber(debt.monto_sugerido);
    const credit = moneyNumber(Math.max(0.01, Math.min(total - 0.01, total * 0.4)));
    expect(credit).toBeGreaterThan(0);
    expect(credit).toBeLessThan(total);

    const seeded = await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: credit,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });
    expect(seeded.tipo).toBe('SOBRANTE');
    expect(moneyNumber(seeded.monto)).toBe(credit);

    const annual = await apiCall(request, 'cuotas_contextos_pago', {
      params: {
        id_socio: saved.id_socio,
        anio: currentYear,
        fecha_pago: today,
      },
    });
    expect(moneyNumber(annual.saldo_favor?.saldo)).toBe(credit);
    expect(annual.saldo_favor?.tiene_saldo).toBe(true);

    const balances = await apiCall(request, 'cuotas_saldos_favor', {
      params: { tipo: 'PERSONA', buscar: partialPerson.dni },
    });
    expect(balances.items).toHaveLength(1);
    expect(Number(balances.items[0].id_socio)).toBe(Number(saved.id_socio));
    expect(moneyNumber(balances.items[0].saldo_favor)).toBe(credit);
    expect(balances.items[0].ultimo_tipo).toBe('SOBRANTE');

    const dashboardBefore = await apiCall(request, 'dashboard_resumen');
    const seriesBefore = (dashboardBefore.resumen?.serie_cuotas || []).find(
      (item) => Number(item.anio) === currentYear && Number(item.mes) === currentMonth,
    );

    await expectApiError(
      request,
      'cuotas_registrar_pago',
      {
        method: 'POST',
        data: {
          id_socio: saved.id_socio,
          anio: currentYear,
          mes: currentMonth,
          fecha_pago: today,
          monto: debt.monto_sugerido,
          id_medio_pago: medium.id_medio_pago,
          usar_saldo_favor: true,
        },
      },
      { status: 422, code: 'SALDO_FAVOR_APLICACION_ESPERADA_REQUERIDA' },
    );

    await expectApiError(
      request,
      'cuotas_registrar_pago',
      {
        method: 'POST',
        data: {
          id_socio: saved.id_socio,
          anio: currentYear,
          mes: currentMonth,
          fecha_pago: today,
          monto: debt.monto_sugerido,
          id_medio_pago: medium.id_medio_pago,
          usar_saldo_favor: true,
          saldo_favor_aplicacion_esperada: moneyNumber(total + 0.01),
        },
      },
      { status: 422, code: 'SALDO_FAVOR_APLICACION_INVALIDA' },
    );

    const payment = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: today,
        monto: debt.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        usar_saldo_favor: true,
        saldo_favor_aplicacion_esperada: credit,
      },
    });

    expect(moneyNumber(payment.item.monto)).toBe(total);
    expect(moneyNumber(payment.item.monto_saldo_favor_aplicado)).toBe(credit);
    expect(moneyNumber(payment.comprobante.monto_cobrado_ahora)).toBe(moneyNumber(total - credit));
    expect(moneyNumber(payment.saldo_favor.aplicado)).toBe(credit);
    expect(moneyNumber(payment.saldo_favor.restante)).toBe(0);

    const dashboardAfter = await apiCall(request, 'dashboard_resumen');
    const seriesAfter = (dashboardAfter.resumen?.serie_cuotas || []).find(
      (item) => Number(item.anio) === currentYear && Number(item.mes) === currentMonth,
    );
    expect(seriesBefore).toBeTruthy();
    expect(seriesAfter).toBeTruthy();
    expect(
      moneyNumber(Number(seriesAfter.importe) - Number(seriesBefore.importe)),
    ).toBe(moneyNumber(total - credit));

    const afterPayment = await contextFor(request, saved.id_socio);
    expect(moneyNumber(afterPayment.saldo_favor?.saldo)).toBe(0);

    const accounting = await apiCall(request, 'contable_ingresos_socios', {
      params: {
        anio: currentYear,
        mes: currentMonth,
        buscar: partialPerson.dni,
      },
    });
    const balanceIncome = (accounting.items || []).find(
      (item) => item.tipo_pago === 'SALDO_FAVOR_SOBRANTE',
    );
    const paymentIncome = (accounting.items || []).find(
      (item) => Number(item.id_pago) === Number(payment.item.id_pago),
    );

    expect(balanceIncome).toBeTruthy();
    expect(balanceIncome.id_pago).toBeNull();
    expect(balanceIncome.origen).toBe('SALDO_FAVOR');
    expect(moneyNumber(balanceIncome.monto)).toBe(credit);
    expect(paymentIncome).toBeTruthy();
    expect(moneyNumber(paymentIncome.monto)).toBe(moneyNumber(total - credit));
    expect(moneyNumber(paymentIncome.monto_saldo_favor_aplicado)).toBe(credit);
    expect(
      moneyNumber(
        (accounting.items || []).reduce((sum, item) => sum + Number(item.monto || 0), 0),
      ),
    ).toBe(total);

    await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: payment.item.id_pago },
    });

    const afterDelete = await contextFor(request, saved.id_socio);
    expect(moneyNumber(afterDelete.saldo_favor?.saldo)).toBe(credit);

    const restoredBalances = await apiCall(request, 'cuotas_saldos_favor', {
      params: { tipo: 'PERSONA', buscar: partialPerson.dni },
    });
    expect(restoredBalances.items).toHaveLength(1);
    expect(moneyNumber(restoredBalances.items[0].saldo_favor)).toBe(credit);
    expect(restoredBalances.items[0].ultimo_tipo).toBe('REVERSO');
  });

  test('si el saldo cubre toda la cuota no registra dinero nuevo y conserva el remanente', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, fullPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const debt = await debtFor(request, saved.id_socio);
    const total = moneyNumber(debt.monto_sugerido);
    const extra = 321.09;
    const credit = moneyNumber(total + extra);

    await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: credit,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    const payment = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: today,
        monto: debt.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        usar_saldo_favor: true,
        saldo_favor_aplicacion_esperada: total,
      },
    });

    expect(moneyNumber(payment.saldo_favor.aplicado)).toBe(total);
    expect(moneyNumber(payment.saldo_favor.restante)).toBe(moneyNumber(extra));
    expect(moneyNumber(payment.comprobante.monto_cobrado_ahora)).toBe(0);

    const accounting = await apiCall(request, 'contable_ingresos_socios', {
      params: {
        anio: currentYear,
        mes: currentMonth,
        buscar: fullPerson.dni,
      },
    });
    const paymentIncome = (accounting.items || []).find(
      (item) => Number(item.id_pago) === Number(payment.item.id_pago),
    );
    expect(paymentIncome).toBeTruthy();
    expect(moneyNumber(paymentIncome.monto)).toBe(0);
    expect(moneyNumber(paymentIncome.monto_saldo_favor_aplicado)).toBe(total);

    await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: payment.item.id_pago },
    });
    const restored = await contextFor(request, saved.id_socio);
    expect(moneyNumber(restored.saldo_favor?.saldo)).toBe(credit);
  });

  test('serializa dos cobros concurrentes y nunca permite gastar más saldo del disponible', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, concurrentPerson, {
      fecha_alta: `${previousPeriod.anio}-01-01`,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    const previousDebt = await debtFor(request, saved.id_socio, previousPeriod);
    const currentDebt = await debtFor(request, saved.id_socio, {
      anio: currentYear,
      mes: currentMonth,
    });
    const credit = moneyNumber(
      Math.max(
        0.01,
        Math.min(Number(previousDebt.monto_sugerido), Number(currentDebt.monto_sugerido)) * 0.75,
      ),
    );

    await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: credit,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    const payloads = [
      {
        id_socio: saved.id_socio,
        anio: previousPeriod.anio,
        mes: previousPeriod.mes,
        fecha_pago: today,
        monto: previousDebt.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        usar_saldo_favor: true,
        saldo_favor_aplicacion_esperada: credit,
      },
      {
        id_socio: saved.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: today,
        monto: currentDebt.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        usar_saldo_favor: true,
        saldo_favor_aplicacion_esperada: credit,
      },
    ];

    const results = await Promise.all(
      payloads.map((data) => apiResult(request, 'cuotas_registrar_pago', {
        method: 'POST',
        data,
      })),
    );

    const successful = results.filter((result) => result.ok);
    const stale = results.filter((result) => !result.ok);
    expect(successful).toHaveLength(1);
    expect(stale).toHaveLength(1);
    expect(stale[0].status).toBe(409);
    expect(stale[0].body?.codigo).toBe('SALDO_FAVOR_MODIFICADO');
    expect(moneyNumber(successful[0].body?.saldo_favor?.aplicado)).toBe(credit);

    const after = await contextFor(request, saved.id_socio);
    expect(moneyNumber(after.saldo_favor?.saldo)).toBe(0);

    const paymentId = successful[0].body?.item?.id_pago;
    expect(Number(paymentId)).toBeGreaterThan(0);
    await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: paymentId },
    });

    const restored = await contextFor(request, saved.id_socio);
    expect(moneyNumber(restored.saldo_favor?.saldo)).toBe(credit);
  });

  test('si entra saldo nuevo con el modal abierto aplica sólo lo que el operador había confirmado', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, growthPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const debt = await debtFor(request, saved.id_socio);
    const total = moneyNumber(debt.monto_sugerido);
    const expected = moneyNumber(Math.max(0.01, Math.min(total - 0.01, total * 0.25)));
    const extra = moneyNumber(Math.max(0.01, Math.min(total - expected, total * 0.15)));

    await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: expected,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    // Simula otro canal acreditando dinero después de que el operador ya vio
    // y aceptó aplicar `expected` en el modal. El pago no debe apropiarse de
    // este crédito nuevo silenciosamente.
    await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: extra,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    const payment = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: today,
        monto: debt.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        usar_saldo_favor: true,
        saldo_favor_aplicacion_esperada: expected,
      },
    });

    expect(moneyNumber(payment.saldo_favor.aplicado)).toBe(expected);
    expect(moneyNumber(payment.saldo_favor.restante)).toBe(extra);
    expect(moneyNumber(payment.comprobante.monto_cobrado_ahora)).toBe(
      moneyNumber(total - expected),
    );

    await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: payment.item.id_pago },
    });
    const restored = await contextFor(request, saved.id_socio);
    expect(moneyNumber(restored.saldo_favor?.saldo)).toBe(moneyNumber(expected + extra));
  });

  test('rechaza saldo a favor en pago familiar y en un lote que mezcla socios', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const first = await createPerson(request, batchPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, batchPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    const firstDebt = await debtFor(request, first.id_socio);
    const secondDebt = await debtFor(request, second.id_socio);
    await seedSaldoFavorE2E(request, {
      id_socio: first.id_socio,
      monto: 100,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    await expectApiError(
      request,
      'cuotas_registrar_pago',
      {
        method: 'POST',
        data: {
          id_socio: first.id_socio,
          anio: currentYear,
          mes: currentMonth,
          fecha_pago: today,
          monto: firstDebt.monto_sugerido,
          id_medio_pago: medium.id_medio_pago,
          aplicar_familia: true,
          usar_saldo_favor: true,
        },
      },
      { status: 409, code: 'SALDO_FAVOR_PAGO_FAMILIAR' },
    );

    await expectApiError(
      request,
      'cuotas_registrar_pagos',
      {
        method: 'POST',
        data: {
          fecha_pago: today,
          id_medio_pago: medium.id_medio_pago,
          usar_saldo_favor: true,
          pagos: [
            {
              id_socio: first.id_socio,
              anio: currentYear,
              mes: currentMonth,
              monto: firstDebt.monto_sugerido,
            },
            {
              id_socio: second.id_socio,
              anio: currentYear,
              mes: currentMonth,
              monto: secondDebt.monto_sugerido,
            },
          ],
        },
      },
      { status: 409, code: 'SALDO_FAVOR_MULTIPLES_SOCIOS' },
    );
  });

  test('permite agregar, editar y eliminar manualmente un saldo sin borrar la trazabilidad', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, manualPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    const created = await apiCall(request, 'cuotas_ajustar_saldo_favor', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        operacion: 'CREAR',
        saldo_objetivo: 1200.50,
        detalle: 'AJUSTE MANUAL E2E',
      },
    });
    expect(moneyNumber(created.item?.saldo_anterior)).toBe(0);
    expect(moneyNumber(created.item?.saldo_favor)).toBe(1200.50);
    expect(created.item?.tipo_movimiento).toBe('AJUSTE_CREDITO');

    const accountingAfterManualCredit = await apiCall(request, 'contable_ingresos_socios', {
      params: {
        anio: currentYear,
        mes: currentMonth,
        buscar: manualPerson.dni,
      },
    });
    expect(
      (accountingAfterManualCredit.items || []).some(
        (item) => item.tipo_pago === 'SALDO_FAVOR_SOBRANTE',
      ),
    ).toBe(false);

    await expectApiError(
      request,
      'cuotas_ajustar_saldo_favor',
      {
        method: 'POST',
        data: {
          id_socio: saved.id_socio,
          operacion: 'CREAR',
          saldo_objetivo: 1300,
        },
      },
      { status: 409, code: 'SALDO_FAVOR_YA_EXISTE' },
    );

    const edited = await apiCall(request, 'cuotas_ajustar_saldo_favor', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        operacion: 'EDITAR',
        saldo_objetivo: 700.25,
      },
    });
    expect(moneyNumber(edited.item?.saldo_anterior)).toBe(1200.50);
    expect(moneyNumber(edited.item?.saldo_favor)).toBe(700.25);
    expect(moneyNumber(edited.item?.ajuste)).toBe(-500.25);
    expect(edited.item?.tipo_movimiento).toBe('AJUSTE_DEBITO');

    const listed = await apiCall(request, 'cuotas_saldos_favor', {
      params: { tipo: 'PERSONA', buscar: manualPerson.dni },
    });
    expect(listed.items).toHaveLength(1);
    expect(moneyNumber(listed.items[0].saldo_favor)).toBe(700.25);
    expect(listed.items[0].ultimo_tipo).toBe('AJUSTE_DEBITO');
    expect(listed.items[0].ultimo_origen).toBe('MANUAL');

    const deleted = await apiCall(request, 'cuotas_ajustar_saldo_favor', {
      method: 'POST',
      data: {
        id_socio: saved.id_socio,
        operacion: 'ELIMINAR',
        detalle: 'LIMPIEZA MANUAL E2E',
      },
    });
    expect(moneyNumber(deleted.item?.saldo_anterior)).toBe(700.25);
    expect(moneyNumber(deleted.item?.saldo_favor)).toBe(0);
    expect(moneyNumber(deleted.item?.ajuste)).toBe(-700.25);
    expect(deleted.item?.tipo_movimiento).toBe('AJUSTE_DEBITO');

    const afterDelete = await apiCall(request, 'cuotas_saldos_favor', {
      params: { tipo: 'PERSONA', buscar: manualPerson.dni },
    });
    expect(afterDelete.items).toHaveLength(0);

    const context = await contextFor(request, saved.id_socio);
    expect(moneyNumber(context.saldo_favor?.saldo)).toBe(0);

    await expectApiError(
      request,
      'cuotas_ajustar_saldo_favor',
      {
        method: 'POST',
        data: {
          id_socio: saved.id_socio,
          operacion: 'ELIMINAR',
          detalle: 'SEGUNDA ELIMINACION E2E',
        },
      },
      { status: 409, code: 'SALDO_FAVOR_NO_EXISTE' },
    );
  });

  test('la eliminación definitiva preserva el saldo y lo mantiene trazable en Saldos a favor', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const archivedPerson = personData();
    const saved = await createPerson(request, archivedPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const credit = 555.55;

    try {
      await seedSaldoFavorE2E(request, {
        id_socio: saved.id_socio,
        monto: credit,
        fecha: today,
        id_medio_pago: medium.id_medio_pago,
      });

      const archived = await apiCall(request, 'socios_eliminar_definitivo', {
        method: 'POST',
        data: { id: saved.id_socio, confirmacion: 'ELIMINAR' },
      });
      expect(Number(archived.preservados?.saldos_favor_movimientos || 0)).toBe(1);
      expect(moneyNumber(archived.preservados?.saldo_favor_actual)).toBe(credit);

      const balances = await apiCall(request, 'cuotas_saldos_favor', {
        params: { tipo: 'PERSONA', buscar: archivedPerson.dni },
      });
      expect(balances.items).toHaveLength(1);
      expect(Number(balances.items[0].id_socio)).toBe(Number(saved.id_socio));
      expect(balances.items[0].socio_eliminado).toBe(true);
      expect(moneyNumber(balances.items[0].saldo_favor)).toBe(credit);
    } finally {
      await cleanupSocioById(request, saved.id_socio).catch(() => false);
    }
  });

  test('la UI muestra Saldos a favor y ofrece usarlo automáticamente dentro del modal de pago', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, uiPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const debt = await debtFor(request, saved.id_socio);
    const total = moneyNumber(debt.monto_sugerido);
    const credit = moneyNumber(Math.max(0.01, Math.min(total - 0.01, total * 0.25)));

    await seedSaldoFavorE2E(request, {
      id_socio: saved.id_socio,
      monto: credit,
      fecha: today,
      id_medio_pago: medium.id_medio_pago,
    });

    await page.goto('/cuotas');
    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(uiPerson.dni);

    await page.getByRole('tab', { name: /Saldos a favor/i }).click();
    const balanceTable = page.getByRole('table', { name: /Saldos a favor de socios/i });
    const balanceRow = balanceTable.getByRole('row').filter({ hasText: uiPerson.dni });
    await expect(balanceRow).toBeVisible();
    await expect(balanceRow).toContainText(/Sobrante/i);
    await expect(page.getByRole('button', { name: 'Agregar saldo' })).toBeVisible();
    await expect(
      balanceRow.getByRole('button', { name: new RegExp(`Editar saldo a favor de ${uiPerson.apellido}`, 'i') }),
    ).toBeVisible();
    await expect(
      balanceRow.getByRole('button', { name: new RegExp(`Eliminar saldo a favor de ${uiPerson.apellido}`, 'i') }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Agregar saldo' }).click();
    const addBalanceDialog = page.getByRole('dialog', { name: 'Agregar saldo a favor' });
    await expect(addBalanceDialog).toBeVisible();
    const partnerSearch = addBalanceDialog.getByRole('searchbox', { name: 'Buscar socio' });
    const partnerSelect = addBalanceDialog.getByRole('combobox', { name: 'Socio' });
    await expect(partnerSearch).toBeVisible();
    await expect(partnerSelect).toBeVisible();
    await partnerSearch.fill(uiPerson.dni);
    await expect(partnerSelect.locator(`option[value="${saved.id_socio}"]`)).toHaveCount(1);
    await partnerSelect.selectOption(String(saved.id_socio));
    await expect(partnerSelect).toHaveValue(String(saved.id_socio));
    await expect(addBalanceDialog.getByRole('textbox', { name: 'Saldo a favor total' })).toBeVisible();
    await addBalanceDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(addBalanceDialog).toBeHidden();

    await page.getByRole('tab', { name: /Deudores/i }).click();
    const debtTable = page.getByRole('table', { name: /Cuotas de socios adeudadas/i });
    const debtRow = debtTable.getByRole('row').filter({ hasText: uiPerson.dni });
    await expect(debtRow).toBeVisible();
    await debtRow.getByRole('button', { name: /Registrar pago de/i }).click();

    const dialog = singlePaymentDialog(page, uiPerson);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Datos del pago' }).click();

    const balanceCard = dialog.getByLabel('Saldo a favor disponible');
    await expect(balanceCard).toBeVisible();
    const useBalance = balanceCard.getByRole('checkbox', {
      name: 'Usar saldo a favor en este pago',
    });
    await expect(useBalance).toBeChecked();
    await expect(balanceCard).toContainText('Total de cuotas');
    await expect(balanceCard).toContainText('Saldo aplicado');
    await expect(balanceCard).toContainText('A cobrar ahora');
    const footerBalance = dialog.locator('.cuotas-payment-footer-total');
    await expect(footerBalance).toContainText('Total a cobrar');
    await expect(footerBalance).toContainText('Saldo a favor aplicado');
    await expect(footerBalance).toContainText('Total cuotas');
    expect(moneyTextNumber(await footerBalance.locator('strong').innerText())).toBe(
      moneyNumber(total - credit),
    );

    await useBalance.uncheck();
    await expect(balanceCard).not.toContainText('A cobrar ahora');
    await useBalance.check();
    await expect(balanceCard).toContainText('A cobrar ahora');

    const paymentRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('action=cuotas_registrar_pago'),
    );
    await dialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();
    const paymentRequest = await paymentRequestPromise;
    const sentPayload = paymentRequest.postDataJSON();
    expect(sentPayload.usar_saldo_favor).toBe(true);
    expect(moneyNumber(sentPayload.saldo_favor_aplicacion_esperada)).toBe(credit);

    const receiptDialog = page.getByRole('dialog', { name: 'Registro de pagos', exact: true });
    await expect(receiptDialog).toBeVisible();
    const receiptTotal = receiptDialog.locator('.payment-receipt-total-pill');
    await expect(receiptTotal).toContainText('Cobrado ahora');
    await expect(receiptTotal).toContainText('Saldo aplicado');
    await expect(receiptTotal).toContainText('Total cuotas');
    expect(moneyTextNumber(await receiptTotal.locator('strong').innerText())).toBe(
      moneyNumber(total - credit),
    );

    await page.context().addInitScript(() => {
      window.print = () => undefined;
    });
    const popupPromise = page.waitForEvent('popup');
    await receiptDialog.getByRole('button', { name: 'Comprobante', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    const printedReceipt = popup.locator('.gcuotas-comprobante[aria-label="Comprobante de pago"]');
    await expect(printedReceipt).toBeVisible();
    await expect(printedReceipt).toContainText('Categoría / Monto abonado');
    await expect(printedReceipt).toContainText('Saldo a favor aplicado');
    await expect(printedReceipt).toContainText('Total de cuotas');
    await popup.close();
  });
});
