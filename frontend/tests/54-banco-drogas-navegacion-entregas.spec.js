const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, medFixture, entryFixture, stockOf } = require('./helpers/medicamentos.helper');
const { uniqueSuffix } = require('./helpers/data.helper');

test.describe('Banco de Drogas: navegación independiente y entregas', () => {
  test('UI: menú con Stock/Préstamos y Stock/Entregas, sin presentaciones en la barra', async ({ page }) => {
    await page.goto('/panel');
    const menu = page.getByRole('navigation', { name: 'Navegación principal' });
    await menu.getByRole('button', { name: 'Banco de Drogas' }).click();
    const medicamentos = menu.getByRole('button', { name: 'Medicamentos', exact: true });
    await medicamentos.click();
    const ramaMed = medicamentos.locator('..');
    await expect(ramaMed.getByRole('link', { name: 'Stock' })).toBeVisible();
    await expect(ramaMed.getByRole('link', { name: 'Préstamos' })).toBeVisible();
    await expect(ramaMed.getByRole('link')).toHaveCount(2);
    await ramaMed.getByRole('link', { name: 'Stock' }).click();
    await expect(page).toHaveURL(/\/medicamentos\/stock$/);
    await expect(page.getByRole('combobox', { name: 'Presentación' })).toBeVisible();
    await ramaMed.getByRole('link', { name: 'Préstamos' }).click();
    await expect(page).toHaveURL(/\/medicamentos\/prestamos$/);

    const dolor = menu.getByRole('button', { name: 'Tratamiento del dolor' });
    await dolor.click();
    const ramaDolor = dolor.locator('..');
    await expect(ramaDolor.getByRole('link', { name: 'Stock' })).toBeVisible();
    await expect(ramaDolor.getByRole('link', { name: 'Entregas' })).toBeVisible();
    await expect(ramaDolor.getByRole('link')).toHaveCount(2);
    await ramaDolor.getByRole('link', { name: 'Stock' }).click();
    await expect(page).toHaveURL(/\/medicamentos\/dolor\/stock$/);
    await expect(page.getByRole('combobox', { name: 'Presentación' })).toBeVisible();
    await ramaDolor.getByRole('link', { name: 'Entregas' }).click();
    await expect(page).toHaveURL(/\/medicamentos\/dolor\/entregas$/);
    await expect(page.getByRole('heading', { name: 'Tratamiento del dolor · Entregas' })).toBeVisible();
    for (const nombre of ['Comprimidos', 'Inyectables', 'Gotas', 'Cremas', 'Otras/os', 'Jarabe', 'Concentrado', 'Doble concentrado', 'Amitriptilina']) {
      await expect(menu.getByRole('link', { name: nombre, exact: true })).toHaveCount(0);
    }
  });

  test('UI: filtro de Presentación dentro de Stock, sin bloquear el formulario de alta', async ({ page }) => {
    const sectores = [
      { ruta: '/medicamentos/stock', nuevo: 'Nuevo medicamento', valores: ['COMPRIMIDOS', 'INYECTABLES', 'GOTAS', 'CREMAS', 'OTRAS/OS'] },
      { ruta: '/medicamentos/dolor/stock', nuevo: 'Nuevo tratamiento', valores: ['JARABE', 'CONCENTRADO', 'DOBLE CONCENTRADO', 'AMITRIPTILINA'] },
    ];
    for (const sector of sectores) {
      await page.goto(sector.ruta);
      const filtro = page.getByRole('combobox', { name: 'Presentación' });
      await expect(filtro).toHaveValue('');
      await expect(filtro.locator('option').first()).toHaveText('Todas las presentaciones');
      expect(await filtro.locator('option').evaluateAll(xs => xs.slice(1).map(x => x.value))).toEqual(sector.valores);
      for (const valor of sector.valores) {
        await filtro.selectOption(valor);
        await expect(filtro).toHaveValue(valor);
        await expect(page).toHaveURL(new RegExp(`presentacion=${encodeURIComponent(valor)}`));
        await page.getByRole('button', { name: sector.nuevo }).click();
        const modal = page.getByRole('dialog', { name: sector.nuevo });
        const campo = modal.getByLabel('Presentación *');
        await expect(campo).toHaveValue(valor);
        await expect(campo).toBeEnabled();
        expect(await campo.locator('option').evaluateAll(xs => xs.map(x => x.value))).toEqual(sector.valores);
        await expect(modal.getByLabel(/Sector de Banco de Drogas/)).toHaveCount(0);
        await page.goto(sector.ruta);
      }
      await expect(page.getByRole('combobox', { name: 'Presentación' })).toHaveValue('');
    }
  });

  test('UI: enlaces antiguos de presentación redirigen al filtro del Stock correspondiente', async ({ page }) => {
    await page.goto('/medicamentos/stock/comprimidos');
    await expect(page).toHaveURL(/\/medicamentos\/stock\?presentacion=COMPRIMIDOS$/);
    await expect(page.getByRole('combobox', { name: 'Presentación' })).toHaveValue('COMPRIMIDOS');
    await page.goto('/medicamentos/dolor/stock/jarabe');
    await expect(page).toHaveURL(/\/medicamentos\/dolor\/stock\?presentacion=JARABE$/);
    await expect(page.getByRole('combobox', { name: 'Presentación' })).toHaveValue('JARABE');
  });

  test('UI: los stocks de Medicamentos y Dolor no mezclan registros, ni siquiera al buscar', async ({ page, request }) => {
    const comun = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'COMPRIMIDOS' }),
      first: entryFixture({ cantidad: 2 }),
    });
    const otroComun = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'INYECTABLES' }),
      first: entryFixture({ cantidad: 2 }),
    });
    const dolor = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'JARABE', dosis: '20', unidad_dosis: 'ML' }),
      first: entryFixture({ cantidad: 2 }),
    });
    await page.goto('/medicamentos/stock');
    const listadoMed = page.getByRole('table', { name: 'Stock de medicamentos' });
    await expect(listadoMed).toContainText(comun.medicine.nombre_comercial);
    await expect(listadoMed).toContainText(otroComun.medicine.nombre_comercial);
    const filtroMed = page.getByRole('combobox', { name: 'Presentación' });
    await filtroMed.selectOption('COMPRIMIDOS');
    await expect(listadoMed).toContainText(comun.medicine.nombre_comercial);
    await expect(listadoMed).not.toContainText(otroComun.medicine.nombre_comercial);
    await filtroMed.selectOption('INYECTABLES');
    await expect(listadoMed).not.toContainText(comun.medicine.nombre_comercial);
    await expect(listadoMed).toContainText(otroComun.medicine.nombre_comercial);
    await filtroMed.selectOption('');
    await expect(listadoMed).toContainText(comun.medicine.nombre_comercial);
    await expect(listadoMed).toContainText(otroComun.medicine.nombre_comercial);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(dolor.medicine.nombre_comercial);
    await expect(page.getByRole('table', { name: 'Stock de medicamentos' })).not.toContainText(dolor.medicine.nombre_comercial);
    await page.goto('/medicamentos/dolor/stock');
    const listadoDolor = page.getByRole('table', { name: 'Stock de tratamiento del dolor' });
    await expect(listadoDolor).toContainText(dolor.medicine.nombre_comercial);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(comun.medicine.nombre_comercial);
    await expect(listadoDolor).not.toContainText(comun.medicine.nombre_comercial);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill('');
    await page.getByRole('combobox', { name: 'Presentación' }).selectOption('JARABE');
    await expect(page.getByRole('table', { name: 'Stock de tratamiento del dolor' })).toContainText(dolor.medicine.nombre_comercial);
    await page.getByRole('combobox', { name: 'Presentación' }).selectOption('AMITRIPTILINA');
    await expect(page.getByRole('table', { name: 'Stock de tratamiento del dolor' })).not.toContainText(dolor.medicine.nombre_comercial);
  });

  test('UI: al restar stock de Dolor para una entrega exige receptor manual', async ({ page, request }) => {
    const dolor = await createMedicine(request, {
      medicine: medFixture({ presentacion:'JARABE', dosis:'5', unidad_dosis:'ML' }),
      first: entryFixture({ cantidad: 3 }),
    });
    await page.goto('/medicamentos/dolor/stock');
    const row = page.getByRole('table', { name:'Stock de tratamiento del dolor' })
      .getByRole('row').filter({ hasText:dolor.medicine.nombre_comercial });
    await row.getByRole('button', { name:'Editar' }).click();
    const modal = page.getByRole('dialog', { name:/Editar tratamiento/ });
    await modal.getByRole('tab', { name:'Stock' }).click();
    await modal.getByRole('button', { name:'Restar stock' }).click();
    const motivo = modal.getByLabel('Motivo de salida *');
    await expect(motivo).toHaveValue('ENTREGA_DONACION');
    const receptor = modal.getByLabel('Nombre y apellido de quien recibe *');
    await expect(receptor).toBeVisible();
    await expect(modal.getByRole('button', { name:'Registrar movimiento' })).toBeDisabled();
    await receptor.fill('PW E2E PERSONA QUE RETIRA');
    await modal.getByLabel('Cantidad *').fill('1');
    await expect(modal.getByRole('button', { name:'Registrar movimiento' })).toBeEnabled();
  });

  test('API: entregar Tratamiento del dolor descuenta stock, registra receptor y no crea préstamos', async ({ request }) => {
    const dolor = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }),
      first: entryFixture({ cantidad: 5 }),
    });
    const regular = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'COMPRIMIDOS' }),
      first: entryFixture({ cantidad: 3 }),
    });
    const receptor = `PW E2E RECEPTOR ${uniqueSuffix()}`;
    const payload = { id_medicamento: dolor.id, sector_destino: 'DOLOR', tipo: 'ENTREGA_DONACION',
      cantidad: 2, receptor, detalle: 'ENTREGA DE PRUEBA E2E' };
    const fueraSector = await apiResult(request, 'medicamentos_salida', {
      method: 'POST', data: { ...payload, id_medicamento: regular.id },
    });
    expect(fueraSector.ok).toBe(false);
    expect(String(fueraSector.body?.mensaje || '')).toMatch(/no corresponde/i);
    const withoutReceiver = await apiResult(request, 'medicamentos_salida', {
      method: 'POST', data: { ...payload, receptor: '' },
    });
    expect(withoutReceiver.ok).toBe(false);
    expect(String(withoutReceiver.body?.mensaje || '')).toMatch(/nombre y apellido/i);
    const delivery = await apiCall(request, 'medicamentos_salida', { method: 'POST', data: payload });
    expect(Number(delivery.id_movimiento)).toBeGreaterThan(0);
    expect(Number((await stockOf(request, dolor.id)).stock_actual)).toBe(3);
    const listado = await apiCall(request, 'medicamentos_entregas', { params: { buscar: receptor } });
    const row = listado.registros.find(r => Number(r.id_movimiento) === Number(delivery.id_movimiento));
    expect(row).toBeTruthy();
    expect(row.receptor).toBe(receptor);
    expect(row.presentacion).toBe('JARABE');
    expect(Number(row.cantidad)).toBe(2);
    const movimientos = await apiCall(request, 'medicamentos_historial', { params: { id_medicamento: dolor.id } });
    const asiento = movimientos.registros.find(r => Number(r.id_movimiento) === Number(delivery.id_movimiento));
    expect(asiento.procedencia).toBe(receptor);
    expect(asiento.id_ingreso_contable).toBeNull();
    expect(asiento.id_egreso_contable).toBeNull();
    const prestamoDolor = await apiResult(request, 'medicamentos_prestar', {
      method:'POST', data:{ nombre_receptor: receptor, apellido_receptor:'PRUEBA',
        items:[{ id_medicamento:dolor.id, cantidad:1 }], sena:0 },
    });
    expect(prestamoDolor.ok).toBe(false);
    expect(String(prestamoDolor.body?.mensaje || '')).toMatch(/Tratamiento del dolor/i);
    const fuera = await apiCall(request, 'medicamentos_entregas', { params: { buscar: regular.medicine.nombre_comercial } });
    expect(fuera.registros).toHaveLength(0);
  });

  test('UI: Entregas solo muestra tratamientos disponibles y no pide cobro ni socio', async ({ page, request }) => {
    const dolor = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'CONCENTRADO' }),
      first: entryFixture({ cantidad: 3 }),
    });
    const regular = await createMedicine(request, {
      medicine: medFixture({ presentacion: 'COMPRIMIDOS' }),
      first: entryFixture({ cantidad: 3 }),
    });
    await page.goto('/medicamentos/dolor/entregas');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    const modal = page.getByRole('dialog', { name: 'Registrar entrega · Tratamiento del dolor' });
    const opciones = modal.getByLabel('Tratamiento a entregar *').locator('option');
    await expect(opciones.filter({ hasText: dolor.medicine.nombre_comercial })).toHaveCount(1);
    await expect(opciones.filter({ hasText: regular.medicine.nombre_comercial })).toHaveCount(0);
    await expect(modal.getByLabel(/socio/i)).toHaveCount(0);
    await expect(modal.getByLabel(/medio de pago/i)).toHaveCount(0);
    await modal.getByLabel('Tratamiento a entregar *').selectOption(String(dolor.id));
    await modal.getByLabel('Nombre y apellido de quien recibe *').fill(`PW E2E DESTINATARIO ${uniqueSuffix()}`);
    await modal.getByLabel('Cantidad *').fill('1');
    await modal.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(page.getByRole('table', { name:'Entregas de Tratamiento del dolor' })).toContainText(dolor.medicine.nombre_comercial);
  });
});
