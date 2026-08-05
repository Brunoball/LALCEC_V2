const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, familyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  cleanupFamilyByPrefix,
  cleanupSocioByDocument,
} = require('./helpers/api.helper');
const { dismissPersistentToast, expectToast } = require('./helpers/auth.helper');
const { todayIso } = require('./helpers/data.helper');

const person = personData();
const company = companyData();
const family = familyData();
const familyMember = personData();

function tableRow(page, tableName, text) {
  return page
    .getByRole('table', { name: tableName })
    .getByRole('row')
    .filter({ hasText: text })
    .last();
}

async function permanentDeleteCurrentPartner(page, row) {
  await row.getByTitle(/Eliminar definitivamente/i).click();

  const deleteDialog = page
    .getByRole('dialog')
    .filter({ hasText: /Eliminar definitivamente/i });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expectToast(page, /eliminados definitivamente/i);
}

test.describe.configure({ mode: 'serial' });

test.describe('Socios, empresas y familias', () => {
  test.afterEach(async ({ request }) => {
    try {
      cleanupFamilyByPrefix(family.prefix);
    } catch (_error) {
      // La familia puede no haberse creado todavía.
    }

    for (const target of [
      { tipo: 'PERSONA', documento: person.dni },
      { tipo: 'EMPRESA', documento: company.cuit },
      { tipo: 'PERSONA', documento: familyMember.dni },
    ]) {
      try {
        await cleanupSocioByDocument(request, target);
      } catch (_error) {
        // El test principal conservará el error original. La siguiente corrida
        // volverá a intentar limpiar el registro exacto.
      }
    }
  });

  test('cubre el ciclo completo de un socio persona', async ({ page, request }) => {
    await cleanupSocioByDocument(request, { tipo: 'PERSONA', documento: person.dni });

    await page.goto('/socios/personas');
    await expect(page.getByRole('heading', { name: 'Socios' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Listado de socios' })).toBeVisible();
    await page.getByRole('tab', { name: 'Activos' }).click();

    await page.getByRole('button', { name: 'Nuevo socio' }).click();
    let dialog = page.getByRole('dialog', { name: 'Nuevo socio' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Crear socio' }).click();
    await expectToast(page, /Completá apellido, nombre y fecha de alta/i);

    await dialog.getByLabel('Apellido *').fill(person.apellido);
    await dialog.getByLabel('Nombre *').fill(person.nombre);
    await dialog.getByLabel('DNI').fill(person.dni);
    await dialog.getByRole('tab', { name: 'Contacto y membresía' }).click();
    await dialog.getByRole('textbox', { name: 'Domicilio', exact: true }).fill('CALLE PLAYWRIGHT');
    await dialog.getByLabel('Número').fill('123');
    await dialog.getByLabel('Localidad').fill('SAN FRANCISCO');
    await dialog.getByLabel('Teléfono').fill(person.telefono);
    await dialog.getByLabel('Correo').fill(person.email);
    await dialog.getByLabel('Observaciones').fill('ALTA AUTOMÁTICA DE PLAYWRIGHT');
    await dialog
      .getByRole('checkbox', { name: /Enviar recordatorios/i })
      .uncheck();
    await dialog.getByRole('button', { name: 'Crear socio' }).click();
    await expectToast(page, 'Registro creado correctamente.');

    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(person.dni);
    let row = tableRow(page, 'Listado de socios', person.dni);
    await expect(row).toContainText(`${person.apellido}, ${person.nombre}`);
    await expect(row).toContainText('SIN AVISO');

    await row.getByTitle('Ver ficha e historial').click();
    let infoDialog = page.getByRole('dialog', { name: 'Información del Socio' });
    await expect(infoDialog).toContainText(person.dni);
    await infoDialog.getByRole('tab', { name: 'Contacto' }).click();
    await expect(infoDialog).toContainText(person.email);
    await infoDialog.getByRole('tab', { name: 'Estados' }).click();
    await expect(infoDialog).toContainText(/ALTA|ACTIVO/i);
    await infoDialog.getByRole('tab', { name: 'Estado de pagos' }).click();
    await expect(infoDialog.getByText(/Meses —/)).toBeVisible();
    await infoDialog.getByRole('button', { name: 'Cerrar' }).click();

    row = tableRow(page, 'Listado de socios', person.dni);
    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar socio' });
    await dialog.getByLabel('Nombre *').fill(person.nombreEditado);
    await dialog.getByRole('tab', { name: 'Contacto y membresía' }).click();
    await dialog.getByLabel('Teléfono').fill(`${person.telefono}9`);
    await dialog
      .getByRole('checkbox', { name: /Enviar recordatorios/i })
      .check();
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Registro actualizado correctamente.');

    row = tableRow(page, 'Listado de socios', person.dni);
    await expect(row).toContainText(person.nombreEditado);
    await expect(row).toContainText('WHATSAPP');

    await row.getByTitle('Dar de baja').click();
    let stateDialog = page.getByRole('dialog').filter({ hasText: /Dar de baja.*socio/i });
    await stateDialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expectToast(page, 'Tenés que completar el motivo para continuar.');
    await dismissPersistentToast(page);
    await stateDialog.getByLabel('Motivo de baja *').fill('PRUEBA DE BAJA AUTOMÁTICA');
    await stateDialog.getByLabel('Fecha de baja *').fill(todayIso());
    await stateDialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expectToast(page, 'Registro dado de baja correctamente.');

    await page.getByRole('tab', { name: 'Bajas' }).click();
    row = tableRow(page, 'Listado de socios', person.dni);
    await expect(row).toBeVisible();
    await row.getByTitle('Reactivar').click();
    stateDialog = page.getByRole('dialog').filter({ hasText: /Reactivar socio/i });
    await stateDialog.getByRole('button', { name: 'Reactivar' }).click();
    await expectToast(page, 'Registro reactivado correctamente.');

    await page.getByRole('tab', { name: 'Activos' }).click();
    row = tableRow(page, 'Listado de socios', person.dni);
    await permanentDeleteCurrentPartner(page, row);
    await expect(tableRow(page, 'Listado de socios', person.dni)).toHaveCount(0);
  });

  test('cubre el ciclo completo de una empresa', async ({ page, request }) => {
    await cleanupSocioByDocument(request, { tipo: 'EMPRESA', documento: company.cuit });

    await page.goto('/socios/empresas');
    await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
    await page.getByRole('tab', { name: 'Activos' }).click();
    await page.getByRole('button', { name: 'Nueva empresa' }).click();

    let dialog = page.getByRole('dialog', { name: 'Nueva empresa' });
    await dialog.getByRole('button', { name: 'Crear empresa' }).click();
    await expectToast(page, /Completá la razón social y la fecha de alta/i);

    await dialog.getByLabel('Razón social *').fill(company.razonSocial);
    await dialog.getByLabel('CUIT').fill(company.cuit);
    const iva = dialog.getByLabel('Condición de IVA');
    if ((await iva.locator('option').count()) > 1) {
      await iva.selectOption({ index: 1 });
    }
    await dialog.getByRole('tab', { name: 'Contacto y membresía' }).click();
    await dialog.getByRole('textbox', { name: 'Domicilio', exact: true }).fill('AVENIDA E2E 456');
    await dialog.getByLabel('Teléfono').fill(company.telefono);
    await dialog.getByLabel('Correo').fill(company.email);
    await dialog.getByRole('button', { name: 'Crear empresa' }).click();
    await expectToast(page, 'Registro creado correctamente.');

    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(company.cuit);
    let row = tableRow(page, 'Listado de empresas', company.cuit);
    await expect(row).toContainText(company.razonSocial);

    await row.getByTitle('Ver ficha e historial').click();
    const infoDialog = page.getByRole('dialog', { name: 'Información de la Empresa' });
    await expect(infoDialog).toContainText(company.cuit);
    await infoDialog.getByRole('tab', { name: 'Contacto' }).click();
    await expect(infoDialog).toContainText(company.email);
    await infoDialog.getByRole('button', { name: 'Cerrar' }).click();

    row = tableRow(page, 'Listado de empresas', company.cuit);
    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar empresa' });
    await dialog.getByLabel('Razón social *').fill(company.razonSocialEditada);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Registro actualizado correctamente.');

    row = tableRow(page, 'Listado de empresas', company.cuit);
    await expect(row).toContainText(company.razonSocialEditada);
    await row.getByTitle('Dar de baja').click();
    let stateDialog = page.getByRole('dialog').filter({ hasText: /Dar de baja.*empresa/i });
    await stateDialog.getByLabel('Motivo de baja *').fill('BAJA E2E DE EMPRESA');
    await stateDialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expectToast(page, 'Registro dado de baja correctamente.');

    await page.getByRole('tab', { name: 'Bajas' }).click();
    row = tableRow(page, 'Listado de empresas', company.cuit);
    await row.getByTitle('Reactivar').click();
    stateDialog = page.getByRole('dialog').filter({ hasText: /Reactivar empresa/i });
    await stateDialog.getByRole('button', { name: 'Reactivar' }).click();
    await expectToast(page, 'Registro reactivado correctamente.');

    await page.getByRole('tab', { name: 'Activos' }).click();
    row = tableRow(page, 'Listado de empresas', company.cuit);
    await permanentDeleteCurrentPartner(page, row);
    await expect(tableRow(page, 'Listado de empresas', company.cuit)).toHaveCount(0);
  });

  test('crea, consulta, edita, da de baja y reactiva una familia', async ({ page, request }) => {
    cleanupFamilyByPrefix(family.prefix);
    await cleanupSocioByDocument(request, {
      tipo: 'PERSONA',
      documento: familyMember.dni,
    });

    await apiCall(request, 'socios_guardar', {
      method: 'POST',
      data: {
        tipo_socio: 'PERSONA',
        apellido: familyMember.apellido,
        nombre: familyMember.nombre,
        dni: familyMember.dni,
        fecha_alta: todayIso(),
        telefono: familyMember.telefono,
        email: familyMember.email,
        id_categoria: null,
        id_medio_pago: null,
        id_condicion_iva: null,
        enviar_recordatorio: true,
        observaciones: 'INTEGRANTE PARA PRUEBA DE FAMILIAS',
      },
    });

    await page.goto('/socios/familias');
    await page.getByRole('tab', { name: 'Activas' }).click();
    await expect(page.getByRole('heading', { name: 'Familias' })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva familia' }).click();

    let dialog = page.getByRole('dialog', { name: 'Nueva familia' });
    await dialog.getByRole('button', { name: 'Crear familia' }).click();
    await expectToast(page, 'Completá el nombre de la familia.');
    await dismissPersistentToast(page);
    await dialog.getByLabel('Nombre de la familia *').fill(family.nombre);
    await dialog.getByLabel('Descripción').fill(family.descripcion);
    await dialog.getByRole('button', { name: 'Crear familia' }).click();
    await expectToast(page, 'Seleccioná al menos un integrante para la familia.');
    await dismissPersistentToast(page);

    await expect(dialog.getByRole('tab', { name: 'Integrantes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await dialog
      .getByLabel('Buscar socio por nombre, DNI o categoría')
      .fill(familyMember.dni);
    const memberCheckbox = dialog.getByRole('checkbox', {
      name: new RegExp(familyMember.apellido, 'i'),
    });
    await memberCheckbox.check();
    await dialog.getByRole('button', { name: /Agregar miembros \(1\)/ }).click();
    const selectedMember = dialog.locator('.familias-selected-member').filter({
      hasText: familyMember.apellido,
    });
    await expect(selectedMember).toBeVisible();
    await selectedMember.getByRole('radio', { name: 'Titular' }).check();
    await selectedMember.getByPlaceholder('Parentesco').fill('TITULAR');
    await selectedMember.getByPlaceholder('Observaciones').fill('VÍNCULO E2E');
    await dialog.getByRole('button', { name: 'Crear familia' }).click();
    await expectToast(page, 'Familia creada correctamente.');

    const search = page.getByRole('textbox', { name: 'Búsqueda', exact: true });
    await search.fill(family.prefix);
    let row = tableRow(page, 'Listado de familias', family.prefix);
    await expect(row).toContainText(familyMember.apellido);
    await expect(row).toContainText('ACTIVA');

    await row.getByTitle('Ver integrantes e historial').click();
    let infoDialog = page.getByRole('dialog', { name: 'Ficha de la familia' });
    await expect(infoDialog).toContainText(familyMember.apellido);
    await infoDialog.getByRole('tab', { name: 'Historial' }).click();
    await expect(infoDialog).toContainText(familyMember.apellido);
    await infoDialog.getByRole('button', { name: 'Cerrar' }).click();

    row = tableRow(page, 'Listado de familias', family.prefix);
    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar familia' });
    await dialog.getByLabel('Nombre de la familia *').fill(family.nombreEditado);
    await dialog.getByLabel('Descripción').fill(`${family.descripcion} EDITADA`);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Familia actualizada correctamente.');

    await search.fill(family.nombreEditado);
    row = tableRow(page, 'Listado de familias', family.nombreEditado);
    await row.getByTitle('Dar de baja').click();
    let stateDialog = page.getByRole('dialog', { name: 'Dar de baja la familia' });
    await stateDialog.getByLabel('Motivo de baja *').fill('BAJA AUTOMÁTICA DE FAMILIA');
    await stateDialog.getByLabel('Fecha de baja *').fill(todayIso());
    await stateDialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expectToast(page, 'Familia dada de baja correctamente.');

    await page.getByRole('tab', { name: 'Bajas' }).click();
    row = tableRow(page, 'Listado de familias', family.nombreEditado);
    await expect(row).toContainText('BAJA');
    await row.getByTitle('Reactivar').click();
    stateDialog = page.getByRole('dialog', { name: 'Reactivar familia' });
    await stateDialog.getByRole('button', { name: 'Reactivar' }).click();
    await expectToast(page, 'Familia reactivada correctamente.');

    await page.getByRole('tab', { name: 'Activas' }).click();
    await expect(tableRow(page, 'Listado de familias', family.nombreEditado)).toBeVisible();

    cleanupFamilyByPrefix(family.prefix);
    await cleanupSocioByDocument(request, {
      tipo: 'PERSONA',
      documento: familyMember.dni,
    });
  });
});
