const { test, expect } = require('./fixtures/auth.fixture');
const {
  cleanupCatalogByName,
  cleanupContableOptionByName,
} = require('./helpers/api.helper');
const { expectToast } = require('./helpers/auth.helper');
const { uniqueSuffix } = require('./helpers/data.helper');

const suffix = uniqueSuffix();
const catalogs = [
  {
    tab: 'Medios de pago',
    list: 'medios_pago',
    label: 'medio de pago',
    original: `PW E2E MEDIO ${suffix}`,
    edited: `PW E2E MEDIO EDITADO ${suffix}`,
  },
  {
    tab: 'Condiciones frente al IVA',
    list: 'condiciones_iva',
    label: 'condición frente al IVA',
    original: `PW E2E IVA ${suffix}`,
    edited: `PW E2E IVA EDITADA ${suffix}`,
  },
];

const contableLists = [
  {
    tab: 'Personas / proveedores',
    type: 'PROVEEDOR',
    label: 'persona o proveedor',
    createLabel: 'Nueva persona o proveedor',
    original: `PW E2E PROVEEDOR ${suffix}`,
    edited: `PW E2E PROVEEDOR EDITADO ${suffix}`,
  },
  {
    tab: 'Categorías de ingresos',
    type: 'CATEGORIA_INGRESO',
    label: 'categoría de ingreso',
    createLabel: 'Nueva categoría de ingreso',
    original: `PW E2E CAT ING ${suffix}`,
    edited: `PW E2E CAT ING EDITADA ${suffix}`,
  },
  {
    tab: 'Conceptos de ingresos',
    type: 'CONCEPTO_INGRESO',
    label: 'concepto de ingreso',
    createLabel: 'Nuevo concepto de ingreso',
    original: `PW E2E CON ING ${suffix}`,
    edited: `PW E2E CON ING EDITADO ${suffix}`,
  },
  {
    tab: 'Categorías de egresos',
    type: 'CATEGORIA_EGRESO',
    label: 'categoría de egreso',
    createLabel: 'Nueva categoría de egreso',
    original: `PW E2E CAT EGR ${suffix}`,
    edited: `PW E2E CAT EGR EDITADA ${suffix}`,
  },
  {
    tab: 'Conceptos de egresos',
    type: 'CONCEPTO_EGRESO',
    label: 'concepto de egreso',
    createLabel: 'Nuevo concepto de egreso',
    original: `PW E2E CON EGR ${suffix}`,
    edited: `PW E2E CON EGR EDITADO ${suffix}`,
  },
];

function catalogRow(page, name) {
  return page.locator('.config-list__item').filter({ hasText: name }).last();
}

test.describe.configure({ mode: 'serial' });

test.describe('Configuración general', () => {
  test.afterEach(async ({ request }) => {
    for (const catalog of catalogs) {
      for (const name of [catalog.original, catalog.edited]) {
        try {
          await cleanupCatalogByName(request, catalog.list, name);
        } catch (_error) {
          // El error principal del escenario debe conservarse.
        }
      }
    }
    for (const list of contableLists) {
      for (const name of [list.original, list.edited]) {
        try {
          await cleanupContableOptionByName(request, list.type, name);
        } catch (_error) {
          // El error principal del escenario debe conservarse.
        }
      }
    }
  });

  test('muestra solamente las secciones actuales y navega correctamente', async ({ page }) => {
    await page.goto('/configuracion');
    await expect(page.getByText('Solo las opciones que utiliza LALCEC V2')).toBeVisible();

    const sections = page.getByRole('navigation', { name: 'Secciones de configuración' });
    await expect(sections.getByRole('button')).toHaveCount(3);
    await expect(sections.getByRole('button', { name: /Usuarios y roles/i })).toBeVisible();
    await expect(sections.getByRole('button', { name: /Catálogos generales/i })).toBeVisible();
    await expect(sections.getByRole('button', { name: /^Contable/i })).toBeVisible();

    await sections.getByRole('button', { name: /Catálogos generales/i }).click();
    await expect(page).toHaveURL(/\/configuracion\/catalogos$/);
    await expect(page.getByRole('heading', { name: 'Catálogos generales' })).toBeVisible();
    await page.getByRole('button', { name: 'Volver a configuración' }).click();
    await expect(page).toHaveURL(/\/configuracion$/);

    await page
      .getByRole('navigation', { name: 'Secciones de configuración' })
      .getByRole('button', { name: /^Contable/i })
      .click();
    await expect(page).toHaveURL(/\/configuracion\/contable$/);
    await expect(page.getByRole('heading', { name: 'Configuración contable' })).toBeVisible();
    await page.getByRole('button', { name: 'Volver a configuración' }).click();

    await page
      .getByRole('navigation', { name: 'Secciones de configuración' })
      .getByRole('button', { name: /Usuarios y roles/i })
      .click();
    await expect(page).toHaveURL(/\/configuracion\/usuarios$/);
    await expect(page.getByRole('heading', { name: 'Configuración de usuarios' })).toBeVisible();
  });

  test('crea, busca, edita y elimina los dos catálogos generales', async ({ page, request }) => {
    for (const catalog of catalogs) {
      await cleanupCatalogByName(request, catalog.list, catalog.original).catch(() => false);
      await cleanupCatalogByName(request, catalog.list, catalog.edited).catch(() => false);
    }

    await page.goto('/configuracion/catalogos');
    await expect(page.getByRole('heading', { name: 'Catálogos generales' })).toBeVisible();

    for (const catalog of catalogs) {
      await page.getByRole('tab', { name: catalog.tab, exact: true }).click();
      await expect(
        page.getByRole('tab', { name: catalog.tab, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');

      await page.getByRole('button', { name: `Nuevo ${catalog.label}` }).click();
      let dialog = page.getByRole('dialog', { name: `Agregar ${catalog.label}` });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Nombre *').fill(catalog.original);
      await dialog.getByRole('button', { name: 'Agregar' }).click();
      await expectToast(page, 'La opción se agregó correctamente.');

      const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
      await search.fill(catalog.original);
      let row = catalogRow(page, catalog.original);
      await expect(row).toContainText('ACTIVO');
      await expect(row).toContainText('Sin registros asociados');

      await row.getByRole('button', { name: `Editar ${catalog.original}` }).click();
      dialog = page.getByRole('dialog', { name: `Editar ${catalog.label}` });
      await dialog.getByLabel('Nombre *').fill(catalog.edited);
      await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
      await expectToast(page, 'La opción se modificó correctamente.');

      await search.fill(catalog.edited);
      row = catalogRow(page, catalog.edited);
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: `Eliminar ${catalog.edited}` }).click();

      const deleteDialog = page.getByRole('dialog').filter({
        hasText: new RegExp(`Eliminar ${catalog.label}`, 'i'),
      });
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
      await expectToast(page, /opción se eliminó definitivamente/i);
      await expect(catalogRow(page, catalog.edited)).toHaveCount(0);
    }
  });

  test('administra las cinco listas usadas por ingresos y egresos', async ({ page, request }) => {
    for (const list of contableLists) {
      await cleanupContableOptionByName(request, list.type, list.original).catch(() => false);
      await cleanupContableOptionByName(request, list.type, list.edited).catch(() => false);
    }

    await page.goto('/configuracion/contable');
    await expect(page.getByRole('heading', { name: 'Configuración contable' })).toBeVisible();

    for (const list of contableLists) {
      await page.getByRole('tab', { name: list.tab, exact: true }).click();
      await expect(page.getByRole('tab', { name: list.tab, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await page.getByRole('button', { name: list.createLabel }).click();
      let dialog = page.getByRole('dialog', { name: `Agregar ${list.label}` });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Nombre *').fill(list.original);
      await dialog.getByRole('button', { name: 'Agregar' }).click();
      await expectToast(page, 'La opción se agregó correctamente.');

      const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
      await search.fill(list.original);
      let row = catalogRow(page, list.original);
      await expect(row).toContainText('Disponible en los selectores de Contabilidad');

      await row.getByRole('button', { name: `Editar ${list.original}` }).click();
      dialog = page.getByRole('dialog', { name: `Editar ${list.label}` });
      await dialog.getByLabel('Nombre *').fill(list.edited);
      await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
      await expectToast(page, 'La opción se modificó correctamente.');

      await search.fill(list.edited);
      row = catalogRow(page, list.edited);
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: `Eliminar ${list.edited}` }).click();
      const deleteDialog = page.getByRole('dialog').filter({
        hasText: new RegExp(`Eliminar ${list.label}`, 'i'),
      });
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
      await expectToast(page, /opción se eliminó correctamente/i);
      await expect(catalogRow(page, list.edited)).toHaveCount(0);
    }
  });
});
