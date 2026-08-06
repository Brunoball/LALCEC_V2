const { test, expect } = require('./fixtures/auth.fixture');
const { personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupSocioByDocument,
} = require('./helpers/api.helper');
const { createPerson } = require('./helpers/entities.helper');
const { captureDownload } = require('./helpers/download.helper');

const singlePerson = personData();
const batchPersonOne = personData();
const batchPersonTwo = personData();
const multiMonthPerson = personData();
const paginationPerson = personData();
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

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

async function removePaymentsForDocument(request, data) {
  for (let month = 1; month <= 12; month += 1) {
    const response = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'PAGADOS',
        anio: currentYear,
        mes: month,
        buscar: data.dni,
      },
    }).catch(() => ({ items: [] }));

    for (const payment of response.items || []) {
      await apiCall(request, 'cuotas_eliminar_pago', {
        method: 'POST',
        data: { id_pago: payment.id_pago },
      }).catch(() => undefined);
    }
  }
}

async function cleanupPerson(request, data) {
  await removePaymentsForDocument(request, data);
  await cleanupSocioByDocument(request, {
    tipo: 'PERSONA',
    documento: data.dni,
  }).catch(() => undefined);
}

function debtRow(page, data) {
  return page
    .getByRole('table', { name: /Cuotas de socios adeudadas/i })
    .getByRole('row')
    .filter({ hasText: data.dni });
}

function paidRow(page, data) {
  return page
    .getByRole('table', { name: /Cuotas de socios pagadas/i })
    .getByRole('row')
    .filter({ hasText: data.dni });
}

async function selectPreferredMedium(dialog) {
  const medium = dialog.getByLabel('Medio de pago *');
  if (!(await medium.inputValue())) await medium.selectOption({ index: 1 });
}

async function expectReceiptPopup(page, trigger) {
  await page.context().addInitScript(() => {
    window.print = () => undefined;
  });
  const popupPromise = page.waitForEvent('popup');
  await trigger();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('body')).toContainText(/Comprobante de pago|Total registrado/i);
  await popup.close();
}

test.describe.configure({ mode: 'serial' });

test.describe('Cuotas completas desde la interfaz', () => {
  test.afterEach(async ({ request }) => {
    for (const person of [
      singlePerson,
      batchPersonOne,
      batchPersonTwo,
      multiMonthPerson,
      paginationPerson,
    ]) {
      await cleanupPerson(request, person);
    }
  });

  test('registra un pago, imprime y exporta el comprobante, vuelve a imprimirlo y lo elimina', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    await createPerson(request, singlePerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    await page.goto('/cuotas');
    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(singlePerson.dni);

    let row = debtRow(page, singlePerson);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Registrar pago de/i }).click();

    const paymentDialog = page.getByRole('dialog', { name: 'Registrar pago de cuota' });
    await expect(paymentDialog).toBeVisible();
    const currentMonthButton = paymentDialog.getByRole('button', {
      name: new RegExp(`${monthNames[currentMonth - 1]} ${currentYear}:`, 'i'),
    });
    await expect(currentMonthButton).toHaveAttribute('aria-pressed', 'true');
    await currentMonthButton.click();
    await expect(paymentDialog.getByRole('button', { name: 'Registrar pago', exact: true })).toBeDisabled();
    await currentMonthButton.click();
    await selectPreferredMedium(paymentDialog);
    await paymentDialog.getByRole('button', { name: 'Registrar pago', exact: true }).click();

    const receipt = page.getByRole('dialog', { name: 'Pago realizado' });
    await expect(receipt).toContainText(/se registró correctamente/i);
    await expectReceiptPopup(page, () => receipt.getByRole('button', { name: 'Imprimir' }).click());
    await captureDownload(
      page,
      () => receipt.getByRole('button', { name: 'Exportar PDF' }).click(),
      { extension: '.pdf', signature: '%PDF', minimumBytes: 300 },
    );
    await receipt.getByText('Cerrar', { exact: true }).click();

    await page.getByRole('tab', { name: 'Pagados' }).click();
    row = paidRow(page, singlePerson);
    await expect(row).toBeVisible();
    await expectReceiptPopup(page, () => row.getByRole('button', { name: /Imprimir comprobante de/i }).click());

    await row.getByRole('button', { name: /Eliminar pago de/i }).click();
    let deleteDialog = page.getByRole('dialog', { name: 'Eliminar pago registrado' });
    await deleteDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(deleteDialog).toBeHidden();

    await row.getByRole('button', { name: /Eliminar pago de/i }).click();
    deleteDialog = page.getByRole('dialog', { name: 'Eliminar pago registrado' });
    await deleteDialog.getByRole('button', { name: 'Eliminar pago', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Deudores' })).toHaveAttribute('aria-selected', 'true');
    await expect(debtRow(page, singlePerson)).toBeVisible();
  });

  test('selecciona filas con mouse, teclado y checkbox, limpia, cancela y confirma un pago múltiple', async ({ page, request }) => {
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
    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await page.getByRole('button', { name: 'Selección múltiple' }).first().click();

    await search.fill(batchPersonOne.dni);
    let row = debtRow(page, batchPersonOne);
    await row.getByText(batchPersonOne.dni, { exact: true }).click();
    await expect(page.getByText(/1 cuota seleccionada/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar selección' }).first().click();
    await expect(page.getByText(/cuota seleccionada/i)).toHaveCount(0);

    await page.getByRole('button', { name: 'Selección múltiple' }).first().click();
    await search.fill(batchPersonOne.dni);
    row = debtRow(page, batchPersonOne);
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/1 cuota seleccionada/i)).toBeVisible();

    await search.fill(batchPersonTwo.dni);
    row = debtRow(page, batchPersonTwo);
    await row.getByRole('checkbox', { name: /Seleccionar cuota de/i }).check();
    await expect(page.getByText(/2 cuotas seleccionadas/i)).toBeVisible();

    await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
    await expect(page.getByText(/0 cuotas seleccionadas/i)).toBeVisible();

    await search.fill(batchPersonOne.dni);
    await debtRow(page, batchPersonOne)
      .getByRole('checkbox', { name: /Seleccionar cuota de/i })
      .check();
    await search.fill(batchPersonTwo.dni);
    await debtRow(page, batchPersonTwo)
      .getByRole('checkbox', { name: /Seleccionar cuota de/i })
      .check();

    await page.getByRole('button', { name: 'Continuar (2)', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar pagos seleccionados' });
    await expect(dialog).toContainText(batchPersonOne.apellido);
    await expect(dialog).toContainText(batchPersonTwo.apellido);
    await selectPreferredMedium(dialog);
    await dialog.getByRole('button', { name: 'Registrar 2 pagos' }).click();

    const receipt = page.getByRole('dialog', { name: 'Pago realizado' });
    await expect(receipt.getByRole('region', { name: 'Resumen del pago' })).toBeVisible();
    await receipt.getByText('Cerrar', { exact: true }).click();

    for (const target of [batchPersonOne, batchPersonTwo]) {
      const paid = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: 'PERSONA',
          estado: 'PAGADOS',
          anio: currentYear,
          mes: currentMonth,
          buscar: target.dni,
        },
      });
      expect(paid.items).toHaveLength(1);
    }
  });

  test('selecciona todos los meses disponibles, los desmarca y registra dos períodos juntos', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    await createPerson(request, multiMonthPerson, {
      fecha_alta: `${currentYear}-01-01`,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });

    await page.goto('/cuotas');
    await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(multiMonthPerson.dni);
    await debtRow(page, multiMonthPerson)
      .getByRole('button', { name: /Registrar pago de/i })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Registrar pago de cuota' });
    const yearButton = dialog.getByRole('button', { name: `Año ${currentYear}` });
    await yearButton.click();
    await dialog.getByRole('option', { name: String(currentYear), exact: true }).click();

    const allButton = dialog.getByRole('button', { name: 'Seleccionar todos' });
    await expect(allButton).toBeEnabled();
    await allButton.click();
    await expect(dialog.getByRole('button', { name: 'Deseleccionar todos' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Deseleccionar todos' }).click();

    const availableMonths = dialog.locator('.cuotas-month-grid button:not([disabled])');
    expect(await availableMonths.count()).toBeGreaterThanOrEqual(2);
    await availableMonths.nth(0).click();
    await availableMonths.nth(1).click();
    await selectPreferredMedium(dialog);
    await dialog.getByRole('button', { name: 'Registrar 2 cuotas' }).click();

    const receipt = page.getByRole('dialog', { name: 'Pago realizado' });
    await expect(receipt).toContainText('2 conceptos incluidos');
    await receipt.getByText('Cerrar', { exact: true }).click();

    let paidCount = 0;
    for (let month = 1; month <= 12; month += 1) {
      const response = await apiCall(request, 'cuotas_listar', {
        params: {
          tipo: 'PERSONA',
          estado: 'PAGADOS',
          anio: currentYear,
          mes: month,
          buscar: multiMonthPerson.dni,
        },
      });
      paidCount += response.items.length;
    }
    expect(paidCount).toBe(2);
  });

  test('pagina cuotas con número, Anterior y Siguiente', async ({ page, request }) => {
    const { category, medium } = await activeCategoryAndMedium(request);
    const saved = await createPerson(request, paginationPerson, {
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const real = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'DEUDORES',
        anio: currentYear,
        mes: currentMonth,
        buscar: paginationPerson.dni,
      },
    });
    const template = real.items.find((item) => item.id_socio === saved.id_socio) || real.items[0];
    expect(template).toBeTruthy();

    await page.route(/api\.php\?action=cuotas_listar(?:&|$)/, async (route) => {
      const url = new URL(route.request().url());
      const requestedPage = Number(url.searchParams.get('pagina') || 1);
      const makeItem = (index) => ({
        ...template,
        id_socio: 800000 + index,
        documento: String(60000000 + index),
        denominacion: `CUOTA PAGINA ${String(index).padStart(3, '0')}`,
      });
      const items = requestedPage === 1
        ? Array.from({ length: 100 }, (_, index) => makeItem(index + 1))
        : [makeItem(101)];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exito: true,
          items,
          resumen: { ...(real.resumen || {}), total: 101 },
          periodo: real.periodo,
          catalogos: real.catalogos,
          paginacion: {
            pagina: requestedPage,
            por_pagina: 100,
            total: 101,
            total_paginas: 2,
            desde: requestedPage === 1 ? 1 : 101,
            hasta: requestedPage === 1 ? 100 : 101,
          },
        }),
      });
    });

    await page.goto('/cuotas');
    const pagination = page.getByRole('navigation', { name: 'Paginación de cuotas' });
    await expect(pagination).toContainText('1–100 de 101');
    await pagination.getByRole('button', { name: '2', exact: true }).click();
    await expect(pagination).toContainText('101–101 de 101');
    await expect(page.getByRole('table', { name: /Cuotas de socios adeudadas/i })).toContainText('CUOTA PAGINA 101');
    await pagination.getByRole('button', { name: 'Anterior' }).click();
    await expect(pagination).toContainText('1–100 de 101');
    await pagination.getByRole('button', { name: 'Siguiente' }).click();
    await expect(pagination).toContainText('101–101 de 101');
  });
});
