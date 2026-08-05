const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, familyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupDiscountsByThresholds,
  cleanupFamilyByPrefix,
  cleanupSocioByDocument,
  expectApiError,
} = require('./helpers/api.helper');
const {
  createCompany,
  createFamily,
  createPerson,
} = require('./helpers/entities.helper');
const { todayIso } = require('./helpers/data.helper');

const person = personData();
const company = companyData();
const familyPersonOne = personData();
const familyPersonTwo = personData();
const batchPersonOne = personData();
const batchPersonTwo = personData();
const family = familyData();
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

function discountAppliesToday(rule, memberCount) {
  const today = todayIso();
  return Boolean(
    rule.activo &&
      String(rule.vigencia_desde || '') <= today &&
      (!rule.vigencia_hasta || String(rule.vigencia_hasta) >= today) &&
      Number(rule.cantidad_integrantes_desde) <= memberCount &&
      (rule.cantidad_integrantes_hasta === null ||
        Number(rule.cantidad_integrantes_hasta) >= memberCount),
  );
}

async function ensureTwoMemberDiscount(request) {
  const listed = await apiCall(request, 'descuentos_familiares_listar', {
    params: { estado: 'todos' },
  });
  const existing = (listed.items || []).find((item) => discountAppliesToday(item, 2));
  if (existing) return existing;

  const response = await apiCall(request, 'descuentos_familiares_guardar', {
    method: 'POST',
    data: {
      cantidad_integrantes_desde: 2,
      cantidad_integrantes_hasta: 2,
      porcentaje_descuento: '12.50',
      vigencia_desde: todayIso(),
      vigencia_hasta: todayIso(),
      descripcion: 'PW E2E DESCUENTO GLOBAL CUOTAS',
    },
  });
  return response.item;
}

async function activeCategoryAndMedium(request) {
  const categories = await apiCall(request, 'categorias_listar', {
    params: { estado: 'activo' },
  });
  const category = (categories.items || []).find(
    (item) => item.activo && Number(item.monto_actual || 0) > 0,
  );
  expect(category).toBeTruthy();

  const catalogs = await apiCall(request, 'cuotas_catalogos');
  const medium = catalogs.catalogos?.medios_pago?.[0];
  expect(medium).toBeTruthy();
  return { category, medium };
}

async function removePayments(request, items = []) {
  for (const item of items) {
    if (!item?.id_pago) continue;
    await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: item.id_pago },
    });
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('Cuotas de socios y empresas', () => {
  test.afterEach(async ({ request }) => {
    try {
      cleanupFamilyByPrefix(family.prefix);
    } catch (_error) {
      // La familia puede no haberse creado todavía.
    }
    try {
      cleanupDiscountsByThresholds([2]);
    } catch (_error) {
      // Solo elimina la regla E2E, si llegó a crearse.
    }

    for (const target of [
      { tipo: 'PERSONA', documento: person.dni },
      { tipo: 'EMPRESA', documento: company.cuit },
      { tipo: 'PERSONA', documento: familyPersonOne.dni },
      { tipo: 'PERSONA', documento: familyPersonTwo.dni },
      { tipo: 'PERSONA', documento: batchPersonOne.dni },
      { tipo: 'PERSONA', documento: batchPersonTwo.dni },
    ]) {
      try {
        await cleanupSocioByDocument(request, target);
      } catch (_error) {
        // La siguiente ejecución vuelve a intentar la limpieza exacta.
      }
    }
  });

  test('muestra las cuatro vistas y no conserva la pestaña de condonados', async ({ page }) => {
    await page.goto('/cuotas');

    await expect(page.getByRole('heading', { name: 'Cuotas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Socios' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Empresas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Deudores' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Pagados' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Condonados/i })).toHaveCount(0);

    await expect(page.getByRole('table', { name: /Cuotas de socios adeudadas/i })).toBeVisible();
    await page.getByRole('tab', { name: 'Pagados' }).click();
    await expect(page.getByRole('table', { name: /Cuotas de socios pagadas/i })).toBeVisible();
    await page.getByRole('tab', { name: 'Empresas' }).click();
    await expect(page.getByRole('table', { name: /Cuotas de empresas pagadas/i })).toBeVisible();
    await page.getByRole('tab', { name: 'Deudores' }).click();
    await expect(page.getByRole('table', { name: /Cuotas de empresas adeudadas/i })).toBeVisible();
  });

  test('registra y elimina pagos mensuales para un socio y una empresa', async ({ request }) => {
    await cleanupSocioByDocument(request, { tipo: 'PERSONA', documento: person.dni });
    await cleanupSocioByDocument(request, { tipo: 'EMPRESA', documento: company.cuit });

    const { category, medium } = await activeCategoryAndMedium(request);
    const savedPerson = await createPerson(request, person, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const savedCompany = await createCompany(request, company, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    for (const target of [
      { tipo: 'PERSONA', item: savedPerson, name: `${person.apellido}, ${person.nombre}` },
      { tipo: 'EMPRESA', item: savedCompany, name: company.razonSocial },
    ]) {
      const debt = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: target.tipo,
          estado: 'DEUDORES',
          anio: currentYear,
          mes: currentMonth,
          buscar: target.tipo === 'EMPRESA' ? company.cuit : person.dni,
        },
      });
      expect(debt.items).toHaveLength(1);
      expect(debt.items[0].id_socio).toBe(target.item.id_socio);
      expect(debt.items[0].periodo).toContain(String(currentYear));

      const payment = await apiCall(request, 'cuotas_registrar_pago', {
        method: 'POST',
        data: {
          id_socio: target.item.id_socio,
          anio: currentYear,
          mes: currentMonth,
          fecha_pago: todayIso(),
          monto: debt.items[0].monto_sugerido,
          id_medio_pago: medium.id_medio_pago,
        },
      });
      expect(payment.item.id_pago).toBeGreaterThan(0);
      expect(payment.item.denominacion).toContain(target.name.split(',')[0]);
      expect(payment.comprobante.lineas).toHaveLength(1);

      await expectApiError(
        request,
        'cuotas_registrar_pago',
        {
          method: 'POST',
          data: {
            id_socio: target.item.id_socio,
            anio: currentYear,
            mes: currentMonth,
            fecha_pago: todayIso(),
            monto: debt.items[0].monto_sugerido,
            id_medio_pago: medium.id_medio_pago,
          },
        },
        { status: 409, code: 'PAGO_YA_REGISTRADO' },
      );

      const paid = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: target.tipo,
          estado: 'PAGADOS',
          anio: currentYear,
          mes: currentMonth,
          buscar: target.tipo === 'EMPRESA' ? company.cuit : person.dni,
        },
      });
      expect(paid.items).toHaveLength(1);
      expect(paid.items[0].id_pago).toBe(payment.item.id_pago);
      expect(Number(paid.items[0].monto)).toBeGreaterThan(0);

      await apiCall(request, 'cuotas_eliminar_pago', {
        method: 'POST',
        data: { id_pago: payment.item.id_pago },
      });

      const debtAgain = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: target.tipo,
          estado: 'DEUDORES',
          anio: currentYear,
          mes: currentMonth,
          buscar: target.tipo === 'EMPRESA' ? company.cuit : person.dni,
        },
      });
      expect(debtAgain.items).toHaveLength(1);
      expect(debtAgain.items[0].id_socio).toBe(target.item.id_socio);
    }
  });

  test('detecta el grupo familiar, calcula el descuento y registra todas sus cuotas pendientes', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const discount = await ensureTwoMemberDiscount(request);
    const first = await createPerson(request, familyPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, familyPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    await createFamily(request, family, [first, second]);

    const context = await apiCall(request, 'cuotas_contexto_pago', {
      params: {
        id_socio: first.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
      },
    });
    expect(context.familia.nombre).toContain(family.nombre);
    expect(context.familia.integrantes).toHaveLength(2);
    expect(context.familia.cantidad_pendientes).toBe(2);
    expect(Number(context.familia.porcentaje_descuento)).toBe(
      Number(discount.porcentaje_descuento),
    );
    expect(Number(context.principal.monto_sugerido)).toBeLessThanOrEqual(
      Number(context.principal.monto_base),
    );

    const response = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: first.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
        id_medio_pago: medium.id_medio_pago,
        aplicar_familia: true,
      },
    });
    expect(response.aplico_familia).toBe(true);
    expect(response.items).toHaveLength(2);
    expect(response.comprobante.lineas).toHaveLength(2);
    expect(response.comprobante.modalidad_label).toMatch(/grupo familiar/i);
    expect(Number(response.comprobante.monto)).toBeGreaterThan(0);
    expect(response.comprobante.lineas.map((line) => line.id_socio).sort()).toEqual(
      [first.id_socio, second.id_socio].sort(),
    );

    await removePayments(request, response.items);
  });


  test('al desactivar el pago familiar registra solamente la cuota del socio abierto', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    await ensureTwoMemberDiscount(request);
    const first = await createPerson(request, familyPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, familyPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    await createFamily(request, family, [first, second]);

    const context = await apiCall(request, 'cuotas_contexto_pago', {
      params: {
        id_socio: first.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
      },
    });

    const response = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: first.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
        monto: context.principal.monto_sugerido,
        id_medio_pago: medium.id_medio_pago,
        aplicar_familia: false,
      },
    });

    expect(response.aplico_familia).toBe(false);
    expect(response.items).toHaveLength(1);
    expect(response.items[0].id_socio).toBe(first.id_socio);

    const secondDebt = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'DEUDORES',
        anio: currentYear,
        mes: currentMonth,
        buscar: familyPersonTwo.dni,
      },
    });
    expect(secondDebt.items).toHaveLength(1);
    expect(secondDebt.items[0].id_socio).toBe(second.id_socio);

    await removePayments(request, response.items);
  });

  test('registra varios socios seleccionados en una sola operación y genera un comprobante agrupado', async ({ request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const first = await createPerson(request, batchPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, batchPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    const debts = [];
    for (const target of [batchPersonOne, batchPersonTwo]) {
      const response = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: 'PERSONA',
          estado: 'DEUDORES',
          anio: currentYear,
          mes: currentMonth,
          buscar: target.dni,
        },
      });
      expect(response.items).toHaveLength(1);
      debts.push(response.items[0]);
    }

    const response = await apiCall(request, 'cuotas_registrar_pagos', {
      method: 'POST',
      data: {
        fecha_pago: todayIso(),
        id_medio_pago: medium.id_medio_pago,
        pagos: debts.map((debt) => ({
          id_socio: debt.id_socio,
          anio: debt.anio,
          mes: debt.mes,
          monto: debt.monto_sugerido,
        })),
      },
    });
    expect(response.items).toHaveLength(2);
    expect(response.comprobante.lineas).toHaveLength(2);
    expect(response.comprobante.modalidad_label).toMatch(/múltiple/i);
    expect(response.comprobante.codigo_operacion).toMatch(/^CUO-/);
    expect(response.items.map((item) => item.id_socio).sort()).toEqual(
      [first.id_socio, second.id_socio].sort(),
    );

    await removePayments(request, response.items);
  });

  test('permite seleccionar cuotas en búsquedas sucesivas y muestra el modal de pago múltiple', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    await createPerson(request, batchPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    await createPerson(request, batchPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    await page.goto('/cuotas');
    await page.getByRole('button', { name: 'Selección múltiple' }).click();
    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });

    await search.fill(batchPersonOne.dni);
    await page
      .getByRole('checkbox', { name: new RegExp(batchPersonOne.apellido, 'i') })
      .check();
    await expect(page.getByText(/1 cuota seleccionada/i)).toBeVisible();

    await search.fill(batchPersonTwo.dni);
    await page
      .getByRole('checkbox', { name: new RegExp(batchPersonTwo.apellido, 'i') })
      .check();
    await expect(page.getByText(/2 cuotas seleccionadas/i)).toBeVisible();

    const continueButton = page.getByRole('button', { name: 'Continuar (2)', exact: true });
    await expect(continueButton).toBeVisible();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    const dialog = page.getByRole('dialog', { name: 'Registrar pagos seleccionados' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(batchPersonOne.apellido);
    await expect(dialog).toContainText(batchPersonTwo.apellido);
    await expect(dialog.getByRole('button', { name: 'Registrar 2 pagos' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('muestra el grupo familiar por defecto y abre el comprobante después de pagar', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    await ensureTwoMemberDiscount(request);
    const first = await createPerson(request, familyPersonOne, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, familyPersonTwo, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    await createFamily(request, family, [first, second]);

    await page.goto('/cuotas');
    await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(familyPersonOne.dni);
    const debtRow = page
      .getByRole('table', { name: /Cuotas de socios adeudadas/i })
      .getByRole('row')
      .filter({ hasText: familyPersonOne.dni });
    await expect(debtRow).toBeVisible();
    await debtRow.getByRole('button', { name: 'Registrar pago' }).click();

    const paymentDialog = page.getByRole('dialog', { name: 'Registrar pago de cuota' });
    const familyCheck = paymentDialog.getByRole('checkbox', {
      name: 'Aplicar pago a todo el grupo familiar',
    });
    await expect(familyCheck).toBeChecked();
    await paymentDialog.getByRole('button', { name: 'Ver quiénes forman parte' }).click();
    await expect(paymentDialog).toContainText(familyPersonTwo.apellido);
    await paymentDialog.getByRole('button', { name: /Registrar pago familiar \(2\)/ }).click();

    const receiptDialog = page.getByRole('dialog', { name: 'Pago realizado' });
    await expect(receiptDialog).toContainText(/se registró correctamente/i);
    await expect(receiptDialog.getByRole('button', { name: 'Imprimir' })).toBeVisible();
    await expect(receiptDialog.getByRole('button', { name: 'Exportar PDF' })).toBeVisible();
    await receiptDialog.getByText('Cerrar', { exact: true }).click();

    const paid = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'PAGADOS',
        anio: currentYear,
        mes: currentMonth,
        buscar: familyPersonOne.dni,
      },
    });
    const paidSecond = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'PAGADOS',
        anio: currentYear,
        mes: currentMonth,
        buscar: familyPersonTwo.dni,
      },
    });
    await removePayments(request, [...paid.items, ...paidSecond.items]);
  });

  test('valida filtros y datos obligatorios del pago', async ({ request }) => {
    await expectApiError(
      request,
      'cuotas_listar',
      { params: { tipo: 'OTRO' } },
      { status: 422, code: 'FILTRO_INVALIDO' },
    );
    await expectApiError(
      request,
      'cuotas_listar',
      { params: { estado: 'CONDONADOS' } },
      { status: 422, code: 'FILTRO_INVALIDO' },
    );
    await expectApiError(
      request,
      'cuotas_registrar_pago',
      { method: 'POST', data: {} },
      { status: 422, code: 'VALIDATION_ERROR' },
    );
    await expectApiError(
      request,
      'cuotas_registrar_pagos',
      {
        method: 'POST',
        data: {
          fecha_pago: todayIso(),
          id_medio_pago: 1,
          pagos: [],
        },
      },
      { status: 422, code: 'VALIDATION_ERROR' },
    );
    await expectApiError(
      request,
      'cuotas_eliminar_pago',
      { method: 'POST', data: { id_pago: 2147483647 } },
      { status: 404, code: 'PAGO_NO_ENCONTRADO' },
    );
  });
});
