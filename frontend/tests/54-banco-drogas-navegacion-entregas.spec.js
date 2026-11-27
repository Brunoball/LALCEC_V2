const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, medFixture, entryFixture, stockOf, movementsOf, assertError, loanPeople, futureIso } = require('./helpers/medicamentos.helper');

const { uniqueSuffix, todayIso } = require('./helpers/data.helper');

async function sinDinero(request, buscar) {
  const [anio, mes] = todayIso().split('-').map(Number);
  for (const accion of ['contable_ingresos_listar','contable_egresos_listar']) {
    const datos = await apiCall(request, accion, { params:{ anio, mes, buscar } });
    expect(datos.items).toHaveLength(0);
  }
}

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

  test('UI: Restar stock de Dolor no ofrece entregas: se registran desde Entregas', async ({ page, request }) => {
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
    await expect(modal.getByText('Las entregas sin cargo se registran en Tratamiento del dolor → Entregas.')).toBeVisible();
    await expect(modal.getByLabel('Nombre y apellido de quien recibe *')).toHaveCount(0);
  });

  test('API: entrega gratuita de varios tratamientos, idempotencia, sin préstamos ni dinero', async ({ request }) => {
    const jarabe = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 5 }) });
    const concentrado = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO' }), first: entryFixture({ cantidad: 6 }) });
    const regular = await createMedicine(request, { medicine: medFixture({ presentacion: 'COMPRIMIDOS' }), first: entryFixture({ cantidad: 3 }) });
    const people = loanPeople();
    const base = { ...people, items: [{ id_medicamento: jarabe.id, cantidad: 2 }, { id_medicamento: concentrado.id, cantidad: 3 }] };
    const stocks = async () => Promise.all([jarabe, concentrado, regular].map(async fx => Number((await stockOf(request, fx.id)).stock_actual)));
    await assertError(request, 'medicamentos_entregar', { ...base, items: [...base.items, { id_medicamento: regular.id, cantidad: 1 }] }, /no corresponde a Tratamiento del dolor/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: jarabe.id, cantidad: 6 }] }, /stock insuficiente/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [base.items[0], base.items[0]] }, /no repitas/i);
    await assertError(request, 'medicamentos_entregar', { ...base, importe: '100' }, /gratuitas/i);
    await assertError(request, 'medicamentos_entregar', { ...base, id_medio_pago: 1 }, /gratuitas/i);
    await assertError(request, 'medicamentos_entregar', { ...base, paciente_dni: '' }, /DNI del paciente/i);
    await assertError(request, 'medicamentos_entregar', { ...base, celular_receptor: '' }, /celular/i);
    expect(await stocks()).toEqual([5,6,3]);
    const key = `med-PWE2E-${uniqueSuffix()}-entrega-dolor-multiple`;
    const data = { ...base, _idempotency_key: key };
    const entrega = await apiCall(request, 'medicamentos_entregar', { method:'POST', data });
    expect(await apiCall(request, 'medicamentos_entregar', { method:'POST', data })).toEqual(entrega);
    expect(entrega.revision).toBe(1);
    expect(entrega.id_ingreso_contable).toBeNull();
    expect(entrega.id_movimientos).toHaveLength(2);
    expect(await stocks()).toEqual([3,3,3]);
    const movimientos = (await Promise.all([jarabe, concentrado].map(fx => movementsOf(request, fx.id))))
      .flat().filter(m => entrega.id_movimientos.map(Number).includes(Number(m.id_movimiento)));
    expect(movimientos).toHaveLength(2);
    for (const m of movimientos) {
      expect(m.tipo).toBe('ENTREGA_DONACION');
      expect(m.origen).toBe('ENTREGA SIN CARGO');
      expect(m.id_ingreso_contable).toBeNull(); expect(m.id_egreso_contable).toBeNull();
      expect(m.motivo_no_anulable).toBeTruthy();
    }
    const listado = await apiCall(request, 'medicamentos_entregas', { params: { buscar: people.nombre_receptor } });
    expect(listado.registros).toHaveLength(1);
    const fila = listado.registros[0];
    expect(fila.tipo_registro).toBe('GRATUITA');
    expect(Number(fila.importe)).toBe(0); expect(fila.medio_pago).toBeNull();
    expect(fila.receptor).toBe(`${people.nombre_receptor} ${people.apellido_receptor}`);
    expect(fila.paciente_dni).toBe(people.paciente_dni);
    expect(fila.items.map(i => [Number(i.id_medicamento),Number(i.cantidad)])).toEqual([[jarabe.id,2],[concentrado.id,3]]);
    await sinDinero(request, people.nombre_receptor);
    await assertError(request, 'medicamentos_salida', { id_medicamento: concentrado.id, sector_destino: 'DOLOR', tipo: 'ENTREGA_DONACION', cantidad: 1, receptor: 'PW E2E RECEPTOR' }, /se registran/i);
    await assertError(request, 'medicamentos_prestar', { ...people, items: [{ id_medicamento: jarabe.id, cantidad: 1 }], sena: '0' }, /Tratamiento del dolor/i);
    const fuera = await apiCall(request, 'medicamentos_entregas', { params: { buscar: regular.medicine.nombre_comercial } });
    expect(fuera.registros).toHaveLength(0);
  });

  test('API: corrección de cantidades y tratamientos, historial compensatorio sin dinero', async ({ request }) => {
    const uno = await createMedicine(request,{medicine:medFixture({presentacion:'JARABE'}),first:entryFixture({cantidad:5})});
    const dos = await createMedicine(request,{medicine:medFixture({presentacion:'CONCENTRADO'}),first:entryFixture({cantidad:4})});
    const tres = await createMedicine(request,{medicine:medFixture({presentacion:'AMITRIPTILINA'}),first:entryFixture({cantidad:6})});
    const people = loanPeople();
    const alta = await apiCall(request,'medicamentos_entregar',{method:'POST',data:{...people,items:[{id_medicamento:uno.id,cantidad:3},{id_medicamento:dos.id,cantidad:2}]}});
    const correccion = {...people,id_entrega:alta.id_entrega,revision:alta.revision,motivo_correccion:'PW E2E ERROR DE CARGA',stock_confirmado:true,
      items:[{id_medicamento:uno.id,cantidad:2},{id_medicamento:tres.id,cantidad:4}]};
    const stocks = async () => Promise.all([uno,dos,tres].map(async fx => Number((await stockOf(request,fx.id)).stock_actual)));
    await assertError(request,'medicamentos_entregar',{...correccion,stock_confirmado:false},/Confirmá/i);
    await assertError(request,'medicamentos_entregar',{...correccion,motivo_correccion:''},/motivo/i);
    await assertError(request,'medicamentos_entregar',{...correccion,items:[...correccion.items,{id_medicamento:dos.id,cantidad:9}]},/Stock insuficiente/i);
    expect(await stocks()).toEqual([2,2,6]);
    const key=`med-PWE2E-${uniqueSuffix()}-correccion-dolor`;
    const data={...correccion,_idempotency_key:key};
    const corregida=await apiCall(request,'medicamentos_entregar',{method:'POST',data});
    expect(corregida.id_entrega).toBe(alta.id_entrega); expect(corregida.revision).toBe(2);
    expect(await apiCall(request,'medicamentos_entregar',{method:'POST',data})).toEqual(corregida);
    expect(await stocks()).toEqual([3,4,2]);
    expect((await apiCall(request,'medicamentos_entregas',{params:{buscar:dos.medicine.nombre_comercial}})).registros).toHaveLength(0);
    const fila=(await apiCall(request,'medicamentos_entregas',{params:{buscar:people.nombre_receptor}})).registros;
    expect(fila).toHaveLength(1); expect(Number(fila[0].cantidad)).toBe(6);
    expect(fila[0].items.map(i=>[Number(i.id_medicamento),Number(i.cantidad)])).toEqual([[uno.id,2],[tres.id,4]]);
    const cambios=(await Promise.all([uno,dos,tres].map(fx=>movementsOf(request,fx.id)))).flat().filter(m=>corregida.id_movimientos.map(Number).includes(Number(m.id_movimiento)));
    expect(cambios.map(m=>Number(m.variacion_disponible)).sort((a,b)=>a-b)).toEqual([-4,1,2]);
    expect(cambios.every(m=>m.origen==='CORRECCION ENTREGA' && m.id_ingreso_contable===null && m.id_egreso_contable===null)).toBe(true);
    const antigua=await assertError(request,'medicamentos_entregar',correccion,/La entrega cambió/i);
    expect(antigua.status).toBe(409);
    await sinDinero(request,people.nombre_receptor);
  });

  test('API: edición de datos sin tocar stock y rechazo de revisiones simultáneas', async ({ request }) => {
    const fx=await createMedicine(request,{medicine:medFixture({presentacion:'JARABE'}),first:entryFixture({cantidad:2})});
    const people=loanPeople(); const base={...people,items:[{id_medicamento:fx.id,cantidad:2}]};
    const alta=await apiCall(request,'medicamentos_entregar',{method:'POST',data:base});
    const corregir={...base,id_entrega:alta.id_entrega,revision:1,motivo_correccion:'PW E2E CORRECCION DE DATOS',observaciones:'PW E2E NOTA CORREGIDA'};
    const results=await Promise.all([apiResult(request,'medicamentos_entregar',{method:'POST',data:corregir}),apiResult(request,'medicamentos_entregar',{method:'POST',data:{...corregir,observaciones:'PW E2E OTRA NOTA'}})]);
    expect(results.filter(r=>r.ok)).toHaveLength(1); expect(results.filter(r=>r.status===409)).toHaveLength(1);
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(0);
    const fila=(await apiCall(request,'medicamentos_entregas',{params:{buscar:people.nombre_receptor}})).registros[0];
    expect(Number(fila.revision)).toBe(2); expect(fila.items).toHaveLength(1);
    expect((await movementsOf(request,fx.id)).filter(m=>Number(m.id_entrega)===Number(alta.id_entrega))).toHaveLength(1);
    await sinDinero(request,people.nombre_receptor);
  });

  test('API: el escudo E2E bloquea correcciones de una entrega no identificada como prueba', async ({ request }) => {
    const fx=await createMedicine(request,{medicine:medFixture({presentacion:'JARABE'}),first:entryFixture({cantidad:3})});
    const datos=await apiCall(request,'medicamentos_entregas');
    const real=datos.registros.find(r=>r.id_entrega && !/^PW (E2E|EE) /i.test(String(r.nombre_receptor||'')));
    // Un identificador inexistente también debe fallar cerrado; no se crea ningún registro.
    const id=real ? Number(real.id_entrega) : 4294967295;
    const resultado=await apiResult(request,'medicamentos_entregar',{method:'POST',data:{...loanPeople(),id_entrega:id,revision:Number(real?.revision||1),motivo_correccion:'',items:[{id_medicamento:fx.id,cantidad:1}]}});
    expect(resultado.status).toBe(409); expect(resultado.body.codigo).toBe('E2E_SCOPE_BLOCKED');
    expect(Number((await stockOf(request,fx.id)).stock_actual)).toBe(3);
  });

  test('API: entrega de Dolor rechaza tratamientos vencidos o sin fecha y no descuenta nada', async ({ request }) => {
    const vigente = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 4 }) });
    const vencido = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO', fecha_vencimiento: futureIso(-2) }), first: entryFixture({ cantidad: 2, fecha_vencimiento: futureIso(-2) }) });
    // Sin fecha: alta sin stock inicial (el backend exige vencimiento si hay stock).
    const sinFechaDatos = medFixture({ presentacion: 'AMITRIPTILINA', fecha_vencimiento: '' });
    const sinFecha = { id: Number((await apiCall(request, 'medicamentos_guardar', { method: 'POST', data: sinFechaDatos })).id_medicamento) };
    const base = { ...loanPeople() };
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: vigente.id, cantidad: 1 }, { id_medicamento: sinFecha.id, cantidad: 1 }] }, /fecha de vencimiento/i);
    await assertError(request, 'medicamentos_entregar', { ...base, items: [{ id_medicamento: vigente.id, cantidad: 1 }, { id_medicamento: vencido.id, cantidad: 1 }] }, /venció/i);
    expect(Number((await stockOf(request, vigente.id)).stock_actual)).toBe(4);
    expect(Number((await stockOf(request, vencido.id)).stock_actual)).toBe(2);
  });

  test('UI: Entregas gratuitas con dos pestañas, varios tratamientos y edición', async ({ page, request }) => {
    const uno = await createMedicine(request, { medicine: medFixture({ presentacion: 'CONCENTRADO' }), first: entryFixture({ cantidad: 3 }) });
    const dos = await createMedicine(request, { medicine: medFixture({ presentacion: 'JARABE', unidad_dosis: 'ML' }), first: entryFixture({ cantidad: 4 }) });
    const regular = await createMedicine(request, { medicine: medFixture({ presentacion: 'COMPRIMIDOS' }), first: entryFixture({ cantidad: 3 }) });
    const people = loanPeople();
    await page.goto('/medicamentos/dolor/entregas');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    const modal = page.getByRole('dialog', { name: /Registrar entrega · Tratamiento del dolor/ });
    await expect(modal.getByRole('tab')).toHaveCount(2);
    await expect(modal.getByRole('tab', { name: 'Personas' })).toBeVisible();
    await expect(modal.getByLabel(/socio/i)).toHaveCount(0);
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    await expect(modal.getByLabel(/Medio de pago|Importe total/)).toHaveCount(0);
    await modal.getByLabel(/Nombre y apellido del paciente/).fill(people.paciente_nombre);
    await modal.getByLabel(/DNI del paciente/).fill(people.paciente_dni);
    await modal.getByLabel(/Nombre de quien retira/).fill(people.nombre_receptor);
    await modal.getByLabel(/Apellido de quien retira/).fill(people.apellido_receptor);
    await modal.getByLabel(/DNI de quien retira/).fill(people.dni_receptor);
    await modal.getByLabel(/Celular de contacto/).fill(people.celular_receptor);
    await modal.getByRole('tab', { name: 'Tratamientos' }).click();
    const primero = modal.getByLabel('Tratamiento 1 *');
    await expect(primero.locator('option').filter({ hasText: uno.medicine.nombre_comercial })).toHaveCount(1);
    await expect(primero.locator('option').filter({ hasText: regular.medicine.nombre_comercial })).toHaveCount(0);
    const confirmar = modal.getByRole('button', { name: 'Confirmar entrega' });
    const [anio, mes] = todayIso().split('-').map(Number);
    // El formulario valida al confirmar, con un Toast renderizado fuera del diálogo.
    // Cada intento inválido debe conservar el formulario, el stock y la contabilidad.
    const verificarRechazo = async mensaje => {
      await expect(confirmar).toBeEnabled();
      await confirmar.click();
      const aviso = page.getByRole('status').filter({ hasText: mensaje });
      await expect(aviso.getByText(mensaje, { exact: true })).toBeVisible();
      await expect(modal).toBeVisible();
      await expect(confirmar).toBeEnabled();
      expect(Number((await stockOf(request, uno.id)).stock_actual)).toBe(3);
      expect(Number((await stockOf(request, dos.id)).stock_actual)).toBe(4);
      const entregas = await apiCall(request, 'medicamentos_entregas', {
        params: { buscar: people.nombre_receptor },
      });
      expect(entregas.registros).toHaveLength(0);
      const ingresos = await apiCall(request, 'contable_ingresos_listar', {
        params: { anio, mes, buscar: people.nombre_receptor },
      });
      expect(ingresos.items).toHaveLength(0);
      await aviso.getByRole('button', { name: 'Cerrar notificación' }).click();
      await expect(aviso).not.toBeVisible();
    };
    await primero.selectOption(String(uno.id));
    await modal.getByLabel('Cantidad *').first().fill('9');
    await verificarRechazo('La cantidad supera el stock disponible.');
    await modal.getByLabel('Cantidad *').first().fill('2');
    await modal.getByRole('button', { name: 'Agregar otro tratamiento' }).click();
    await modal.getByLabel('Tratamiento 2 *').selectOption(String(uno.id));
    await modal.getByLabel('Cantidad *').nth(1).fill('1');
    await verificarRechazo('No repitas el mismo tratamiento en la entrega.');
    await modal.getByLabel('Tratamiento 2 *').selectOption(String(dos.id));
    await confirmar.click();
    await expect(modal).not.toBeVisible();
    expect(Number((await stockOf(request, uno.id)).stock_actual)).toBe(1);
    expect(Number((await stockOf(request, dos.id)).stock_actual)).toBe(3);
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(people.nombre_receptor);
    const fila = page.getByRole('table', { name: 'Entregas de Tratamiento del dolor' }).getByRole('row').filter({ hasText: people.nombre_receptor });
    await expect(fila).toContainText(uno.medicine.nombre_comercial);
    await expect(fila).toContainText(dos.medicine.nombre_comercial);
    await expect(fila).toContainText('Sin cargo');
    await expect(fila).toContainText(people.paciente_nombre);
    await fila.getByRole('button',{name:'Editar entrega'}).click();
    const editor=page.getByRole('dialog',{name:/Editar entrega · Tratamiento del dolor/});
    await expect(editor.getByLabel(/DNI del paciente/)).toHaveValue(people.paciente_dni);
    await editor.getByRole('tab',{name:'Tratamientos'}).click();
    await expect(editor.getByLabel('Cantidad *').first()).toHaveValue('2');
    await editor.getByLabel('Cantidad *').first().fill('1');
    await editor.getByLabel(/Motivo de corrección/).fill('PW E2E CANTIDAD CORREGIDA');
    await editor.getByRole('checkbox',{name:/Confirmo que las unidades/}).check();
    await editor.getByRole('button',{name:'Guardar corrección'}).click();
    await expect(editor).not.toBeVisible();
    expect(Number((await stockOf(request,uno.id)).stock_actual)).toBe(2);
    expect(Number((await stockOf(request,dos.id)).stock_actual)).toBe(3);
    await expect(fila).toContainText('Sin cargo');
    await sinDinero(request,people.nombre_receptor);
  });
});
