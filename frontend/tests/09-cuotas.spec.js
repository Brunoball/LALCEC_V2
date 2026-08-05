const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupSocioByDocument,
  expectApiError,
} = require('./helpers/api.helper');
const { createCompany, createPerson } = require('./helpers/entities.helper');
const { todayIso } = require('./helpers/data.helper');

const person = personData();
const company = companyData();
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

test.describe.configure({ mode: 'serial' });

test.describe('Cuotas de socios y empresas', () => {
  test.afterEach(async ({ request }) => {
    for (const target of [
      { tipo: 'PERSONA', documento: person.dni },
      { tipo: 'EMPRESA', documento: company.cuit },
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
          monto: category.monto_actual,
          id_medio_pago: medium.id_medio_pago,
        },
      });
      expect(payment.item.id_pago).toBeGreaterThan(0);
      expect(payment.item.denominacion).toContain(target.name.split(',')[0]);

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
            monto: category.monto_actual,
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
      'cuotas_eliminar_pago',
      { method: 'POST', data: { id_pago: 2147483647 } },
      { status: 404, code: 'PAGO_NO_ENCONTRADO' },
    );
  });
});
