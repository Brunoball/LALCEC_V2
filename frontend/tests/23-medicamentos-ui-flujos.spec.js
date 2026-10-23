const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { createMedicine, medFixture, entryFixture, futureIso, medioPago, requireAccountingOptions, stockOf, movementsOf } = require('./helpers/medicamentos.helper');

// El panel flotante de alertas (fijo abajo a la derecha) puede tapar la columna
// de acciones cuando hay medicamentos vencidos o por vencer. Se minimiza como lo
// haría un usuario antes de operar sobre la tabla.
async function ocultarAlertas(page) {
  const ocultar = page.locator('aside.med-alertas--abiertas').getByRole('button', { name: 'Ocultar alertas de vencimiento', exact: true });
  try {
    await ocultar.first().waitFor({ state: 'visible', timeout: 4000 });
  } catch (_error) {
    return; // Sin alertas para este usuario: no hay panel que minimizar.
  }
  for (const boton of await ocultar.all()) {
    if (await boton.isVisible()) await boton.click();
  }
  await expect(page.locator('aside.med-alertas--abiertas')).toHaveCount(0);
}

test.describe('Medicamentos: interfaz simplificada',()=>{
  test('stock solo permite editar e historial; altas y bajas separadas',async ({request,page})=>{
    const fx=await createMedicine(request);
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    await ocultarAlertas(page);
    const table=page.getByRole('table',{name:'Stock de medicamentos'});
    const row=table.getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await expect(row).toBeVisible();
    await expect(row.getByRole('button',{name:'Editar'})).toBeVisible();
    await expect(row.getByRole('button',{name:'Historial'})).toBeVisible();
    await expect(row.getByRole('button',{name:/Ingresar|Egresar|Lote/i})).toHaveCount(0);
    await row.getByRole('button',{name:'Editar'}).click();
    const dialog=page.getByRole('dialog',{name:/Editar medicamento/});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab',{name:/Stock/}).click();
    await expect(dialog.getByRole('button',{name:'Agregar stock'})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Restar stock'})).toBeVisible();
    await expect(dialog.getByText('Motivo del ingreso')).toBeVisible();
  });

  test('baja solicita motivo y lo muestra en la pestaña Bajas',async ({request,page})=>{
    const fx=await createMedicine(request);
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    await ocultarAlertas(page);
    const row=page.getByRole('table',{name:'Stock de medicamentos'}).getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await row.getByRole('button',{name:'Dar de baja'}).click();
    const dialog=page.getByRole('dialog',{name:'Dar de baja medicamento'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Motivo de baja')).toBeVisible();
    // Con stock, la interfaz explica el paso previo y no permite confirmar.
    await expect(dialog.getByText(/Registrá el descarte o ajuste desde Editar.*antes de darlo de baja/i)).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Dar de baja'})).toBeDisabled();
    await dialog.getByRole('button',{name:'Cancelar'}).click();
  });

  test('vencido: Restar stock solo ofrece descarte o ajuste, sin venta ni entrega',async ({request,page})=>{
    const vencido=await createMedicine(request,{
      medicine:medFixture({fecha_vencimiento:futureIso(-1)}),
      first:entryFixture({cantidad:3,fecha_vencimiento:futureIso(-1)}),
    });
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(vencido.medicine.nombre_comercial);
    await ocultarAlertas(page);
    const row=page.getByRole('table',{name:'Stock de medicamentos'}).getByRole('row').filter({hasText:vencido.medicine.nombre_comercial});
    await expect(row.getByText('Vencido',{exact:true})).toBeVisible();
    await row.getByRole('button',{name:'Editar'}).click();
    const dialog=page.getByRole('dialog',{name:/Editar medicamento/});
    await dialog.getByRole('tab',{name:/Stock/}).click();
    await dialog.getByRole('button',{name:'Restar stock'}).click();
    const motivo=dialog.getByLabel('Motivo de salida *');
    await expect(motivo.locator('option[value="SALIDA_VENTA"]')).toHaveCount(0);
    await expect(motivo.locator('option[value="ENTREGA_DONACION"]')).toHaveCount(0);
    await expect(motivo.locator('option[value="BAJA_DESCARTE"]')).toHaveCount(1);
    // La explicación está en la ayuda contextual del encabezado (portal), no en el formulario.
    await dialog.getByRole('button', { name: 'Ver información importante de este formulario' }).click();
    await expect(page.getByRole('tooltip')).toContainText(/solo se puede descartar o ajustar/i);
  });

  test('préstamo: selector solo con nombre y stock; vencidos excluidos y explicación visible',async ({request,page})=>{
    const valido=await createMedicine(request,{first:entryFixture({cantidad:7})});
    const vencido=await createMedicine(request,{
      medicine:medFixture({fecha_vencimiento:futureIso(-1)}),
      first:entryFixture({cantidad:5,fecha_vencimiento:futureIso(-1)}),
    });
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('button',{name:'Nuevo préstamo'}).click();
    const dialog=page.getByRole('dialog',{name:'Registrar préstamo de medicamentos'});
    await dialog.getByRole('tab',{name:'Medicamentos'}).click();
    const selector=dialog.getByLabel('Medicamento 1 *');
    const validoOpcion=selector.locator(`option[value="${valido.id}"]`);
    // Campo fuerza mayúsculas de presentación. Solo se muestra el nombre y
    // la cantidad, sin droga, laboratorio ni descripción dentro de la opción.
    await expect(validoOpcion).toHaveText(new RegExp(`^${valido.medicine.nombre_comercial} · 7 disponibles$`, 'i'));
    await expect(selector.locator(`option[value="${vencido.id}"]`)).toHaveCount(0);
    // Los no prestables se excluyen del selector y se explican al abrir la ayuda.
    await dialog.getByRole('button', { name: 'Ver información importante de este formulario' }).click();
    const ayuda = page.getByRole('tooltip');
    await expect(ayuda).toContainText(vencido.medicine.nombre_comercial);
    await expect(ayuda).toContainText(/Para corregir la fecha.*Medicamentos.*Stock.*Editar.*Datos/i);
  });

  test('historial: una venta anulable habilita el botón, confirma reintegro y luego impide una segunda anulación', async ({ request, page }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['VENTA DE MEDICAMENTOS'],
      CONCEPTO_INGRESO: ['VENTA DE MEDICAMENTOS'],
      CATEGORIA_EGRESO: ['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],
      CONCEPTO_EGRESO: ['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
    });
    const medio = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 5 }) });
    const detalle = 'PW E2E VENTA ANULABLE DESDE HISTORIAL';
    const venta = await apiCall(request, 'medicamentos_salida', {
      method: 'POST', data: { id_medicamento: fx.id, tipo: 'SALIDA_VENTA', cantidad: 2,
        importe: '124.50', id_medio_pago: medio, detalle },
    });
    expect((await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(venta.id_movimiento)).motivo_no_anulable).toBeNull();

    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
    const registro = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row')
      .filter({ hasText: fx.medicine.nombre_comercial });
    await expect(registro).toBeVisible();
    await ocultarAlertas(page);
    await registro.getByRole('button', { name: 'Historial' }).click();
    const historial = page.getByRole('dialog', { name: `Historial · ${fx.medicine.nombre_comercial}` });
    const fila = historial.locator('.med-history-row').filter({ hasText: detalle });
    await expect(fila).toBeVisible();
    const anular = fila.getByRole('button', { name: 'Anular operación' });
    await expect(anular).toBeEnabled();
    await expect(anular).toHaveAttribute('title', 'Anular operación');
    await anular.click();

    const confirmacion = page.getByRole('dialog', { name: 'Anular venta de medicamentos' });
    await expect(confirmacion).toBeVisible();
    const confirmar = confirmacion.getByRole('button', { name: 'Registrar anulación' });
    await expect(confirmar).toBeDisabled();
    await confirmacion.getByLabel('Medio de pago del reintegro *').selectOption(String(medio));
    await confirmacion.getByLabel(/Motivo documentado de anulación/).fill('PW E2E DEVOLUCIÓN COMPLETA Y REINTEGRO CONFIRMADO');
    await expect(confirmar).toBeDisabled(); // Falta confirmar la devolución física.
    await confirmacion.getByRole('checkbox', { name: /Confirmo la devolución física/ }).check();
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(confirmacion).not.toBeVisible();
    await expect(anular).toBeDisabled();
    await expect(anular).toHaveAttribute('title', /ya fue anulada/i);
    await expect(fila.getByText('Operación anulada con contramovimiento.')).toBeVisible();
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(5);
  });

  test('historial: compra deja de ser anulable si hubo consumo posterior; el botón indica la causa', async ({ request, page }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_EGRESO: ['COMPRA DE MEDICAMENTOS'],
      CONCEPTO_EGRESO: ['COMPRA DE MEDICAMENTOS'],
    });
    const medio = await medioPago(request);
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 3 }) });
    const procedencia = 'PW E2E FARMACIA COMPRA PARA HISTORIAL';
    const compra = await apiCall(request, 'medicamentos_ingresar', {
      method: 'POST', data: { id_medicamento: fx.id, ...entryFixture({ origen: 'COMPRA', cantidad: 2,
        costo_unitario: '50.00', id_medio_pago: medio, procedencia }) },
    });
    expect((await movementsOf(request, fx.id)).find(m => Number(m.id_movimiento) === Number(compra.id_movimiento)).motivo_no_anulable).toBeNull();

    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(fx.medicine.nombre_comercial);
    const registro = page.getByRole('table', { name: 'Stock de medicamentos' }).getByRole('row')
      .filter({ hasText: fx.medicine.nombre_comercial });
    await expect(registro).toBeVisible();
    await ocultarAlertas(page);
    await registro.getByRole('button', { name: 'Historial' }).click();
    let historial = page.getByRole('dialog', { name: `Historial · ${fx.medicine.nombre_comercial}` });
    let fila = historial.locator('.med-history-row').filter({ hasText: procedencia });
    await expect(fila.getByRole('button', { name: 'Anular operación' })).toBeEnabled();
    await historial.getByRole('button', { name: 'Cerrar' }).click();

    await apiCall(request, 'medicamentos_salida', {
      method: 'POST', data: { id_medicamento: fx.id, tipo: 'AJUSTE_SALIDA', cantidad: 1,
        detalle: 'PW E2E CONSUMO QUE BLOQUEA LA COMPRA' },
    });
    await registro.getByRole('button', { name: 'Historial' }).click();
    historial = page.getByRole('dialog', { name: `Historial · ${fx.medicine.nombre_comercial}` });
    fila = historial.locator('.med-history-row').filter({ hasText: procedencia });
    const anular = fila.getByRole('button', { name: 'Anular operación' });
    await expect(anular).toBeDisabled();
    await expect(anular).toHaveAttribute('title', /consumo de stock posterior/i);
    await expect(page.getByRole('dialog', { name: 'Anular compra de medicamentos' })).toHaveCount(0);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(4);
  });

});
