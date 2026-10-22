const { test, expect } = require('./fixtures/auth.fixture');
const { createMedicine, medFixture, entryFixture, futureIso } = require('./helpers/medicamentos.helper');

// El panel flotante de alertas (fijo abajo a la derecha) puede tapar la columna
// de acciones cuando hay medicamentos vencidos o por vencer. Se minimiza como lo
// haría un usuario antes de operar sobre la tabla.
async function ocultarAlertas(page) {
  const ocultar = page.getByRole('button', { name: 'Ocultar tarjetas de alertas temporalmente' });
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
    await expect(dialog.getByText(/Antes de darlo de baja registrá el descarte/)).toBeVisible();
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
    await expect(dialog.getByText(/solo se puede descartar o ajustar/)).toBeVisible();
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
    await expect(validoOpcion).toHaveText(`${valido.medicine.nombre_comercial} · 7 DISPONIBLES`);
    await expect(selector.locator(`option[value="${vencido.id}"]`)).toHaveCount(0);
    await expect(dialog.getByText(new RegExp(vencido.medicine.nombre_comercial))).toBeVisible();
    await expect(dialog.getByText(/Stock.*Editar.*Datos/)).toBeVisible();
  });
});
