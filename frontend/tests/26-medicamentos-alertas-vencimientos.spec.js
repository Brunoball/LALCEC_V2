const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const { createMedicine, entryFixture, futureIso, createBorrower } = require('./helpers/medicamentos.helper');

async function findAlert(request, tipo, id) {
  const res=await apiCall(request,'medicamentos_alertas',{params:{tipo}});
  expect(res.umbral_dias).toBe(30);
  return (res.registros||[]).find(a=>Number(a.id_referencia)===Number(id));
}

test.describe('Medicamentos: vencimientos, alertas y descarte persistente', () => {
  test('lote próximo a vencer: alerta activa, fecha vieja rechazada y descarte persistente', async ({request}) => {
    const vencimiento=futureIso(10);
    const fx=await createMedicine(request,{first:entryFixture({cantidad:3,fecha_vencimiento:vencimiento})});
    const alert=await findAlert(request,'LOTE',fx.lotId);
    expect(alert).toMatchObject({tipo:'LOTE',fecha_objetivo:vencimiento});
    expect(Number(alert.dias_restantes)).toBeGreaterThanOrEqual(0);
    expect(Number(alert.dias_restantes)).toBeLessThanOrEqual(30);

    const old=await apiResult(request,'medicamentos_descartar_alerta',{method:'POST',data:{
      tipo:'LOTE',id_referencia:fx.lotId,fecha_objetivo:futureIso(11),
    }});
    expect(old.status).toBe(409);
    expect(old.body.codigo).toBe('STALE_ALERT');
    expect(await findAlert(request,'LOTE',fx.lotId)).toBeTruthy();

    const discarded=await apiCall(request,'medicamentos_descartar_alerta',{method:'POST',data:{
      tipo:'LOTE',id_referencia:fx.lotId,fecha_objetivo:vencimiento,
    }});
    expect(discarded.descartada).toBe(true);
    expect(await findAlert(request,'LOTE',fx.lotId)).toBeUndefined();
    // Mismo usuario y misma fecha: operación repetida permitida sin duplicar la alerta.
    const repeated=await apiCall(request,'medicamentos_descartar_alerta',{method:'POST',data:{
      tipo:'LOTE',id_referencia:fx.lotId,fecha_objetivo:vencimiento,
    }});
    expect(repeated.descartada).toBe(true);
    expect(await findAlert(request,'LOTE',fx.lotId)).toBeUndefined();
  });

  test('UI: semáforo amarillo, leyenda de colores, minimizar, cancelar descarte y confirmar con persistencia', async ({ request, page }) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:4,fecha_vencimiento:futureIso(9)})});
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    const row=page.getByRole('table',{name:'Stock de medicamentos'}).getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await expect(row).toHaveClass(/is-warning/);
    const legend=page.getByLabel('Referencias de vencimiento');
    for (const label of ['Rojo: vencido','Amarillo: vence hoy o dentro de 30 días',
      'Verde: faltan más de 30 días','Gris: sin vencimiento aplicable']) {
      await expect(legend).toContainText(label);
    }
    const alerts=page.getByLabel('Alertas de medicamentos');
    await expect(alerts).toContainText(fx.medicine.nombre_comercial);
    await alerts.getByRole('button',{name:'Ocultar tarjetas de alertas temporalmente'}).click();
    await expect(alerts.getByRole('button',{name:/Alertas/})).toBeVisible();
    await alerts.getByRole('button',{name:/Alertas/}).click();
    await alerts.getByRole('button',{name:`Descartar permanentemente alerta de ${fx.medicine.nombre_comercial}`}).click();
    const dialog=page.getByRole('dialog',{name:'Descartar alerta definitivamente'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Cancelar'}).click();
    await expect(alerts).toContainText(fx.medicine.nombre_comercial);
    await alerts.getByRole('button',{name:`Descartar permanentemente alerta de ${fx.medicine.nombre_comercial}`}).click();
    await page.getByRole('dialog',{name:'Descartar alerta definitivamente'})
      .getByRole('button',{name:'Sí, descartar alerta'}).click();
    await expect.poll(async()=>findAlert(request,'LOTE',fx.lotId)).toBeUndefined();
    await page.reload();
    expect(await findAlert(request,'LOTE',fx.lotId)).toBeUndefined();
  });

  test('semáforo verde con más de 30 días y gris cuando ya no queda stock', async ({request,page}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2,fecha_vencimiento:futureIso(45)})});
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    const row=page.getByRole('table',{name:'Stock de medicamentos'})
      .getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await expect(row).toHaveClass(/is-safe/);
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_lote:fx.lotId,tipo:'ENTREGA_DONACION',cantidad:2,
      detalle:'PW E2E SEMAFORO SIN STOCK',
    }});
    await page.reload();
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    await expect(row).toHaveClass(/is-neutral/);
    expect(await findAlert(request,'LOTE',fx.lotId)).toBeUndefined();
  });

  test('alerta de préstamo solo si está abierto y con fecha prevista; desaparece al finalizar', async ({request,page}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:6})});
    const borrower=await createBorrower(request);
    const due=futureIso(5);
    const result=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{
      id_socio:borrower.id,items:[{id_lote:fx.lotId,cantidad:2}],sena:'0',
      fecha_devolucion_prevista:due,observaciones:'PW E2E ALERTA PRESTAMO',
    }});
    expect(await findAlert(request,'PRESTAMO',result.id_prestamo))
      .toMatchObject({tipo:'PRESTAMO',fecha_objetivo:due});
    await page.goto('/medicamentos/prestamos');
    const panel=page.getByLabel('Alertas de préstamos');
    await expect(panel).toContainText(borrower.person.apellido);
    await panel.locator('button.med-alertas__contenido').filter({hasText:borrower.person.apellido}).click();
    const dialog=page.getByRole('dialog',{name:'Finalizar préstamo'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Cancelar'}).click();
    expect(await findAlert(request,'PRESTAMO',result.id_prestamo)).toBeTruthy();
    await apiCall(request,'medicamentos_cerrar',{method:'POST',data:{id_prestamo:result.id_prestamo}});
    expect(await findAlert(request,'PRESTAMO',result.id_prestamo)).toBeUndefined();
  });

  test('no muestra préstamo sin fecha y no permite descartar alertas de otro tipo', async ({request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:3})});
    const borrower=await createBorrower(request);
    const result=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{
      id_socio:borrower.id,items:[{id_lote:fx.lotId,cantidad:1}],sena:'0',
    }});
    expect(await findAlert(request,'PRESTAMO',result.id_prestamo)).toBeUndefined();
    const invalid=await apiResult(request,'medicamentos_descartar_alerta',{method:'POST',data:{
      tipo:'OTRO',id_referencia:result.id_prestamo,fecha_objetivo:futureIso(2),
    }});
    expect(invalid.status).toBe(409); // escudo fail-closed para tipos no reconocidos
    expect(invalid.body.codigo).toBe('E2E_SCOPE_BLOCKED');
  });
});
