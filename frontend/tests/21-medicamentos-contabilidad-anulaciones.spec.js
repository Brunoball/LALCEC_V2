const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { todayIso } = require('./helpers/data.helper');
const {
  medFixture, entryFixture, futureIso, medioPago, requireAccountingOptions, createMedicine,
  lotOf, stockOf, movementsOf, assertError,
} = require('./helpers/medicamentos.helper');

const toCents = n => Math.round(Number(n) * 100);
const month = () => {
  const [anio, mes] = todayIso().split('-').map(Number);
  return { anio, mes };
};
async function accountingById(request, action, id) {
  const res = await apiCall(request,action,{params:month()});
  const row = (res.items || []).find(x => Number(x.id_ingreso || x.id_egreso)===Number(id));
  expect(row, `No aparece el asiento contable #${id} en ${action}`).toBeTruthy();
  return row;
}
async function prepare(request, use) {
  await requireAccountingOptions(request,use);
  return medioPago(request);
}

// No modificar opciones automáticas NO E2E: si faltan, el test falla antes de escribir.
test.describe('Medicamentos: Contabilidad, compras, ventas y contramovimientos', () => {
  test('compra: egreso, proveedor histórico y anulación con reintegro', async ({ request, page }) => {
    const medio = await prepare(request, {
      CATEGORIA_EGRESO:['COMPRA DE MEDICAMENTOS'],
      CONCEPTO_EGRESO:['COMPRA DE MEDICAMENTOS'],
      CATEGORIA_INGRESO:['REINTEGROS DE COMPRAS DE MEDICAMENTOS'],
      CONCEPTO_INGRESO:['REINTEGRO DE COMPRA DE MEDICAMENTOS'],
    });
    const fx=await createMedicine(request);
    const purchase=entryFixture({origen:'COMPRA',cantidad:5,costo_unitario:'12.30',id_medio_pago:medio});
    const created=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...purchase}});
    const lotId=Number(created.id_lote);
    expect(Number((await lotOf(request,lotId)).cantidad_disponible)).toBe(5);
    const original=(await movementsOf(request,fx.id)).find(x => Number(x.id_lote)===lotId && x.tipo==='INGRESO_COMPRA');
    expect(original).toBeTruthy();
    expect(Number(original.id_egreso_contable)).toBeGreaterThan(0);
    const expense=await accountingById(request,'contable_egresos_listar',original.id_egreso_contable);
    expect(toCents(expense.importe)).toBe(6150);
    expect(expense.categoria).toBe('COMPRA DE MEDICAMENTOS');
    expect(expense.proveedor).toBe(purchase.procedencia);
    expect(Number(expense.id_medio_pago)).toBe(medio);

    const reversal={id_movimiento:original.id_movimiento,motivo:'PW E2E COMPRA EQUIVOCADA REINTEGRO COMPLETO',id_medio_pago:medio,devolucion_confirmada:true};
    await assertError(request,'medicamentos_anular',{...reversal,devolucion_confirmada:false},/confirm/i);
    const res=await apiCall(request,'medicamentos_anular',{method:'POST',data:reversal});
    expect(res.operacion_anulada).toBe('COMPRA');
    expect(res.movimientos_inversos).toHaveLength(1);
    const refund=await accountingById(request,'contable_ingresos_listar',res.id_contable_compensatorio);
    expect(toCents(refund.importe)).toBe(6150);
    expect(Number((await lotOf(request,lotId)).cantidad_disponible)).toBe(0);
    const hist=await movementsOf(request,fx.id);
    expect(hist.find(x=>Number(x.id_movimiento)===Number(original.id_movimiento))).toMatchObject({tipo:'INGRESO_COMPRA'});
    expect(hist.find(x=>Number(x.id_movimiento)===Number(original.id_movimiento)).anulada).toBeTruthy();
    await assertError(request,'medicamentos_anular',reversal,/anulada|repetir/i);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(fx.first.cantidad);

    // 'Anular operación' también se comprueba desde la interfaz, en un
    // segundo lote de prueba para no quitar el contrato API anterior.
    const uiPurchase=entryFixture({origen:'COMPRA',cantidad:3,costo_unitario:'8.00',id_medio_pago:medio});
    const uiCreated=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...uiPurchase}});
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
    const table=page.getByRole('table',{name:'Stock de medicamentos'});
    const medRow=table.getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await expect(medRow).toBeVisible();
    await medRow.getByRole('button',{name:'Historial'}).click();
    const histModal=page.getByRole('dialog',{name:/Historial/});
    await expect(histModal).toBeVisible();
    const movement=(await movementsOf(request,fx.id)).find(m=>Number(m.id_lote)===Number(uiCreated.id_lote) && m.tipo==='INGRESO_COMPRA');
    expect(movement).toBeTruthy();
    const movementRow=histModal.locator('.med-history-row').filter({hasText:uiPurchase.numero_lote});
    await expect(movementRow).toBeVisible();
    await movementRow.getByRole('button',{name:'Anular operación'}).click();
    const annulModal=page.getByRole('dialog',{name:'Anular compra de medicamentos'});
    await expect(annulModal).toBeVisible();
    await annulModal.getByLabel('Medio de pago utilizado para el reintegro').selectOption(String(medio));
    await annulModal.getByLabel('Motivo documentado de anulación').fill('PW E2E ANULACION DESDE UI POR COMPRA ERRONEA');
    await annulModal.getByRole('checkbox',{name:/Confirmo la devolución física/}).check();
    await annulModal.getByRole('button',{name:'Registrar anulación'}).click();
    await expect(annulModal).toHaveCount(0);
    expect((await movementsOf(request,fx.id)).find(m=>Number(m.id_movimiento)===Number(movement.id_movimiento)).anulada).toBeTruthy();
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(fx.first.cantidad);
  });

  test('venta FEFO multi-lote: un ingreso contable y reversión en lotes bloqueados', async ({ request }) => {
    const medio=await prepare(request,{
      CATEGORIA_INGRESO:['VENTA DE MEDICAMENTOS'],
      CONCEPTO_INGRESO:['VENTA DE MEDICAMENTOS'],
      CATEGORIA_EGRESO:['DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],
      CONCEPTO_EGRESO:['DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
    });
    const fx=await createMedicine(request,{first:entryFixture({cantidad:2,fecha_vencimiento:futureIso(90)})});
    await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{id_medicamento:fx.id,...entryFixture({cantidad:4,fecha_vencimiento:futureIso(240)})}});
    const before=(await stockOf(request,fx.id)).stock_total;
    const sale=await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      tipo:'SALIDA_VENTA',id_medicamento:fx.id,cantidad:5,importe:'157.50',id_medio_pago:medio,
      detalle:'PW E2E VENTA MULTILOTE',
    }});
    expect(sale.id_movimientos).toHaveLength(2);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(Number(before)-5);
    const history=await movementsOf(request,fx.id);
    const sales=history.filter(x=>sale.id_movimientos.map(Number).includes(Number(x.id_movimiento)));
    expect(sales).toHaveLength(2);
    expect(new Set(sales.map(x=>x.id_ingreso_contable))).toEqual(new Set([sales[0].id_ingreso_contable]));
    const income=await accountingById(request,'contable_ingresos_listar',sales[0].id_ingreso_contable);
    expect(toCents(income.importe)).toBe(15750);
    expect(income.categoria).toBe('VENTA DE MEDICAMENTOS');

    const undo=await apiCall(request,'medicamentos_anular',{method:'POST',data:{
      id_movimiento:sales[0].id_movimiento,id_medio_pago:medio,
      motivo:'PW E2E REINTEGRO TOTAL POR VENTA MULTILOTE',devolucion_confirmada:true,
    }});
    expect(undo.operacion_anulada).toBe('VENTA');
    expect(undo.movimientos_inversos).toHaveLength(2);
    const expense=await accountingById(request,'contable_egresos_listar',undo.id_contable_compensatorio);
    expect(toCents(expense.importe)).toBe(15750);
    const lots=(await apiCall(request,'medicamentos_lotes',{params:{id_medicamento:fx.id}})).registros;
    const returned=lots.filter(l=>String(l.procedencia).includes(`ANULACION VENTA #${sales[0].id_ingreso_contable}`));
    expect(returned).toHaveLength(2);
    for(const lot of returned) expect(lot.estado).toBe('BLOQUEADO');
    expect(returned.reduce((sum,l)=>sum+Number(l.cantidad_disponible),0)).toBe(5);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(Number(before));
    expect(Number((await stockOf(request,fx.id)).stock_utilizable)).toBe(Number(before)-5);
    const current=await movementsOf(request,fx.id);
    expect(current.filter(x=>x.tipo==='SALIDA_VENTA'&&Number(x.anulada)===1)).toHaveLength(2);
  });

  test('anulación de compra usada se rechaza sin modificar el lote ni generar contramovimientos', async ({ request }) => {
    const medio=await prepare(request,{CATEGORIA_EGRESO:['COMPRA DE MEDICAMENTOS'],CONCEPTO_EGRESO:['COMPRA DE MEDICAMENTOS']});
    const fx=await createMedicine(request);
    const purchase=await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{
      id_medicamento:fx.id,...entryFixture({origen:'COMPRA',cantidad:3,costo_unitario:'2.00',id_medio_pago:medio}),
    }});
    const h=await movementsOf(request,fx.id);
    const original=h.find(x=>x.tipo==='INGRESO_COMPRA' && Number(x.id_lote)===Number(purchase.id_lote));
    await apiCall(request,'medicamentos_salida',{method:'POST',data:{
      id_lote:purchase.id_lote,tipo:'ENTREGA_DONACION',cantidad:1,detalle:'PW E2E USO DE COMPRA',
    }});
    const count=(await movementsOf(request,fx.id)).length;
    await assertError(request,'medicamentos_anular',{
      id_movimiento:original.id_movimiento,motivo:'PW E2E DEVOLUCION COMPRA YA UTILIZADA',
      id_medio_pago:medio,devolucion_confirmada:true,
    },/lote|movimientos|utilizado|correcci[oó]n/i);
    expect(Number((await lotOf(request,purchase.id_lote)).cantidad_disponible)).toBe(2);
    expect((await movementsOf(request,fx.id))).toHaveLength(count);
  });
});
