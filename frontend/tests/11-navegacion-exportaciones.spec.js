const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, familyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupFamilyByPrefix,
  cleanupSocioByDocument,
} = require('./helpers/api.helper');
const { createCompany, createFamily, createPerson } = require('./helpers/entities.helper');
const { exportFromGlobalModal } = require('./helpers/download.helper');

const person = personData();
const company = companyData();
const family = familyData();
const familyMember = personData();

async function disableExternalLogoLookup(page) {
  await page.route(/\/routes\/api\.php\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('action') !== 'perfil_logo_institucional') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ exito: false, mensaje: 'Sin logo E2E' }),
    });
  });
}

async function exportBothFormats(page, button) {
  await exportFromGlobalModal(page, {
    openButton: button,
    format: 'Excel',
    expectedExtension: '.xlsx',
  });
  await exportFromGlobalModal(page, {
    openButton: button,
    format: 'PDF',
    expectedExtension: '.pdf',
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Navegación, responsive, paginación y exportaciones', () => {
  test.afterEach(async ({ request }) => {
    try {
      cleanupFamilyByPrefix(family.prefix);
    } catch (_error) {
      // Puede no haberse creado.
    }
    for (const target of [
      { tipo: 'PERSONA', documento: person.dni },
      { tipo: 'EMPRESA', documento: company.cuit },
      { tipo: 'PERSONA', documento: familyMember.dni },
    ]) {
      await cleanupSocioByDocument(request, target).catch(() => undefined);
    }
  });

  test('recorre menú lateral, grupos, doble clic, configuración y redirecciones', async ({ page }) => {
    await page.goto('/panel');
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' });

    const sociosGroup = navigation.getByRole('button', { name: 'Socios', exact: true });
    await expect(sociosGroup).toHaveAttribute(
      'title',
      'Un clic para desplegar; doble clic para ingresar',
    );
    await sociosGroup.click();
    await expect(sociosGroup).toHaveAttribute('aria-expanded', 'true');
    await navigation.getByRole('link', { name: 'Empresas', exact: true }).click();
    await expect(page).toHaveURL(/\/socios\/empresas$/);

    const categoriasGroup = navigation.getByRole('button', { name: 'Categorías', exact: true });
    await categoriasGroup.click();
    await navigation.getByRole('link', { name: 'Descuentos familiares' }).click();
    await expect(page).toHaveURL(/\/categorias\/descuentos$/);

    await navigation.getByRole('link', { name: 'Cuotas', exact: true }).click();
    await expect(page).toHaveURL(/\/cuotas$/);

    const contabilidadGroup = navigation.getByRole('button', { name: 'Contabilidad', exact: true });
    await contabilidadGroup.click();
    await navigation.getByRole('link', { name: 'Resumen', exact: true }).click();
    await expect(page).toHaveURL(/\/contable\/resumen$/);

    await page.getByRole('button', { name: 'Abrir configuración' }).click();
    await expect(page).toHaveURL(/\/configuracion$/);

    await sociosGroup.dblclick();
    await expect(page).toHaveURL(/\/socios\/personas$/);

    await page.goto('/socios');
    await expect(page).toHaveURL(/\/socios\/personas$/);
    await page.goto('/contable');
    await expect(page).toHaveURL(/\/contable\/ingresos$/);
    await page.goto('/ruta-que-no-existe');
    await expect(page).toHaveURL(/\/panel$/);
  });

  test('abre el perfil, lo cierra por X y Escape y navega a Configuración desde el modal', async ({ page }) => {
    await page.goto('/panel');

    await page.getByRole('button', { name: 'Abrir perfil' }).click();
    let dialog = page.getByRole('dialog', { name: 'Perfil de usuario' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('LALCEC San Francisco');
    await expect(dialog).toContainText(/Administrador/i);
    await dialog.getByRole('button', { name: 'Cerrar perfil' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Abrir perfil' }).click();
    dialog = page.getByRole('dialog', { name: 'Perfil de usuario' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Abrir perfil' }).click();
    dialog = page.getByRole('dialog', { name: 'Perfil de usuario' });
    await dialog.getByRole('button', { name: 'Configuración', exact: true }).click();
    await expect(page).toHaveURL(/\/configuracion$/);
    await expect(dialog).toBeHidden();
  });

  test('abre y cierra el menú móvil por botón, enlace, X y fondo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/panel');

    const sidebar = page.locator('.pp-sidebar');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(sidebar).toHaveClass(/is-drawerOpen/);
    await page.getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Cuotas', exact: true })
      .click();
    await expect(page).toHaveURL(/\/cuotas$/);
    await expect(sidebar).not.toHaveClass(/is-drawerOpen/);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await sidebar.locator('.pp-drawerClose').click();
    await expect(sidebar).not.toHaveClass(/is-drawerOpen/);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('.pp-drawerOverlay.is-open').click({ position: { x: 380, y: 400 } });
    await expect(sidebar).not.toHaveClass(/is-drawerOpen/);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await sidebar.locator('.pp-drawerBrand').click();
    await expect(page).toHaveURL(/\/panel$/);
  });

  test('pagina socios con Anterior, número de página y Siguiente', async ({ page, request }) => {
    const saved = await createPerson(request, person);
    const real = await apiCall(request, 'socios_listar', {
      params: { tipo: 'PERSONA', estado: 'ACTIVO', buscar: person.dni, pagina: 1 },
    });
    const template = real.items.find((item) => item.id_socio === saved.id_socio) || real.items[0];
    expect(template).toBeTruthy();

    await page.route(/api\.php\?action=socios_listar(?:&|$)/, async (route) => {
      const url = new URL(route.request().url());
      const requestedPage = Number(url.searchParams.get('pagina') || 1);
      const makeItem = (index) => ({
        ...template,
        id_socio: 900000 + index,
        dni: String(70000000 + index),
        apellido: `PAGINA ${String(index).padStart(3, '0')}`,
        nombre: 'PLAYWRIGHT',
        denominacion: `PAGINA ${String(index).padStart(3, '0')}, PLAYWRIGHT`,
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
          resumen: real.resumen,
          catalogos: real.catalogos,
          paginacion: {
            pagina: requestedPage,
            por_pagina: 100,
            total: 101,
            total_paginas: 2,
            desde: requestedPage === 1 ? 1 : 101,
            hasta: requestedPage === 1 ? 100 : 101,
            tiene_anterior: requestedPage > 1,
            tiene_siguiente: requestedPage < 2,
          },
        }),
      });
    });

    await page.goto('/socios/personas');
    const pagination = page.getByRole('navigation', { name: 'Paginación de socios' });
    await expect(pagination).toContainText('1–100 de 101');
    await pagination.getByRole('button', { name: '2', exact: true }).click();
    await expect(pagination).toContainText('101–101 de 101');
    await expect(page.getByRole('table', { name: 'Listado de socios' })).toContainText('PAGINA 101');
    await pagination.getByRole('button', { name: 'Anterior' }).click();
    await expect(pagination).toContainText('1–100 de 101');
    await pagination.getByRole('button', { name: 'Siguiente' }).click();
    await expect(pagination).toContainText('101–101 de 101');

    await disableExternalLogoLookup(page);
    await exportFromGlobalModal(page, {
      openButton: page.getByRole('button', { name: 'Exportar', exact: true }),
      format: 'Excel',
      scope: 'Exportar esta página',
      expectedExtension: '.xlsx',
    });
    await exportFromGlobalModal(page, {
      openButton: page.getByRole('button', { name: 'Exportar', exact: true }),
      format: 'PDF',
      scope: 'Exportar todos los socios',
      expectedExtension: '.pdf',
    });
  });

  test('descarga Excel y PDF reales de socios', async ({ page, request }) => {
    await disableExternalLogoLookup(page);
    await createPerson(request, person);
    await page.goto('/socios/personas');
    await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(person.dni);
    await expect(page.getByRole('table', { name: 'Listado de socios' })).toContainText(person.dni);
    await exportBothFormats(page, page.getByRole('button', { name: 'Exportar', exact: true }));
  });

  test('descarga Excel y PDF reales de empresas', async ({ page, request }) => {
    await disableExternalLogoLookup(page);
    await createCompany(request, company);
    await page.goto('/socios/empresas');
    await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(company.cuit);
    await expect(page.getByRole('table', { name: 'Listado de empresas' })).toContainText(company.cuit);
    await exportBothFormats(page, page.getByRole('button', { name: 'Exportar', exact: true }));
  });

  test('descarga Excel y PDF reales de familias', async ({ page, request }) => {
    await disableExternalLogoLookup(page);
    const member = await createPerson(request, familyMember);
    await createFamily(request, family, [member]);
    await page.goto('/socios/familias');
    await page.getByRole('textbox', { name: 'Búsqueda', exact: true }).fill(family.prefix);
    await expect(page.getByRole('table', { name: 'Listado de familias' })).toContainText(family.prefix);
    await exportBothFormats(page, page.getByRole('button', { name: 'Exportar', exact: true }));
  });
});
