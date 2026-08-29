const { test, expect } = require('./fixtures/auth.fixture');

const emptyPagination = {
  pagina: 1,
  por_pagina: 100,
  total: 0,
  total_paginas: 0,
  desde: 0,
  hasta: 0,
  tiene_anterior: false,
  tiene_siguiente: false,
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function jsonResponse(body) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test.describe('Estados transversales y regresiones de interfaz', () => {
  test('renderiza la cantidad prevista de skeletons y comunica aria-busy durante cada carga', async ({ page }) => {
    const scenarios = [
      {
        route: '/socios/personas',
        action: 'socios_listar',
        tableName: 'Listado de socios',
        rows: 7,
        body: {
          exito: true,
          items: [],
          resumen: {},
          catalogos: { categorias: [], medios_pago: [], familias: [] },
          paginacion: emptyPagination,
        },
      },
      {
        route: '/cuotas',
        action: 'cuotas_listar',
        tableName: 'Cuotas de socios adeudadas',
        rows: 8,
        body: {
          exito: true,
          items: [],
          resumen: {},
          periodo: {},
          paginacion: emptyPagination,
        },
      },
      {
        route: '/categorias',
        action: 'categorias_listar',
        tableName: 'Listado de categorías',
        rows: 7,
        body: {
          exito: true,
          items: [],
          resumen: { total: 0, activas: 0, inactivas: 0, promedio: '0.00' },
        },
      },
      {
        route: '/contable/ingresos',
        action: 'contable_ingresos_socios',
        tableName: 'Listado de ingresos',
        rows: 6,
        body: { exito: true, items: [], resumen: { registros: 0, importe: '0.00' } },
      },
      {
        route: '/configuracion/usuarios',
        action: 'usuarios_listar',
        tableName: 'Usuarios del sistema',
        rows: 6,
        body: {
          exito: true,
          usuarios: [],
          resumen: { total: 0, activos: 0, bajas: 0, admins: 0 },
          capacidades: { email: true, fecha_creacion: true },
        },
      },
    ];

    for (const scenario of scenarios) {
      const requested = deferred();
      const release = deferred();
      const pattern = new RegExp(`api\\.php\\?action=${scenario.action}(?:&|$)`);
      const handler = async (route) => {
        requested.resolve();
        await release.promise;
        await route.fulfill(jsonResponse(scenario.body));
      };

      await page.route(pattern, handler);
      const navigation = page.goto(scenario.route);
      await requested.promise;

      const table = page.getByRole('table', { name: scenario.tableName });
      await expect(table).toHaveAttribute('aria-busy', 'true');
      await expect(table.locator('.mov-row--skeleton')).toHaveCount(scenario.rows);

      release.resolve();
      await navigation;
      await expect(table).toHaveAttribute('aria-busy', 'false');
      await expect(table.locator('.mov-row--skeleton')).toHaveCount(0);
      await page.unroute(pattern, handler);
    }
  });

  test('ignora una respuesta de búsqueda anterior cuando llega después de la más reciente', async ({ page }) => {
    const firstSearchRequested = deferred();
    const releaseFirstSearch = deferred();
    const pattern = /api\.php\?action=socios_listar(?:&|$)/;
    const response = (items) => ({
      exito: true,
      items,
      resumen: {},
      catalogos: { categorias: [], medios_pago: [], familias: [] },
      paginacion: {
        ...emptyPagination,
        total: items.length,
        total_paginas: items.length ? 1 : 0,
        desde: items.length ? 1 : 0,
        hasta: items.length,
      },
    });
    const secondItem = {
      id_socio: 990002,
      denominacion: 'SOCIO SEGUNDO RESULTADO',
      dni: '99000002',
      activo: true,
      enviar_recordatorio: false,
    };
    const staleItem = {
      id_socio: 990001,
      denominacion: 'SOCIO PRIMERO OBSOLETO',
      dni: '99000001',
      activo: true,
      enviar_recordatorio: false,
    };

    await page.route(pattern, async (route) => {
      const search = (
        new URL(route.request().url()).searchParams.get('buscar') || ''
      )
        .trim()
        .toLocaleUpperCase('es-AR');
      if (search === 'PRIMERO') {
        firstSearchRequested.resolve();
        await releaseFirstSearch.promise;
        await route.fulfill(jsonResponse(response([staleItem])));
        return;
      }
      if (search === 'SEGUNDO') {
        await route.fulfill(jsonResponse(response([secondItem])));
        return;
      }
      await route.fulfill(jsonResponse(response([])));
    });

    await page.goto('/socios/personas');
    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill('PRIMERO');
    await firstSearchRequested.promise;
    await search.fill('SEGUNDO');

    const table = page.getByRole('table', { name: 'Listado de socios' });
    await expect(table).toContainText(secondItem.denominacion);
    await expect(table).not.toContainText(staleItem.denominacion);

    releaseFirstSearch.resolve();
    await expect.poll(async () => table.innerText()).toContain(secondItem.denominacion);
    await expect(table).not.toContainText(staleItem.denominacion);
  });

  test('permite navegar tabs con teclado y Escape cierra sólo el modal superior', async ({ page }) => {
    await page.goto('/contable/egresos');
    await page.getByRole('button', { name: 'Registrar egreso' }).first().click();

    const expenseDialog = page.getByRole('dialog', { name: 'Registrar egreso' });
    const movementTab = expenseDialog.getByRole('tab', { name: 'Datos del egreso' });
    const receiptTab = expenseDialog.getByRole('tab', { name: 'Comprobante' });

    await movementTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(receiptTab).toHaveAttribute('aria-selected', 'true');
    await expect(receiptTab).toBeFocused();
    await page.keyboard.press('Home');
    await expect(movementTab).toHaveAttribute('aria-selected', 'true');
    await expect(movementTab).toBeFocused();
    await page.keyboard.press('End');
    await expect(receiptTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');

    await expenseDialog.getByLabel('Categoría *').selectOption('__ADD__');
    const optionDialog = page.locator('.contable-option-modal[role="dialog"]');
    await expect(optionDialog).toBeVisible();
    await expect(
      optionDialog.getByRole('heading', { name: 'Agregar Categoría *' }),
    ).toBeVisible();
    const labelledIds = await page.locator('[role="dialog"]').evaluateAll((dialogs) =>
      dialogs
        .map((dialog) => dialog.getAttribute('aria-labelledby'))
        .filter(Boolean),
    );

    await page.keyboard.press('Escape');
    await expect(optionDialog).toBeHidden();
    await expect(expenseDialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(expenseDialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(
      new Set(labelledIds).size,
      'Los modales apilados deben usar ids aria-labelledby únicos.',
    ).toBe(labelledIds.length);
  });

  test('anima el cambio de altura del modal y limpia sus estilos temporales al terminar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/contable/egresos');
    await page.getByRole('button', { name: 'Registrar egreso' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Registrar egreso' });
    await dialog.evaluate((element) => {
      window.__pwModalResizeSamples = [];
      const capture = () => {
        if (!element.classList.contains('is-size-transitioning')) return;
        window.__pwModalResizeSamples.push({
          height: element.style.height,
          transition: element.style.transition,
        });
      };
      new MutationObserver(capture).observe(element, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    });

    await dialog.getByRole('tab', { name: 'Comprobante' }).click();
    await expect.poll(() => page.evaluate(() => window.__pwModalResizeSamples.length)).toBeGreaterThan(0);

    const samples = await page.evaluate(() => window.__pwModalResizeSamples);
    expect(samples.some((sample) => /^\d+(?:\.\d+)?px$/.test(sample.height))).toBeTruthy();
    await expect.poll(() => page.evaluate(() =>
      window.__pwModalResizeSamples.some((sample) => sample.transition.includes('height 150ms')),
    )).toBeTruthy();
    await expect(dialog).not.toHaveClass(/is-size-transitioning/, { timeout: 1_000 });
    await expect(dialog).not.toHaveAttribute('style', /height:\s*\d/);
  });

  test('las vistas administrativas no provocan scroll horizontal en un viewport móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const routes = [
      '/panel',
      '/socios/personas',
      '/socios/empresas',
      '/socios/familias',
      '/cuotas',
      '/categorias',
      '/categorias/descuentos',
      '/contable/ingresos',
      '/contable/egresos',
      '/contable/resumen',
      '/configuracion/usuarios',
      '/configuracion/catalogos',
      '/configuracion/contable',
    ];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('#root')).not.toBeEmpty();
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document, `${route} desborda el documento`).toBeLessThanOrEqual(1);
      expect(overflow.body, `${route} desborda el body`).toBeLessThanOrEqual(1);
    }
  });
});
