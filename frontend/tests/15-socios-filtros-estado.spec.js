const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupCatalogByName,
  cleanupSocioByDocument,
  expectApiError,
} = require('./helpers/api.helper');
const { createCatalog, createCompany, createPerson } = require('./helpers/entities.helper');
const { lettersFromSuffix, todayIso, uniqueSuffix } = require('./helpers/data.helper');

const runToken = lettersFromSuffix(uniqueSuffix(), 10);
const mediumName = `PW EE MEDIO FILTROS ${runToken}`;
const personSearchToken = `PW FILTRO ${runToken} PERSONA`;
const companySearchToken = `PW FILTRO ${runToken} EMPRESA`;

const people = {
  paidUp: personData(),
  warning: personData(),
  danger: personData(),
  otherMedium: personData(),
};

const companies = {
  paidUp: companyData(),
  warning: companyData(),
  danger: companyData(),
  otherMedium: companyData(),
};

const allCleanupTargets = [
  ...Object.values(people).map((item) => ({ tipo: 'PERSONA', documento: item.dni })),
  ...Object.values(companies).map((item) => ({ tipo: 'EMPRESA', documento: item.cuit })),
];

function firstDayMonthsAgo(monthsAgo) {
  const [year, month] = todayIso().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - Number(monthsAgo), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function currentPeriod() {
  const [year, month] = todayIso().split('-').map(Number);
  return { year, month };
}

function tableRow(page, tableName, document) {
  return page
    .getByRole('table', { name: tableName })
    .getByRole('row')
    .filter({ hasText: document })
    .last();
}

async function activeCategory(request) {
  const response = await apiCall(request, 'categorias_listar', {
    params: { estado: 'activo' },
  });
  const category = (response.items || []).find(
    (item) => item.activo && Number(item.monto_actual || 0) > 0,
  );
  expect(category, 'Se necesita al menos una categoría activa con cuota para probar deuda.').toBeTruthy();
  return category;
}

function personWithLabel(data, label) {
  return {
    ...data,
    apellido: personSearchToken,
    nombre: `${label} ${data.textSuffix}`,
  };
}

function companyWithLabel(data, label) {
  return {
    ...data,
    razonSocial: `${companySearchToken} ${label} ${data.suffix}`,
  };
}

async function payCurrentMonth(request, tipo, item, document, mediumId) {
  const { year, month } = currentPeriod();
  const debt = await apiCall(request, 'cuotas_listar', {
    params: {
      tipo,
      estado: 'DEUDORES',
      anio: year,
      mes: month,
      buscar: document,
    },
  });
  const debtItem = (debt.items || []).find((row) => Number(row.id_socio) === Number(item.id_socio));
  expect(debtItem, `No se encontró la cuota actual adeudada para ${document}.`).toBeTruthy();

  await apiCall(request, 'cuotas_registrar_pago', {
    method: 'POST',
    data: {
      id_socio: item.id_socio,
      anio: year,
      mes: month,
      fecha_pago: todayIso(),
      monto: debtItem.monto_sugerido,
      id_medio_pago: mediumId,
    },
  });
}

async function listPartners(request, tipo, search, extra = {}) {
  return apiCall(request, 'socios_listar', {
    params: {
      tipo,
      estado: 'ACTIVO',
      buscar: search,
      pagina: 1,
      por_pagina: 100,
      ...extra,
    },
  });
}

function ids(response) {
  return (response.items || []).map((item) => Number(item.id_socio)).sort((a, b) => a - b);
}

function expectExactIds(response, expectedItems) {
  const expected = expectedItems.map((item) => Number(item.id_socio)).sort((a, b) => a - b);
  expect(ids(response)).toEqual(expected);
}

async function expectPaymentRow(page, tableName, document, statusLabel, stateClass) {
  const row = tableRow(page, tableName, document);
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-payment-status', statusLabel);
  await expect(row).toHaveClass(new RegExp(`\\b${stateClass}\\b`));
  return row;
}

async function assertFilterOptions(page) {
  const paymentMethod = page.getByLabel('Medio de pago');
  const paymentStatus = page.getByLabel('Estado de cuotas');
  const reminders = page.getByLabel('Avisos');

  await expect(paymentMethod).toBeVisible();
  await expect(paymentStatus).toBeVisible();
  await expect(reminders).toBeVisible();

  await expect(paymentStatus.locator('option')).toHaveText([
    'Todos',
    'AL DÍA',
    'DEBE 1-2 MESES',
    'DEBE 3 MESES O MÁS',
  ]);
  await expect(reminders.locator('option')).toHaveText([
    'Todos',
    'CON AVISO',
    'SIN AVISO',
  ]);
}

async function assertLegend(page) {
  const legend = page.getByLabel('Referencia de estado de pago');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('ESTADO DE PAGO');
  await expect(legend).toContainText('AL DÍA');
  await expect(legend).toContainText('DEBE 1-2 MESES');
  await expect(legend).toContainText('DEBE 3 MESES O MÁS');
  await expect(legend.locator('i.is-paid-up')).toHaveCount(1);
  await expect(legend.locator('i.is-warning')).toHaveCount(1);
  await expect(legend.locator('i.is-danger')).toHaveCount(1);
}

async function verifyUiForType(page, config) {
  const {
    route,
    heading,
    tableName,
    searchToken,
    mediumId,
    paidUp,
    warning,
    danger,
    otherMedium,
    documentField,
  } = config;

  await page.goto(route);
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await page.getByRole('tab', { name: 'Activos' }).click();
  await assertFilterOptions(page);
  await assertLegend(page);

  const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
  await search.fill(searchToken);

  await expectPaymentRow(page, tableName, paidUp[documentField], 'AL DÍA', 'is-paid-up');
  await expectPaymentRow(page, tableName, warning[documentField], 'DEBE 1-2 MESES', 'is-warning');
  await expectPaymentRow(page, tableName, danger[documentField], 'DEBE 3 MESES O MÁS', 'is-danger');
  await expect(tableRow(page, tableName, otherMedium[documentField])).toBeVisible();

  const mediumFilter = page.getByLabel('Medio de pago');
  const statusFilter = page.getByLabel('Estado de cuotas');
  const reminderFilter = page.getByLabel('Avisos');

  await mediumFilter.selectOption(String(mediumId));
  await expect(tableRow(page, tableName, paidUp[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, warning[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, danger[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, otherMedium[documentField])).toHaveCount(0);

  await statusFilter.selectOption('AL_DIA');
  await expect(tableRow(page, tableName, paidUp[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, warning[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, danger[documentField])).toHaveCount(0);

  await statusFilter.selectOption('DEBE_1_2');
  await expect(tableRow(page, tableName, warning[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, paidUp[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, danger[documentField])).toHaveCount(0);

  await statusFilter.selectOption('DEBE_3_MAS');
  await expect(tableRow(page, tableName, danger[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, paidUp[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, warning[documentField])).toHaveCount(0);

  await statusFilter.selectOption('');
  await reminderFilter.selectOption('CON_AVISO');
  await expect(tableRow(page, tableName, paidUp[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, danger[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, warning[documentField])).toHaveCount(0);

  await reminderFilter.selectOption('SIN_AVISO');
  await expect(tableRow(page, tableName, warning[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, paidUp[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, danger[documentField])).toHaveCount(0);

  // Verifica que los tres filtros nuevos puedan combinarse simultáneamente.
  await reminderFilter.selectOption('CON_AVISO');
  await statusFilter.selectOption('DEBE_3_MAS');
  await expect(tableRow(page, tableName, danger[documentField])).toBeVisible();
  await expect(tableRow(page, tableName, paidUp[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, warning[documentField])).toHaveCount(0);
  await expect(tableRow(page, tableName, otherMedium[documentField])).toHaveCount(0);

  // Al pasar a Bajas, estos filtros y la leyenda no deben quedar visibles ni activos.
  await page.getByRole('tab', { name: 'Bajas' }).click();
  await expect(page.getByLabel('Medio de pago')).toHaveCount(0);
  await expect(page.getByLabel('Estado de cuotas')).toHaveCount(0);
  await expect(page.getByLabel('Avisos')).toHaveCount(0);
  await expect(page.getByLabel('Referencia de estado de pago')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Activos' }).click();
  await expect(page.getByLabel('Medio de pago')).toHaveValue('');
  await expect(page.getByLabel('Estado de cuotas')).toHaveValue('');
  await expect(page.getByLabel('Avisos')).toHaveValue('');
}

test.describe('Filtros y semáforo de pagos de Socios y Empresas', () => {
  test.describe.configure({ mode: 'serial', retries: 1 });

  test.afterEach(async ({ page, request }) => {
    try {
      await page.goto('about:blank', { waitUntil: 'commit', timeout: 5000 });
    } catch (_error) {
      // La limpieza por API sigue siendo segura aunque Chromium ya se haya cerrado.
    }

    for (const target of allCleanupTargets) {
      try {
        await cleanupSocioByDocument(request, target);
      } catch (_error) {
        // Sólo se intentan borrar DNI/CUIT únicos generados por este archivo E2E.
      }
    }

    try {
      await cleanupCatalogByName(request, 'medios_pago', mediumName);
    } catch (_error) {
      // Si el medio no llegó a crearse, no hay nada para limpiar.
    }
  });

  test('filtra por medio, estado y avisos y muestra verde/amarillo/rojo en personas y empresas', async ({ page, request }) => {
    for (const target of allCleanupTargets) {
      await cleanupSocioByDocument(request, target);
    }
    await cleanupCatalogByName(request, 'medios_pago', mediumName);

    const category = await activeCategory(request);
    const medium = await createCatalog(request, 'medios_pago', mediumName);
    const mediumId = Number(medium.id_medio_pago);
    expect(mediumId).toBeGreaterThan(0);

    const currentMonthStart = firstDayMonthsAgo(0);
    const threePeriodsStart = firstDayMonthsAgo(2);

    const personPaidUpData = personWithLabel(people.paidUp, 'VERDE');
    const personWarningData = personWithLabel(people.warning, 'AMARILLO');
    const personDangerData = personWithLabel(people.danger, 'ROJO');
    const personOtherData = personWithLabel(people.otherMedium, 'OTRO MEDIO');

    const companyPaidUpData = companyWithLabel(companies.paidUp, 'VERDE');
    const companyWarningData = companyWithLabel(companies.warning, 'AMARILLO');
    const companyDangerData = companyWithLabel(companies.danger, 'ROJO');
    const companyOtherData = companyWithLabel(companies.otherMedium, 'OTRO MEDIO');

    const savedPeople = {
      paidUp: await createPerson(request, personPaidUpData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: true,
      }),
      warning: await createPerson(request, personWarningData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: false,
      }),
      danger: await createPerson(request, personDangerData, {
        fecha_alta: threePeriodsStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: true,
      }),
      otherMedium: await createPerson(request, personOtherData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: null,
        enviar_recordatorio: false,
      }),
    };

    const savedCompanies = {
      paidUp: await createCompany(request, companyPaidUpData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: true,
      }),
      warning: await createCompany(request, companyWarningData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: false,
      }),
      danger: await createCompany(request, companyDangerData, {
        fecha_alta: threePeriodsStart,
        id_categoria: category.id_categoria,
        id_medio_pago: mediumId,
        enviar_recordatorio: true,
      }),
      otherMedium: await createCompany(request, companyOtherData, {
        fecha_alta: currentMonthStart,
        id_categoria: category.id_categoria,
        id_medio_pago: null,
        enviar_recordatorio: false,
      }),
    };

    await payCurrentMonth(request, 'PERSONA', savedPeople.paidUp, people.paidUp.dni, mediumId);
    await payCurrentMonth(request, 'EMPRESA', savedCompanies.paidUp, companies.paidUp.cuit, mediumId);

    // Backend: el filtro debe operar sobre toda la consulta, no sobre los 100 visibles del frontend.
    for (const config of [
      {
        tipo: 'PERSONA',
        search: personSearchToken,
        saved: savedPeople,
      },
      {
        tipo: 'EMPRESA',
        search: companySearchToken,
        saved: savedCompanies,
      },
    ]) {
      const byMedium = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
      });
      expectExactIds(byMedium, [config.saved.paidUp, config.saved.warning, config.saved.danger]);

      const paidUp = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
        estado_cuota: 'AL_DIA',
      });
      expectExactIds(paidUp, [config.saved.paidUp]);
      expect(paidUp.items[0].cuotas_pendientes).toBe(0);
      expect(paidUp.items[0].estado_cuota_label).toBe('AL DÍA');

      const warning = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
        estado_cuota: 'DEBE_1_2',
      });
      expectExactIds(warning, [config.saved.warning]);
      expect(Number(warning.items[0].cuotas_pendientes)).toBeGreaterThanOrEqual(1);
      expect(Number(warning.items[0].cuotas_pendientes)).toBeLessThanOrEqual(2);
      expect(warning.items[0].estado_cuota_label).toBe('DEBE 1-2 MESES');

      const danger = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
        estado_cuota: 'DEBE_3_MAS',
      });
      expectExactIds(danger, [config.saved.danger]);
      expect(Number(danger.items[0].cuotas_pendientes)).toBeGreaterThanOrEqual(3);
      expect(danger.items[0].estado_cuota_label).toBe('DEBE 3 MESES O MÁS');

      const withReminder = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
        recordatorio: 'CON_AVISO',
      });
      expectExactIds(withReminder, [config.saved.paidUp, config.saved.danger]);

      const withoutReminder = await listPartners(request, config.tipo, config.search, {
        medio_pago: mediumId,
        recordatorio: 'SIN_AVISO',
      });
      expectExactIds(withoutReminder, [config.saved.warning]);
    }

    await verifyUiForType(page, {
      route: '/socios/personas',
      heading: 'Socios',
      tableName: 'Listado de socios',
      searchToken: personSearchToken,
      mediumId,
      paidUp: people.paidUp,
      warning: people.warning,
      danger: people.danger,
      otherMedium: people.otherMedium,
      documentField: 'dni',
    });

    await verifyUiForType(page, {
      route: '/socios/empresas',
      heading: 'Empresas',
      tableName: 'Listado de empresas',
      searchToken: companySearchToken,
      mediumId,
      paidUp: companies.paidUp,
      warning: companies.warning,
      danger: companies.danger,
      otherMedium: companies.otherMedium,
      documentField: 'cuit',
    });
  });

  test('rechaza valores inválidos de los filtros de estado y avisos', async ({ request }) => {
    await expectApiError(
      request,
      'socios_listar',
      {
        params: {
          tipo: 'PERSONA',
          estado: 'ACTIVO',
          estado_cuota: 'ESTADO_INVENTADO',
          pagina: 1,
        },
      },
      { code: 'FILTRO_INVALIDO' },
    );

    await expectApiError(
      request,
      'socios_listar',
      {
        params: {
          tipo: 'EMPRESA',
          estado: 'ACTIVO',
          recordatorio: 'AVISO_INVENTADO',
          pagina: 1,
        },
      },
      { code: 'FILTRO_INVALIDO' },
    );
  });
});
