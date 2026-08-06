const path = require('path');
const { test, expect } = require('./fixtures/auth.fixture');
const {
  actionUrl,
  apiCall,
  cleanupContableOptionByName,
  readAuthSession,
} = require('./helpers/api.helper');
const { captureDownload } = require('./helpers/download.helper');
const { todayIso, uniqueSuffix } = require('./helpers/data.helper');

const suffix = uniqueSuffix();
const date = todayIso();
const [year, month] = date.split('-').map(Number);
const names = {
  incomeProvider: `PW E2E PROVEEDOR ING ${suffix}`,
  incomeCategory: `PW E2E CAT ING ${suffix}`,
  incomeConcept: `PW E2E CONCEPTO ING ${suffix}`,
  expenseProvider: `PW E2E PROVEEDOR EGR ${suffix}`,
  expenseCategory: `PW E2E CAT EGR ${suffix}`,
  expenseConcept: `PW E2E CONCEPTO EGR ${suffix}`,
};
const incomeDetail = `PW E2E UI INGRESO ${suffix}`;
const incomeEdited = `${incomeDetail} EDITADO`;
const expenseDetail = `PW E2E UI EGRESO ${suffix}`;
const expenseEdited = `${expenseDetail} EDITADO`;
const validPdf = path.join(__dirname, 'fixtures', 'files', 'comprobante-e2e.pdf');
const invalidFile = path.join(__dirname, 'fixtures', 'files', 'archivo-invalido.txt');

function rowByText(page, tableName, text) {
  return page
    .getByRole('table', { name: tableName })
    .getByRole('row')
    .filter({ hasText: text })
    .last();
}

async function addInlineOption(page, dialog, selectLabel, optionName) {
  await dialog.getByLabel(selectLabel).selectOption('__ADD__');
  const optionDialog = page.locator('.contable-option-modal');
  await expect(optionDialog).toBeVisible();
  await optionDialog.getByLabel('Nombre *').fill(optionName);
  await optionDialog.getByRole('button', { name: 'Agregar opción' }).click();
  await expect(optionDialog).toHaveCount(0);
  await expect(dialog.getByLabel(selectLabel)).toHaveValue(/\d+/);
}

async function cleanupMovements(request) {
  const incomes = await apiCall(request, 'contable_ingresos_listar', {
    params: { anio: year, mes: month, buscar: suffix },
  }).catch(() => ({ items: [] }));
  for (const item of incomes.items || []) {
    await apiCall(request, 'contable_ingreso_eliminar', {
      method: 'POST',
      data: { id_ingreso: item.id_ingreso },
    }).catch(() => undefined);
  }

  const expenses = await apiCall(request, 'contable_egresos_listar', {
    params: { anio: year, mes: month, buscar: suffix },
  }).catch(() => ({ items: [] }));
  for (const item of expenses.items || []) {
    await apiCall(request, 'contable_egreso_eliminar', {
      method: 'POST',
      data: { id_egreso: item.id_egreso },
    }).catch(() => undefined);
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('Contabilidad completa desde la interfaz', () => {
  test.afterEach(async ({ request }) => {
    await cleanupMovements(request);
    for (const [type, name] of [
      ['PROVEEDOR', names.incomeProvider],
      ['CATEGORIA_INGRESO', names.incomeCategory],
      ['CONCEPTO_INGRESO', names.incomeConcept],
      ['PROVEEDOR', names.expenseProvider],
      ['CATEGORIA_EGRESO', names.expenseCategory],
      ['CONCEPTO_EGRESO', names.expenseConcept],
    ]) {
      await cleanupContableOptionByName(request, type, name).catch(() => undefined);
    }
  });

  test('abre y cierra los modales por Cancelar, X, Escape y fondo', async ({ page }) => {
    await page.goto('/contable/ingresos');
    await page.getByRole('tab', { name: 'Otros ingresos' }).click();

    await page.getByRole('button', { name: 'Registrar ingreso' }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Registrar ingreso' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Registrar ingreso' }).first().click();
    dialog = page.getByRole('dialog', { name: 'Registrar ingreso' });
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Registrar ingreso' }).first().click();
    dialog = page.getByRole('dialog', { name: 'Registrar ingreso' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Registrar ingreso' }).first().click();
    dialog = page.getByRole('dialog', { name: 'Registrar ingreso' });
    await page.locator('.entity-modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
  });

  test('crea opciones dentro del formulario y completa alta, edición, Excel y eliminación de ingreso', async ({ page }) => {
    await page.goto('/contable/ingresos');
    await page.getByRole('tab', { name: 'Otros ingresos' }).click();
    await page.getByRole('button', { name: 'Registrar ingreso' }).first().click();

    let dialog = page.getByRole('dialog', { name: 'Registrar ingreso' });
    await dialog.getByLabel('Medio de pago *').selectOption({ index: 1 });
    await addInlineOption(page, dialog, 'Persona / proveedor *', names.incomeProvider);
    await addInlineOption(page, dialog, 'Categoría *', names.incomeCategory);
    await addInlineOption(page, dialog, 'Descripción / concepto *', names.incomeConcept);
    await dialog.getByLabel('Importe (ARS) *').fill('1234.56');
    await dialog.getByLabel('Detalle opcional').fill(incomeDetail.toLowerCase());
    await expect(dialog.getByLabel('Detalle opcional')).toHaveValue(incomeDetail);
    await dialog.getByRole('button', { name: 'Guardar ingreso' }).click();
    await expect(dialog).toBeHidden();

    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(suffix);
    let row = rowByText(page, 'Listado de ingresos', suffix);
    await expect(row).toContainText(incomeDetail);
    await expect(row).toContainText(names.incomeProvider);

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar ingreso' });
    await dialog.getByLabel('Importe (ARS) *').fill('1500.75');
    await dialog.getByLabel('Detalle opcional').fill(incomeEdited);
    await dialog.getByRole('button', { name: 'Guardar ingreso' }).click();
    await expect(dialog).toBeHidden();

    row = rowByText(page, 'Listado de ingresos', suffix);
    await expect(row).toContainText(incomeEdited);

    await captureDownload(
      page,
      () => page.getByRole('button', { name: 'Excel', exact: true }).click(),
      { extension: '.xls', minimumBytes: 200 },
    );

    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(search).toHaveValue('');
    await search.fill(suffix);

    row = rowByText(page, 'Listado de ingresos', suffix);
    await row.getByTitle('Anular').click();
    const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Eliminar ingreso' });
    await deleteDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(deleteDialog).toBeHidden();
    await row.getByTitle('Anular').click();
    await page.getByRole('dialog').filter({ hasText: 'Eliminar ingreso' })
      .getByRole('button', { name: 'Eliminar movimiento' }).click();
    await expect(rowByText(page, 'Listado de ingresos', suffix)).toHaveCount(0);
  });

  test('valida archivos y completa alta, descarga, vista, reemplazo, retiro, Excel y eliminación de egreso', async ({ page, request }) => {
    await page.goto('/contable/egresos');
    await page.getByRole('button', { name: 'Registrar egreso' }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Registrar egreso' });

    await addInlineOption(page, dialog, 'Categoría *', names.expenseCategory);
    await addInlineOption(page, dialog, 'Proveedor *', names.expenseProvider);
    await addInlineOption(page, dialog, 'Descripción / concepto *', names.expenseConcept);
    const medium = dialog.getByLabel('Medio de pago *');
    await medium.selectOption({ index: 1 });
    await dialog.getByLabel('N.º de comprobante').fill(`e2e-${suffix}`);
    await dialog.getByLabel('Importe (ARS) *').fill('432.10');
    await dialog.getByLabel('Detalle opcional').fill(expenseDetail.toLowerCase());

    await dialog.getByRole('tab', { name: 'Comprobante' }).click();
    await expect(dialog.getByText('Elegir archivo', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Arrastrá una imagen o PDF, o elegí un archivo.')).toBeVisible();
    const dropData = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(['%PDF-1.4\n%%EOF'], 'comprobante-arrastrado.pdf', {
          type: 'application/pdf',
        }),
      );
      return transfer;
    });
    await dialog.locator('.contable-upload').dispatchEvent('drop', {
      dataTransfer: dropData,
    });
    await expect(dialog).toContainText('comprobante-arrastrado.pdf');
    await dialog.getByRole('button', { name: 'Quitar comprobante' }).click();

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidFile);
    await expect(page.getByText('Solo se permiten PDF, JPG, PNG, GIF o WEBP.')).toBeVisible();

    await fileInput.setInputFiles({
      name: 'demasiado-grande.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1),
    });
    await expect(page.getByText('El archivo no puede superar los 10 MB.')).toBeVisible();

    await fileInput.setInputFiles(validPdf);
    await expect(dialog).toContainText('comprobante-e2e.pdf');
    await dialog.getByRole('button', { name: 'Quitar comprobante' }).click();
    await expect(dialog.getByRole('button', { name: 'Quitar comprobante' })).toHaveCount(0);

    await fileInput.setInputFiles(validPdf);
    await expect(dialog).toContainText('comprobante-e2e.pdf');
    await dialog.getByRole('button', { name: 'Guardar egreso' }).click();
    await expect(dialog).toBeHidden();

    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(suffix);
    let row = rowByText(page, 'Listado de egresos', suffix);
    await expect(row).toContainText(expenseDetail);
    await expect(row.getByTitle('Ver comprobante')).toBeEnabled();

    const listed = await apiCall(request, 'contable_egresos_listar', {
      params: { anio: year, mes: month, buscar: suffix },
    });
    const savedExpense = (listed.items || []).find((item) =>
      String(item.detalle || '').includes(suffix),
    );
    expect(savedExpense?.id_egreso).toBeTruthy();
    const session = readAuthSession();
    const fileResponse = await request.fetch(
      actionUrl('contable_egreso_archivo', { id: savedExpense.id_egreso }),
      {
        headers: { Authorization: `Bearer ${session.token}` },
        failOnStatusCode: false,
      },
    );
    expect(fileResponse.status()).toBe(200);
    expect(fileResponse.headers()['content-type']).toMatch(/application\/pdf/i);
    const fileBody = await fileResponse.body();
    expect(fileBody.subarray(0, 4).toString('binary')).toBe('%PDF');

    await page.evaluate(() => {
      window.__pwOriginalOpen = window.open;
      window.__pwComprobantePreview = {
        html: '',
        focused: false,
      };
      window.open = () => ({
        closed: false,
        document: {
          title: '',
          body: { innerHTML: '' },
          open() {
            window.__pwComprobantePreview.html = '';
          },
          write(value) {
            window.__pwComprobantePreview.html += String(value);
          },
          close() {},
        },
        focus() {
          window.__pwComprobantePreview.focused = true;
        },
        close() {},
      });
    });

    const browserFileResponsePromise = page.waitForResponse((response) =>
      response.url().includes('action=contable_egreso_archivo') && response.status() === 200,
    );
    await row.getByTitle('Ver comprobante').click();
    const browserFileResponse = await browserFileResponsePromise;
    expect(browserFileResponse.headers()['content-type']).toMatch(/application\/pdf/i);
    await expect.poll(() => page.evaluate(() => window.__pwComprobantePreview.html))
      .toMatch(/<iframe[^>]+src="blob:/i);
    await expect.poll(() => page.evaluate(() => window.__pwComprobantePreview.focused))
      .toBe(true);
    await page.evaluate(() => {
      window.open = window.__pwOriginalOpen;
      delete window.__pwOriginalOpen;
      delete window.__pwComprobantePreview;
    });

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar egreso' });
    await dialog.getByLabel('Detalle opcional').fill(expenseEdited);
    await dialog.getByRole('tab', { name: 'Comprobante' }).click();
    await dialog.getByRole('button', { name: 'Quitar comprobante' }).click();
    await dialog.getByRole('button', { name: 'Guardar egreso' }).click();
    await expect(dialog).toBeHidden();

    row = rowByText(page, 'Listado de egresos', suffix);
    await expect(row).toContainText(expenseEdited);
    await expect(row.getByTitle('Sin comprobante')).toBeDisabled();

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar egreso' });
    await dialog.getByRole('tab', { name: 'Comprobante' }).click();
    await dialog.locator('input[type="file"]').setInputFiles(validPdf);
    await dialog.getByRole('button', { name: 'Guardar egreso' }).click();
    await expect(dialog).toBeHidden();
    row = rowByText(page, 'Listado de egresos', suffix);
    await expect(row.getByTitle('Ver comprobante')).toBeEnabled();

    await captureDownload(
      page,
      () => page.getByRole('button', { name: 'Excel', exact: true }).click(),
      { extension: '.xls', minimumBytes: 200 },
    );

    await row.getByTitle('Anular').click();
    const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Eliminar egreso' });
    await deleteDialog.getByRole('button', { name: 'Eliminar movimiento' }).click();
    await expect(rowByText(page, 'Listado de egresos', suffix)).toHaveCount(0);
  });

  test('cambia entre resumen anual y mensual y aplica todos sus filtros', async ({ page }) => {
    await page.goto('/contable/resumen');
    await expect(page.getByRole('tab', { name: 'Anual' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('table', { name: 'Resumen anual por mes' })).toBeVisible();

    await page.getByRole('tab', { name: 'Mensual' }).click();
    await expect(page.getByRole('tab', { name: 'Mensual' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Categorías de ingresos')).toBeVisible();
    await expect(page.getByText('Categorías de egresos')).toBeVisible();
    await expect(page.getByText('Medios de cobro')).toBeVisible();

    const yearSelect = page.getByLabel('Año');
    await yearSelect.selectOption(await yearSelect.inputValue());
    const monthSelect = page.getByLabel('Mes');
    await monthSelect.selectOption(String(month));
    await expect(monthSelect).toHaveValue(String(month));
  });
});
