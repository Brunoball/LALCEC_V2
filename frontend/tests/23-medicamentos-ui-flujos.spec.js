const { test, expect } = require('./fixtures/auth.fixture');
const { createMedicine } = require('./helpers/medicamentos.helper');

test.describe('Medicamentos: interfaz simplificada',()=>{
  test('stock solo permite editar e historial; altas y bajas separadas',async ({request,page})=>{
    const fx=await createMedicine(request);
    await page.goto('/medicamentos/stock');
    await page.getByRole('textbox',{name:'Búsqueda'}).fill(fx.medicine.nombre_comercial);
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
    const row=page.getByRole('table',{name:'Stock de medicamentos'}).getByRole('row').filter({hasText:fx.medicine.nombre_comercial});
    await row.getByRole('button',{name:'Dar de baja'}).click();
    const dialog=page.getByRole('dialog',{name:'Dar de baja medicamento'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Motivo de baja')).toBeVisible();
    await dialog.getByRole('button',{name:'Cancelar'}).click();
  });
});
