const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, medFixture, entryFixture, stockOf, movementsOf, assertError, requireAccountingOptions, loanPeople, futureIso } = require('./helpers/medicamentos.helper');

/** Medios reales de la base para entregas de Dolor: EFECTIVO y TRANSFERENCIA. */
async function mediosEntrega(request) {
  const medios = (await apiCall(request, 'medicamentos_medios')).registros || [];
  const id = nombre => Number(medios.find(m => String(m.nombre).trim().toUpperCase() === nombre)?.id_medio_pago || 0);
  const efectivo = id('EFECTIVO'); const transferencia = id('TRANSFERENCIA');
  expect(efectivo, 'Debe existir EFECTIVO activo').toBeGreaterThan(0);
  expect(transferencia, 'Debe existir TRANSFERENCIA activo: ejecutá el SQL de Entregas').toBeGreaterThan(0);
  return { efectivo, transferencia };
}
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
        await expect.poll(() => new URL(page.url()).searchParams.get('presentacion')).toBe(valor);
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
    // Plantillas declaradas en App.js; se recorren con un valor real de presentación.
    for (const [ruta, valor, destino] of [
      ['/medicamentos/stock/:presentacion', 'comprimidos', /\/medicamentos\/stock\?presentacion=COMPRIMIDOS$/],
      ['/medicamentos/dolor/stock/:presentacion', 'jarabe', /\/medicamentos\/dolor\/stock\?presentacion=JARABE$/],
    ]) {
      await page.goto(ruta.replace(':presentacion', valor));
      await expect(page).toHaveURL(destino);
      await expect(page.getByRole('combobox', { name: 'Presentación' })).toHaveValue(valor.toUpperCase());
    }
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
    const busqueda = page.getByRole('textbox', { name: 'Búsqueda' });
    const filtroMed = page.getByRole('combobox', { name: 'Presentación' });
    // El listado está paginado y la suite crea muchos medicamentos E2E: cada
    // verificación busca su registro para no depender de la primera página.
    const verificar = async (presentacion, visibles, ocultos) => {
      await filtroMed.selectOption(presentacion);
      for (const fx of visibles) {
        await busqueda.fill(fx.medicine.nombre_comercial);
        await expect(listadoMed).toContainText(fx.medicine.nombre_comercial);
      }
      for (const fx of ocultos) {
        await busqueda.fill(fx.medicine.nombre_comercial);
        await expect(listadoMed).not.toContainText(fx.medicine.nombre_comercial);
      }
    };
    await verificar('', [comun, otroComun], []);
    await verificar('COMPRIMIDOS', [comun], [otroComun]);
    await verificar('INYECTABLES', [otroComun], [comun]);
    await verificar('', [comun, otroComun], []);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(dolor.medicine.nombre_comercial);
    await expect(page.getByRole('table', { name: 'Stock de medicamentos' })).not.toContainText(dolor.medicine.nombre_comercial);
    await page.goto('/medicamentos/dolor/stock');
    const listadoDolor = page.getByRole('table', { name: 'Stock de tratamiento del dolor' });
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(dolor.medicine.nombre_comercial);
    await expect(listadoDolor).toContainText(dolor.medicine.nombre_comercial);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(comun.medicine.nombre_comercial);
    await expect(listadoDolor).not.toContainText(comun.medicine.nombre_comercial);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(dolor.medicine.nombre_comercial);
    await page.getByRole('combobox', { name: 'Presentación' }).selectOption('JARABE');
    await expect(page.getByRole('table', { name: 'Stock de tratamiento del dolor' })).toContainText(dolor.medicine.nombre_comercial);
    await page.getByRole('combobox', { name: 'Presentación' }).selectOption('AMITRIPTILINA');
    await expect(page.getByRole('table', { name: 'Stock de tratamiento del dolor' })).not.toContainText(dolor.medicine.nombre_comercial);
  });

  test('UI: Restar stock de Dolor no ofrece entregas: se cobran desde Entregas', async ({ page, request }) => {
    const dolor = await createMedicine(request, {
      medicine: medFixture({ presentacion:'JARABE', dosis:'5', unidad_dosis:'ML' }),
      first: entryFixture({ cantidad: 3 }),
    });
    await page.goto('/medicamentos/dolor/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(dolor.medicine.nombre_comercial);
    const row = page.getByRole('table', { name:'Stock de tratamiento del dolor' })
      .getByRole('row').filter({ hasText:dolor.medicine.nombre_comercial });
    await row.getByRole('button', { name:'Editar' }).click();
    const modal = page.getByRole('dialog', { name:/Editar tratamiento/ });
    await modal.getByRole('tab', { name:'Stock' }).click();
    await modal.getByRole('button', { name:'Restar stock' }).click();
    const motivo = modal.getByLabel('Motivo de salida *');
    await expect(motivo.locator('option[value="ENTREGA_DONACION"]')).toHaveCount(0);
    await expect(motivo.locator('option[value="SALIDA_VENTA"]')).toHaveCount(0);
    await expect(motivo).toHaveValue('AJUSTE_SALIDA');
    await expect(modal.getByText('Las entregas se cobran y se registran en Tratamiento del dolor → Entregas.')).toBeVisible();
    await expect(modal.getByLabel('Nombre y apellido de quien recibe *')).toHaveCount(0);
  });

  test('API: entrega cobrada de Dolor con varios tratamientos, un solo cobro y sin préstamos', async ({ request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['ENTREGAS TRATAMIENTO DEL DOLOR'], CONCEPTO_INGRESO: ['COBRO DE ENTREGA'],
    });
    const { efectivo, transferencia } = await mediosEntrega(request);
    const jarabe = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 5 }) });
    const concentrado = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO' }), first: entryFixture({ cantidad: 6 }) });
    const amitriptilina = await createMedicine(request, { medicine: medFixture({ presentacion: 'AMITRIPTILINA' }), first: entryFixture({ cantidad: 2 }) });
    const regular = await createMedicine(request, { medicine: medFixture({ presentacion: 'COMPRIMIDOS' }), first: entryFixture({ cantidad: 3 }) });
    const people = loanPeople();
    const base = { ...people, importe: '1500.50', id_medio_pago: efectivo,
      items: [{ id_medicamento: jarabe.id, cantidad: 2 }, { id_medicamento: concentrado.id, cantidad: 3 }, { id_medicamento: amitriptilina.id, cantidad: 1 }] };
    const stocks = async () => Promise.all([jarabe, concentrado, amitriptilina, regular].map(async fx => Number((await stockOf(request, fx.id)).stock_actual)));
    const before = await stocks();

    // Validaciones: ninguna deja rastros (rollback completo).
    await assertError(request, 'medicamentos_entregar', { ...base, items: [...base.items, { id_medicamento: regular.id, cantidad: 1 }] }, /no corresponde a Tratamiento del dolor/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: jarabe.id, cantidad: 6 }] }, /stock insuficiente/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: jarabe.id, cantidad: 1 }, { id_medicamento: jarabe.id, cantidad: 1 }] }, /no repitas/i);
    await assertError(request, 'medicamentos_entregar', { ...base, importe: '0' }, /importe/i);
    await assertError(request, 'medicamentos_entregar', { ...base, importe: '' }, /importe/i);
    await assertError(request, 'medicamentos_entregar', { ...base, paciente_dni: '' }, /DNI del paciente/i);
    await assertError(request, 'medicamentos_entregar', { ...base, celular_receptor: '' }, /celular/i);
    const otroMedio = (await apiCall(request, 'medicamentos_medios')).registros
      .find(m => !['EFECTIVO', 'TRANSFERENCIA'].includes(String(m.nombre).trim().toUpperCase()));
    if (otroMedio) await assertError(request, 'medicamentos_entregar', { ...base, id_medio_pago: Number(otroMedio.id_medio_pago) }, /EFECTIVO o TRANSFERENCIA/i);
    expect(await stocks()).toEqual(before);

    // Varios tratamientos juntos, en efectivo; el reintento con la misma clave no duplica.
    const key = `med-PWE2E-${uniqueSuffix()}-entrega-dolor-multiple`;
    const entrega = await apiCall(request, 'medicamentos_entregar', { method: 'POST', data: { ...base, _idempotency_key: key } });
    const retry = await apiCall(request, 'medicamentos_entregar', { method: 'POST', data: { ...base, _idempotency_key: key } });
    expect(retry.id_entrega).toBe(entrega.id_entrega);
    expect(entrega.id_movimientos).toHaveLength(3);
    expect(await stocks()).toEqual([before[0] - 2, before[1] - 3, before[2] - 1, before[3]]);

    // Un solo ingreso contable por el total, no uno por tratamiento.
    const movimientos = (await Promise.all([jarabe, concentrado, amitriptilina].map(fx => movementsOf(request, fx.id))))
      .flat().filter(m => entrega.id_movimientos.map(Number).includes(Number(m.id_movimiento)));
    expect(movimientos).toHaveLength(3);
    for (const m of movimientos) {
      expect(m.tipo).toBe('SALIDA_VENTA');
      expect(m.origen).toBe('ENTREGA COBRADA');
      expect(m.id_ingreso_contable).toBeNull();
      expect(m.motivo_no_anulable).toMatch(/entrega cobrada/i);
    }
    const anular = await apiResult(request, 'medicamentos_anular', { method: 'POST', data: {
      id_movimiento: entrega.id_movimientos[0], motivo: 'PW E2E INTENTO DE ANULAR UN RENGLON', devolucion_confirmada: 1, id_medio_pago: efectivo } });
    expect(anular.ok).toBe(false);
    expect(Number((await stockOf(request, jarabe.id)).stock_actual)).toBe(before[0] - 2);

    // Historial: una fila con los tres tratamientos, importe y medio.
    const listado = await apiCall(request, 'medicamentos_entregas', { params: { buscar: people.nombre_receptor } });
    const fila = listado.registros.find(r => r.tipo_registro === 'COBRADA' && Number(r.id_entrega) === Number(entrega.id_entrega));
    expect(fila).toBeTruthy();
    expect(fila.receptor).toBe(`${people.nombre_receptor} ${people.apellido_receptor}`);
    expect(fila.paciente_nombre).toBe(people.paciente_nombre);
    expect(Number(fila.importe)).toBe(1500.5);
    expect(String(fila.medio_pago).toUpperCase()).toBe('EFECTIVO');
    expect(fila.items.map(i => [i.nombre_comercial, Number(i.cantidad)])).toEqual([
      [jarabe.medicine.nombre_comercial, 2], [concentrado.medicine.nombre_comercial, 3], [amitriptilina.medicine.nombre_comercial, 1]]);
    const porTratamiento = await apiCall(request, 'medicamentos_entregas', { params: { buscar: concentrado.medicine.nombre_comercial } });
    expect(porTratamiento.registros.some(r => Number(r.id_entrega) === Number(entrega.id_entrega))).toBe(true);
    const hoy = new Date();
    const contable = await apiCall(request, 'contable_ingresos_listar', {
      params: { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1, buscar: people.nombre_receptor },
    });
    const asientos = (contable.items || []).filter(r => Number(r.id_ingreso) === Number(entrega.id_ingreso_contable));
    expect(asientos).toHaveLength(1);
    expect(Number(asientos[0].importe)).toBe(1500.5);
    // Ningún otro ingreso por la misma persona: el total no se repite por tratamiento.
    expect((contable.items || []).filter(r => Number(r.importe) === 1500.5)).toHaveLength(1);

    // Un tratamiento, por transferencia.
    const unico = await apiCall(request, 'medicamentos_entregar', { method: 'POST', data: {
      ...loanPeople(), importe: '300', id_medio_pago: transferencia, items: [{ id_medicamento: jarabe.id, cantidad: 1 }] } });
    const filaUnica = (await apiCall(request, 'medicamentos_entregas', { params: { buscar: jarabe.medicine.nombre_comercial } }))
      .registros.find(r => Number(r.id_entrega) === Number(unico.id_entrega));
    expect(String(filaUnica.medio_pago).toUpperCase()).toBe('TRANSFERENCIA');
    expect(Number((await stockOf(request, jarabe.id)).stock_actual)).toBe(before[0] - 3);

    // Las entregas sin cargo de Dolor ya no se registran desde Restar stock.
    await assertError(request, 'medicamentos_salida', { id_medicamento: concentrado.id, sector_destino: 'DOLOR', tipo: 'ENTREGA_DONACION', cantidad: 1, receptor: 'PW E2E RECEPTOR' }, /se cobran/i);
    // Separación de sectores: Dolor no admite préstamos y Medicamentos no aparece en Entregas.
    const prestamoDolor = await apiResult(request, 'medicamentos_prestar', { method: 'POST', data: {
      ...loanPeople(), items: [{ id_medicamento: jarabe.id, cantidad: 1 }], sena: '0' } });
    expect(prestamoDolor.ok).toBe(false);
    expect(String(prestamoDolor.body?.mensaje || '')).toMatch(/Tratamiento del dolor/i);
    const fuera = await apiCall(request, 'medicamentos_entregas', { params: { buscar: regular.medicine.nombre_comercial } });
    expect(fuera.registros).toHaveLength(0);
  });

  test('API: entrega de Dolor rechaza tratamientos vencidos o sin fecha y no descuenta nada', async ({ request }) => {
    const { efectivo } = await mediosEntrega(request);
    const vigente = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 4 }) });
    const vencido = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO', fecha_vencimiento: futureIso(-2) }), first: entryFixture({ cantidad: 2, fecha_vencimiento: futureIso(-2) }) });
    // Sin fecha: alta sin stock inicial (el backend exige vencimiento si hay stock).
    const sinFechaDatos = medFixture({ presentacion: 'AMITRIPTILINA', fecha_vencimiento: '' });
    const sinFecha = { id: Number((await apiCall(request, 'medicamentos_guardar', { method: 'POST', data: sinFechaDatos })).id_medicamento) };
    const base = { ...loanPeople(), importe: '100', id_medio_pago: efectivo };
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: vigente.id, cantidad: 1 }, { id_medicamento: sinFecha.id, cantidad: 1 }] }, /fecha de vencimiento/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: vigente.id, cantidad: 1 }, { id_medicamento: vencido.id, cantidad: 1 }] }, /venció/i);
    expect(Number((await stockOf(request, vigente.id)).stock_actual)).toBe(4);
    expect(Number((await stockOf(request, vencido.id)).stock_actual)).toBe(2);
  });

  test('UI: Entregas con dos pestañas, varios tratamientos y cobro en efectivo o transferencia', async ({ page, request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['ENTREGAS TRATAMIENTO DEL DOLOR'], CONCEPTO_INGRESO: ['COBRO DE ENTREGA'],
    });
    const uno = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO' }), first: entryFixture({ cantidad: 3 }) });
    const dos = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 4 }) });
    const regular = await createMedicine(request, { medicine: medFixture({ presentacion: 'COMPRIMIDOS' }), first: entryFixture({ cantidad: 3 }) });
    const people = loanPeople();
    await page.goto('/medicamentos/dolor/entregas');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    const modal = page.getByRole('dialog', { name: /Registrar entrega · Tratamiento del dolor/ });
    await expect(modal.getByRole('tab')).toHaveCount(2);
    await expect(modal.getByRole('tab', { name: 'Personas y pago' })).toBeVisible();
    await expect(modal.getByLabel(/socio/i)).toHaveCount(0);
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    const medio = modal.getByLabel('Medio de pago *');
    // Solo los dos medios pedidos en Trello, tomados de la base.
    await expect(medio.locator('option:not([value=""])')).toHaveCount(2);
    expect((await medio.locator('option:not([value=""])').evaluateAll(xs => xs.map(x => x.textContent.trim()))).sort()).toEqual(['EFECTIVO', 'TRANSFERENCIA']);
    await modal.getByLabel(/Nombre y apellido del paciente/).fill(people.paciente_nombre);
    await modal.getByLabel(/DNI del paciente/).fill(people.paciente_dni);
    await modal.getByLabel(/Nombre de quien retira/).fill(people.nombre_receptor);
    await modal.getByLabel(/Apellido de quien retira/).fill(people.apellido_receptor);
    await modal.getByLabel(/DNI de quien retira/).fill(people.dni_receptor);
    await modal.getByLabel(/Celular de contacto/).fill(people.celular_receptor);
    await modal.getByLabel(/Importe total/).fill('850');
    const transferencia = await medio.locator('option', { hasText: 'TRANSFERENCIA' }).getAttribute('value');
    await medio.selectOption(transferencia);
    await modal.getByRole('tab', { name: 'Tratamientos' }).click();
    const primero = modal.getByLabel('Tratamiento 1 *');
    await expect(primero.locator('option').filter({ hasText: uno.medicine.nombre_comercial })).toHaveCount(1);
    await expect(primero.locator('option').filter({ hasText: regular.medicine.nombre_comercial })).toHaveCount(0);
    await primero.selectOption(String(uno.id));
    await modal.getByLabel('Cantidad *').first().fill('9');
    await expect(modal.getByText('La cantidad supera el stock disponible.')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Confirmar entrega' })).toBeDisabled();
    await modal.getByLabel('Cantidad *').first().fill('2');
    await modal.getByRole('button', { name: 'Agregar otro tratamiento' }).click();
    await modal.getByLabel('Tratamiento 2 *').selectOption(String(uno.id));
    await expect(modal.getByText('No repitas el mismo tratamiento en la entrega.')).toBeVisible();
    await modal.getByLabel('Tratamiento 2 *').selectOption(String(dos.id));
    await modal.getByLabel('Cantidad *').nth(1).fill('1');
    await modal.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(modal).not.toBeVisible();
    expect(Number((await stockOf(request, uno.id)).stock_actual)).toBe(1);
    expect(Number((await stockOf(request, dos.id)).stock_actual)).toBe(3);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(people.nombre_receptor);
    const fila = page.getByRole('table', { name: 'Entregas de Tratamiento del dolor' }).getByRole('row').filter({ hasText: people.nombre_receptor });
    await expect(fila).toContainText(uno.medicine.nombre_comercial);
    await expect(fila).toContainText(dos.medicine.nombre_comercial);
    await expect(fila).toContainText('TRANSFERENCIA');
    await expect(fila).toContainText(people.paciente_nombre);
  });
});
