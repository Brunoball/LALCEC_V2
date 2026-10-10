const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall } = require('./helpers/api.helper');
const { medFixture, entryFixture, futureIso, createMedicine, createBorrower, stockOf } = require('./helpers/medicamentos.helper');

function rowFor(page, name) {
  return page.getByRole('table',{name:'Stock de medicamentos'}).getByRole('row').filter({hasText:name}).last();
}

test.describe('Medicamentos: interacción real con la interfaz', () => {
  test('alta UI completa, listado, lotes, historial, edición y baja/reactivación', async ({page,request}) => {
    const medicine=medFixture();
    const first=entryFixture({cantidad:4});
    await page.goto('/medicamentos/stock');
    await expect(page.getByRole('heading',{name:'Medicamentos · Stock'})).toBeVisible();
    await expect(page.getByRole('table',{name:'Stock de medicamentos'})).toBeVisible();
    await page.getByRole('button',{name:'Nuevo medicamento'}).click();
    const dialog=page.getByRole('dialog',{name:'Nuevo medicamento'});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Nombre comercial').fill(medicine.nombre_comercial);
    await dialog.getByLabel('Droga').fill(medicine.droga);
    await dialog.getByLabel('Laboratorio').fill(medicine.laboratorio);
    await dialog.getByLabel('Dosis').fill(medicine.dosis);
    await dialog.getByLabel('Cantidad').fill('4');
    await dialog.getByLabel('Fecha de ingreso').fill(first.fecha_ingreso);
    await dialog.getByLabel('Fecha de vencimiento').fill(first.fecha_vencimiento);
    await dialog.getByLabel('Número de lote (opcional)').fill(first.numero_lote);
    await dialog.getByRole('button',{name:'Guardar'}).click();
    await expect(dialog).toHaveCount(0);
    const search=page.getByRole('textbox',{name:'Buscar'});
    await search.fill(medicine.nombre_comercial);
    const row=rowFor(page,medicine.nombre_comercial);
    await expect(row).toBeVisible();
    await expect(row).toContainText('4 UNIDAD disponibles');
    await row.getByRole('button',{name:'Lotes y vencimientos'}).click();
    const lots=page.getByRole('dialog',{name:new RegExp('Lotes y vencimientos')});
    await expect(lots).toContainText(first.numero_lote);
    await expect(lots).toContainText('Disponible');
    await lots.getByRole('button',{name:'Cerrar'}).click();
    await row.getByRole('button',{name:'Historial'}).click();
    const history=page.getByRole('dialog',{name:/Historial/});
    await expect(history).toContainText(first.numero_lote);
    await history.getByRole('button',{name:'Cerrar'}).click();
    await row.getByRole('button',{name:'Editar'}).click();
    const edit=page.getByRole('dialog',{name:'Editar medicamento'});
    await expect(edit.getByLabel('Droga')).toBeDisabled();
    await expect(edit.getByLabel('Presentación')).toBeDisabled();
    await expect(edit.getByLabel('Dosis')).toBeDisabled();
    await expect(edit.getByLabel('Unidad de stock')).toBeDisabled();
    await edit.getByLabel('Laboratorio').fill('LAB EDITADO POR UI');
    await edit.getByRole('button',{name:'Guardar'}).click();
    await expect(edit).toHaveCount(0);
    await expect(row).toContainText('LAB EDITADO POR UI');
    await row.getByRole('button',{name:'Dar de baja'}).click();
    await page.getByRole('dialog',{name:'Dar de baja medicamento'}).getByRole('button',{name:'Dar de baja'}).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('tab',{name:/Bajas/}).click();
    const baja=rowFor(page,medicine.nombre_comercial);
    await expect(baja).toContainText('Dado de baja');
    await baja.getByRole('button',{name:'Reactivar'}).click();
    await page.getByRole('dialog',{name:'Reactivar medicamento'}).getByRole('button',{name:'Reactivar'}).click();
    await page.getByRole('tab',{name:/Activos/}).click();
    await expect(rowFor(page,medicine.nombre_comercial)).toBeVisible();
    const catalog=await apiCall(request,'medicamentos_catalogo');
    expect(catalog.registros.some(x=>x.nombre_comercial===medicine.nombre_comercial&&Number(x.activo)===1)).toBe(true);
  });

  test('egreso UI muestra distribución FEFO y valida cantidades antes de permitir guardar', async ({page,request}) => {
    const first=entryFixture({cantidad:2,fecha_vencimiento:futureIso(45)});
    const fx=await createMedicine(request,{first});
    await apiCall(request,'medicamentos_ingresar',{method:'POST',data:{
      id_medicamento:fx.id,...entryFixture({cantidad:4,fecha_vencimiento:futureIso(200)}),
    }});
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Buscar'}).fill(fx.medicine.nombre_comercial);
    const row=rowFor(page,fx.medicine.nombre_comercial);
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'Egresar stock'}).click();
    const modal=page.getByRole('dialog',{name:/Egresar stock/});
    await expect(modal).toBeVisible();
    await modal.getByLabel('Cantidad').fill('7');
    await expect(modal).toContainText('No hay stock suficiente');
    await expect(modal.getByRole('button',{name:'Guardar'})).toBeDisabled();
    await modal.getByLabel('Cantidad').fill('5');
    await expect(modal).toContainText('Asignación automática por vencimiento (2 lotes)');
    await expect(modal.getByRole('button',{name:'Guardar'})).toBeEnabled();
    await modal.getByLabel('Detalle / motivo').fill('PW E2E ENTREGA DESDE UI');
    await modal.getByRole('button',{name:'Guardar'}).click();
    await expect(modal).toHaveCount(0);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(1);
  });

  test('préstamos UI: filtros, búsqueda por DNI, detalle, formulario de devolución y cierre', async ({page,request}) => {
    const fx=await createMedicine(request,{first:entryFixture({cantidad:5})});
    const borrower=await createBorrower(request);
    const res=await apiCall(request,'medicamentos_prestar',{method:'POST',data:{
      id_socio:borrower.id,items:[{id_lote:fx.lotId,cantidad:2}],sena:'0',
    }});
    const loanId=Number(res.id_prestamo);
    await page.goto('/medicamentos/prestamos');
    await expect(page.getByRole('heading',{name:'Medicamentos · Préstamos'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Nuevo préstamo'})).toBeVisible();
    const search=page.getByRole('textbox',{name:'Buscar socio'});
    await search.fill(borrower.person.dni);
    const table=page.getByRole('table',{name:'Préstamos de medicamentos'});
    const row=table.getByRole('row').filter({hasText:`#${loanId}`}).last();
    await expect(row).toContainText(borrower.person.dni);
    await row.getByRole('button',{name:`Ver detalle del préstamo #${loanId}`}).click();
    const detail=page.getByRole('dialog',{name:new RegExp(`Préstamo #${loanId}`)});
    await expect(detail).toContainText(fx.medicine.nombre_comercial);
    await expect(detail).toContainText('Pendiente: 2');
    await detail.getByRole('button',{name:'Cerrar'}).click();
    await row.getByRole('button',{name:'Registrar devolución de medicamentos'}).click();
    const returnDialog=page.getByRole('dialog',{name:/Registrar devolución de medicamentos/});
    await expect(returnDialog).toBeVisible();
    await returnDialog.getByLabel('Cantidad recibida (máximo 2)').fill('3');
    await expect(returnDialog.getByRole('button',{name:'Registrar devolución'})).toBeDisabled();
    await returnDialog.getByLabel('Cantidad recibida (máximo 2)').fill('1');
    await returnDialog.getByLabel('Vencimiento del medicamento recibido').fill(futureIso(320));
    await returnDialog.getByRole('button',{name:'Registrar devolución'}).click();
    await expect(returnDialog).toHaveCount(0);
    expect(Number((await stockOf(request,fx.id)).stock_total)).toBe(4);
    await row.getByRole('button',{name:'Cerrar préstamo'}).click();
    const closing=page.getByRole('dialog',{name:/Cerrar préstamo definitivamente/});
    await expect(closing).toContainText('Unidades que no se devolvieron');
    await closing.getByRole('button',{name:'Confirmar cierre'}).click();
    await expect(closing).toHaveCount(0);
    const details=await apiCall(request,'medicamentos_prestamo_detalle',{params:{id:loanId}});
    expect(details.prestamo.estado).toBe('CERRADO');
  });

  test('los endpoints de consultas del nuevo módulo responden y búsquedas no incluyen IDs inválidos', async ({request}) => {
    for(const action of ['medicamentos_catalogo','medicamentos_medios','medicamentos_procedencias',
      'medicamentos_socios','medicamentos_lotes','medicamentos_historial','medicamentos_prestamos']){
      const result=await apiCall(request,action,{params:action==='medicamentos_historial'?{id_medicamento:0}:{buscar:'PW E2E'}});
      expect(result).toHaveProperty('registros');
      expect(Array.isArray(result.registros)).toBe(true);
    }
  });
});
