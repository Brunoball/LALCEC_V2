const { randomUUID } = require('node:crypto');
const { test, expect } = require('./fixtures/auth.fixture');
const { apiCall, apiResult } = require('./helpers/api.helper');
const {
  createMedicine, entryFixture, createBorrower, requireAccountingOptions,
  stockOf, movementsOf, assertError, loanPeople,
} = require('./helpers/medicamentos.helper');

const key = () => `med-PWE2E-${randomUUID()}`;
const cents = x => Math.round(Number(x) * 100);
const loanDetail = (request, id) => apiCall(request, 'medicamentos_prestamo_detalle', { params: { id } });
const pendingOf = (detail, idMed) => {
  const row = detail.detalle.find(d => Number(d.id_medicamento) === Number(idMed));
  return Number(row.cantidad_entregada) - Number(row.cantidad_recibida);
};
const lineOf = (detail, idMed) => detail.detalle.find(d => Number(d.id_medicamento) === Number(idMed));

/** Préstamo manual (paciente + quien retira) con tres medicamentos E2E distintos. */
async function threeMedicineLoan(request, quantities = [3, 5, 2], extra = {}) {
  const meds = [];
  for (const q of quantities) meds.push(await createMedicine(request, { first: entryFixture({ cantidad: q + 4 }) }));
  const people = loanPeople();
  const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: {
    ...people, items: meds.map((m, i) => ({ id_medicamento: m.id, cantidad: quantities[i] })), sena: '0', ...extra,
  } });
  const detail = await loanDetail(request, loan.id_prestamo);
  return { meds, people, id: Number(loan.id_prestamo), detail };
}

test.describe('Medicamentos: devolución de varios medicamentos en una sola operación', () => {
  test('API: devuelve tres medicamentos juntos; stock, pendientes, movimientos e historial por medicamento', async ({ request }) => {
    const { meds, id, detail } = await threeMedicineLoan(request);
    // Cada medicamento quedó con +4 en stock luego del préstamo.
    for (const m of meds) expect(Number((await stockOf(request, m.id)).stock_actual)).toBe(4);
    const items = meds.map((m, i) => ({ id_detalle_prestamo: Number(lineOf(detail, m.id).id_detalle_prestamo), cantidad: [3, 2, 2][i] }));
    const result = await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: {
      id_prestamo: id, items, observaciones: 'PW E2E DEVOLUCION CONJUNTA',
    } });
    expect(result.id_devoluciones).toHaveLength(3);
    expect(Number(result.unidades_devueltas)).toBe(7);

    const after = await loanDetail(request, id);
    expect(pendingOf(after, meds[0].id)).toBe(0);
    expect(pendingOf(after, meds[1].id)).toBe(3);
    expect(pendingOf(after, meds[2].id)).toBe(0);
    expect(Number((await stockOf(request, meds[0].id)).stock_actual)).toBe(7);
    expect(Number((await stockOf(request, meds[1].id)).stock_actual)).toBe(6);
    expect(Number((await stockOf(request, meds[2].id)).stock_actual)).toBe(6);

    // Una devolución y un movimiento de inventario por medicamento, enlazados entre sí.
    expect(after.devoluciones).toHaveLength(3);
    for (const [i, m] of meds.entries()) {
      const dev = after.devoluciones.find(r => Number(r.id_medicamento) === m.id);
      expect(dev.nombre_comercial).toBe(m.medicine.nombre_comercial);
      expect(Number(dev.cantidad)).toBe([3, 2, 2][i]);
      const mov = (await movementsOf(request, m.id)).filter(x => x.tipo === 'DEVOLUCION_LIBERADA');
      expect(mov).toHaveLength(1);
      expect(Number(mov[0].id_devolucion)).toBe(Number(dev.id_devolucion));
      expect(Number(mov[0].cantidad)).toBe([3, 2, 2][i]);
    }
  });

  test('API: devoluciones parciales de varios medicamentos y luego el resto', async ({ request }) => {
    const { meds, id, detail } = await threeMedicineLoan(request, [4, 4, 4]);
    const det = m => Number(lineOf(detail, m.id).id_detalle_prestamo);
    await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: { id_prestamo: id,
      items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 1 }, { id_detalle_prestamo: det(meds[1]), cantidad: 3 }] } });
    let after = await loanDetail(request, id);
    expect([pendingOf(after, meds[0].id), pendingOf(after, meds[1].id), pendingOf(after, meds[2].id)]).toEqual([3, 1, 4]);
    await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: { id_prestamo: id,
      items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 3 }, { id_detalle_prestamo: det(meds[1]), cantidad: 1 }, { id_detalle_prestamo: det(meds[2]), cantidad: 4 }] } });
    after = await loanDetail(request, id);
    expect(after.detalle.every(d => Number(d.cantidad_entregada) === Number(d.cantidad_recibida))).toBe(true);
    for (const m of meds) expect(Number((await stockOf(request, m.id)).stock_actual)).toBe(8);
    // Sin pendientes, cualquier nueva devolución se rechaza.
    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 1 }] }, /supera/i);
  });

  test('API: si un renglón es inválido no se guarda ninguno (exceso, duplicado, cantidades, préstamo ajeno o cerrado)', async ({ request }) => {
    const { meds, id, detail } = await threeMedicineLoan(request, [2, 2, 2]);
    const other = await threeMedicineLoan(request, [1, 1, 1]);
    const det = m => Number(lineOf(detail, m.id).id_detalle_prestamo);
    const snapshot = async () => ({
      stocks: await Promise.all(meds.map(async m => Number((await stockOf(request, m.id)).stock_actual))),
      devoluciones: (await loanDetail(request, id)).devoluciones.length,
    });
    const before = await snapshot();

    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [
      { id_detalle_prestamo: det(meds[0]), cantidad: 2 }, { id_detalle_prestamo: det(meds[1]), cantidad: 3 },
    ] }, /supera/i);
    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [
      { id_detalle_prestamo: det(meds[0]), cantidad: 1 }, { id_detalle_prestamo: det(meds[0]), cantidad: 1 },
    ] }, /repitas|mismo medicamento/i);
    for (const cantidad of [0, -1, 1.5, '1.5', 'abc'])
      await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [
        { id_detalle_prestamo: det(meds[2]), cantidad: 1 }, { id_detalle_prestamo: det(meds[0]), cantidad },
      ] }, /cantidad|entero/i);
    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [] }, /al menos un medicamento/i);
    const foreign = await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [
      { id_detalle_prestamo: det(meds[0]), cantidad: 1 },
      { id_detalle_prestamo: Number(other.detail.detalle[0].id_detalle_prestamo), cantidad: 1 },
    ] }, /no pertenece/i);
    expect(foreign.body.codigo).toBe('DETALLE_AJENO');
    expect(await snapshot()).toEqual(before);
    expect((await loanDetail(request, other.id)).devoluciones).toHaveLength(0);

    await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: { id_prestamo: id } });
    await assertError(request, 'medicamentos_devolver', { id_prestamo: id, items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 1 }] }, /no abierto/i);
    expect(await snapshot()).toEqual(before);
  });

  test('API: idempotencia de la devolución múltiple y compatibilidad con el formato individual', async ({ request }) => {
    const { meds, id, detail } = await threeMedicineLoan(request, [3, 3, 3]);
    const det = m => Number(lineOf(detail, m.id).id_detalle_prestamo);
    const body = { id_prestamo: id, items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 1 }, { id_detalle_prestamo: det(meds[1]), cantidad: 2 }], _idempotency_key: key() };
    const [a, b] = await Promise.all([
      apiResult(request, 'medicamentos_devolver', { method: 'POST', data: body }),
      apiResult(request, 'medicamentos_devolver', { method: 'POST', data: body }),
    ]);
    expect(a.ok, JSON.stringify(a.body)).toBe(true);
    expect(b.ok, JSON.stringify(b.body)).toBe(true);
    expect(a.body.id_devoluciones).toEqual(b.body.id_devoluciones);
    const retry = await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: { ...body } });
    expect(retry.id_devoluciones).toEqual(a.body.id_devoluciones);
    const conflict = await apiResult(request, 'medicamentos_devolver', { method: 'POST', data: { ...body, items: [{ id_detalle_prestamo: det(meds[0]), cantidad: 2 }] } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.codigo).toBe('IDEMPOTENCY_CONFLICT');
    expect((await loanDetail(request, id)).devoluciones).toHaveLength(2);
    expect(Number((await stockOf(request, meds[0].id)).stock_actual)).toBe(5);
    expect(Number((await stockOf(request, meds[1].id)).stock_actual)).toBe(6);

    // Formato individual histórico.
    const single = await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: { id_detalle_prestamo: det(meds[2]), cantidad: 1 } });
    expect(Number(single.id_devolucion)).toBeGreaterThan(0);
    expect(pendingOf(await loanDetail(request, id), meds[2].id)).toBe(2);
  });

  test('escudo E2E: la devolución múltiple no puede tocar renglones de préstamos reales', async ({ request }) => {
    const { meds, id, detail } = await threeMedicineLoan(request, [1, 1, 1]);
    // Solo lectura: se busca un préstamo real existente para intentar mezclarlo.
    // Un préstamo con algún medicamento no E2E nunca pertenece al conjunto de pruebas.
    const list = await apiCall(request, 'medicamentos_prestamos', { params: { estado: 'ABIERTO' } });
    let real = null; let realDetail = null;
    for (const candidate of (list.registros || []).slice(0, 20)) {
      const data = await loanDetail(request, candidate.id_prestamo);
      if (data.detalle.some(d => !/^PW (E2E|EE) /i.test(String(d.nombre_comercial || '')))) { real = candidate; realDetail = data; break; }
    }
    if (!real) {
      // Sin datos reales no hay nada que proteger; se deja constancia en el reporte.
      test.info().annotations.push({ type: 'sin-datos-reales', description: 'No hay préstamos reales abiertos para verificar el bloqueo.' });
      return;
    }
    const blocked = await apiResult(request, 'medicamentos_devolver', { method: 'POST', data: { id_prestamo: id, items: [
      { id_detalle_prestamo: Number(lineOf(detail, meds[0].id).id_detalle_prestamo), cantidad: 1 },
      { id_detalle_prestamo: Number(realDetail.detalle[0].id_detalle_prestamo), cantidad: 1 },
    ] } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.codigo).toBe('E2E_SCOPE_BLOCKED');
    expect((await loanDetail(request, real.id_prestamo)).devoluciones).toHaveLength(realDetail.devoluciones.length);
  });
});

test.describe('Medicamentos: paciente, persona que retira y seña pendiente', () => {
  test('API: datos manuales obligatorios, validados y persistidos como texto; préstamos con socio siguen funcionando', async ({ request }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 6 }) });
    const items = [{ id_medicamento: fx.id, cantidad: 1 }];
    const base = loanPeople();
    for (const [campo, matcher] of [['paciente_nombre', /paciente/i], ['paciente_dni', /DNI del paciente/i],
      ['dni_receptor', /DNI de quien retira/i], ['celular_receptor', /celular/i]])
      await assertError(request, 'medicamentos_prestar', { ...base, [campo]: '', items, sena: '0' }, matcher);
    await assertError(request, 'medicamentos_prestar', { ...base, paciente_dni: '12', items, sena: '0' }, /DNI del paciente/i);
    await assertError(request, 'medicamentos_prestar', { ...base, celular_receptor: 'llamar', items, sena: '0' }, /celular/i);
    expect(Number((await stockOf(request, fx.id)).stock_actual)).toBe(6);

    const people = loanPeople({ paciente_dni: '00.123.456', dni_receptor: 'AB-123456', celular_receptor: '(0351) 15-555-0101' });
    const loan = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: { ...people, items, sena: '0' } });
    const { prestamo } = await loanDetail(request, loan.id_prestamo);
    expect(prestamo.id_socio).toBeNull();
    expect(prestamo.paciente_nombre).toBe(people.paciente_nombre);
    expect(prestamo.paciente_dni).toBe('00123456');
    expect(prestamo.dni_receptor).toBe('AB-123456');
    expect(prestamo.celular_receptor).toBe('(0351) 15-555-0101');
    const byPatient = await apiCall(request, 'medicamentos_prestamos', { params: { buscar: people.paciente_nombre } });
    expect(byPatient.registros.some(p => Number(p.id_prestamo) === Number(loan.id_prestamo))).toBe(true);

    // Compatibilidad: préstamo vinculado a socio (histórico/integraciones) sin datos nuevos.
    const socio = await createBorrower(request);
    const legacy = await apiCall(request, 'medicamentos_prestar', { method: 'POST', data: { id_socio: socio.id, items, sena: '0' } });
    const legacyDetail = await loanDetail(request, legacy.id_prestamo);
    expect(legacyDetail.prestamo.paciente_nombre ?? null).toBeNull();
    expect(Number(legacyDetail.prestamo.id_socio)).toBe(socio.id);
  });

  test('API: seña pendiente coincide en listado y detalle tras reintegro, devolución y donación al cerrar', async ({ request }) => {
    await requireAccountingOptions(request, {
      CATEGORIA_INGRESO: ['SEÑAS DE MEDICAMENTOS'], CONCEPTO_INGRESO: ['COBRO DE SEÑA'],
      CATEGORIA_EGRESO: ['DEVOLUCIONES DE SEÑAS'], CONCEPTO_EGRESO: ['DEVOLUCIÓN DE SEÑA'],
    });
    const { meds, id, people, detail } = await threeMedicineLoan(request, [1, 1, 1], { sena: '100.00' });
    const row = async () => (await apiCall(request, 'medicamentos_prestamos', { params: { buscar: people.nombre_receptor } }))
      .registros.find(p => Number(p.id_prestamo) === id);
    expect(cents((await row()).sena_pendiente)).toBe(10000);
    // Sin medio informado el reintegro usa EFECTIVO automáticamente.
    await apiCall(request, 'medicamentos_sena', { method: 'POST', data: { id_prestamo: id, tipo: 'DEVOLUCION_SENA', monto: '30.00' } });
    // Devolver medicamentos no reintegra dinero.
    await apiCall(request, 'medicamentos_devolver', { method: 'POST', data: { id_prestamo: id,
      items: meds.map(m => ({ id_detalle_prestamo: Number(lineOf(detail, m.id).id_detalle_prestamo), cantidad: 1 })) } });
    expect(cents((await row()).sena_pendiente)).toBe(7000);
    expect(cents((await loanDetail(request, id)).prestamo.sena_pendiente)).toBe(7000);
    const closed = await apiCall(request, 'medicamentos_cerrar', { method: 'POST', data: { id_prestamo: id } });
    expect(cents(closed.sena_donada)).toBe(7000);
    const final = await loanDetail(request, id);
    expect(final.senas.filter(s => s.tipo === 'SENA_DONADA')).toHaveLength(1);
    expect(final.senas.filter(s => s.tipo === 'DEVOLUCION_SENA')).toHaveLength(1);
    expect(String(final.senas.find(s => s.tipo === 'DEVOLUCION_SENA').medio_pago).toUpperCase()).toBe('EFECTIVO');
    expect(cents(final.prestamo.sena_pendiente)).toBe(0);
    const listed = await row();
    expect(cents(listed.sena_cobrada) - cents(listed.sena_devuelta) - cents(listed.sena_donada)).toBe(0);
  });
});

test.describe('Medicamentos: UI de devoluciones múltiples y títulos por persona', () => {
  test('UI: agrega filas, evita duplicados, completa todo y registra en una sola operación', async ({ request, page }) => {
    const { meds, id, people, detail } = await threeMedicineLoan(request, [3, 5, 2]);
    const persona = `${people.apellido_receptor}, ${people.nombre_receptor}`;
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('textbox', { name: 'Búsqueda' }).fill(people.nombre_receptor);
    const row = page.getByRole('table', { name: 'Préstamos de medicamentos' }).getByRole('row').filter({ hasText: people.nombre_receptor });
    await expect(row).toContainText('Sin seña');
    await row.getByRole('button', { name: 'Registrar devolución de medicamentos' }).click();

    const modal = page.getByRole('dialog', { name: /Registrar devolución de medicamentos/ });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(persona);
    const filas = modal.locator('.med-loan-return__row');
    await expect(filas).toHaveCount(1);
    const primera = filas.nth(0).getByLabel(/Medicamento devuelto 1/);
    // Solo los tres medicamentos del préstamo (más la opción vacía), con nombre y pendientes.
    await expect(primera.locator('option')).toHaveCount(4);
    await expect(primera.locator('option').filter({ hasText: meds[1].medicine.nombre_comercial })).toContainText(/5 PENDIENTES/i);
    const registrar = modal.getByRole('button', { name: 'Registrar devolución' });
    await expect(registrar).toBeDisabled();
    await filas.nth(0).getByLabel(/Cantidad/).fill('9');
    await expect(modal.getByText(/Supera las unidades pendientes/)).toBeVisible();
    await expect(registrar).toBeDisabled();
    await filas.nth(0).getByLabel(/Cantidad/).fill('1');
    await expect(registrar).toBeEnabled();

    await modal.getByRole('button', { name: 'Agregar otro medicamento' }).click();
    await expect(filas).toHaveCount(2);
    const elegido = await primera.inputValue();
    await expect(filas.nth(1).getByLabel(/Medicamento devuelto 2/).locator(`option[value="${elegido}"]`)).toHaveCount(0);
    await expect(registrar).toBeDisabled(); // segunda fila sin cantidad
    await filas.nth(1).getByRole('button', { name: /Quitar medicamento 2/ }).click();
    await expect(filas).toHaveCount(1);

    await modal.getByRole('button', { name: 'Devolver todos los pendientes' }).click();
    await expect(filas).toHaveCount(3);
    await expect(modal.getByRole('button', { name: 'Agregar otro medicamento' })).toBeDisabled();
    // Devolución parcial de uno de los medicamentos.
    const idDetalleB = String(lineOf(detail, meds[1].id).id_detalle_prestamo);
    let indiceB = -1;
    for (let i = 0; i < 3; i += 1) {
      if (await filas.nth(i).getByLabel(/Medicamento devuelto/).inputValue() === idDetalleB) indiceB = i;
    }
    expect(indiceB).toBeGreaterThanOrEqual(0);
    await expect(filas.nth(indiceB).getByLabel(/Cantidad/)).toHaveValue('5');
    await filas.nth(indiceB).getByLabel(/Cantidad/).fill('2');
    await registrar.click();
    await expect(modal).not.toBeVisible();

    const after = await loanDetail(request, id);
    expect([pendingOf(after, meds[0].id), pendingOf(after, meds[1].id), pendingOf(after, meds[2].id)]).toEqual([0, 3, 0]);
    expect(after.devoluciones).toHaveLength(3);
    expect(Number((await stockOf(request, meds[0].id)).stock_actual)).toBe(7);
    expect(Number((await stockOf(request, meds[1].id)).stock_actual)).toBe(6);
    expect(Number((await stockOf(request, meds[2].id)).stock_actual)).toBe(6);

    // Detalle: título con Apellido, Nombre; el número queda como dato secundario.
    await row.getByRole('button', { name: 'Ver información del préstamo' }).click();
    const info = page.getByRole('dialog', { name: new RegExp(persona.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await expect(info).toBeVisible();
    await expect(info.getByRole('heading', { name: /^Préstamo #/ })).toHaveCount(0);
    await expect(info).toContainText(`Préstamo N.º ${id}`);
    await expect(info).toContainText(people.paciente_nombre);
    await expect(info).toContainText(`DNI: ${people.dni_receptor}`);
    const historial = info.locator('.med-loan-detail-return');
    await expect(historial).toHaveCount(3);
    await expect(historial.filter({ hasText: meds[1].medicine.nombre_comercial })).toContainText('2 unidades devueltas');
  });

  test('UI: alta con paciente y quien retira cargados a mano, sin checkbox de copia', async ({ request, page }) => {
    const fx = await createMedicine(request, { first: entryFixture({ cantidad: 3 }) });
    const people = loanPeople();
    await page.goto('/medicamentos/prestamos');
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    const modal = page.getByRole('dialog', { name: 'Registrar préstamo de medicamentos' });
    await expect(modal.getByLabel(/Medio de pago/)).toHaveCount(0);
    await expect(modal.getByText('Seña: únicamente en efectivo')).toBeVisible();
    await modal.getByLabel(/Nombre de quien retira/).fill(people.nombre_receptor);
    await modal.getByLabel(/Apellido de quien retira/).fill(people.apellido_receptor);
    await modal.getByLabel(/DNI de quien retira/).fill('30.111.222');
    await modal.getByLabel(/Celular de contacto/).fill('abc');
    await expect(modal.getByText(/El celular debe tener/)).toBeVisible();
    await modal.getByLabel(/Celular de contacto/).fill(people.celular_receptor);
    // Trello no pidió copiar datos entre personas: no existe el checkbox.
    await expect(modal.getByLabel('La persona que retira es el paciente')).toHaveCount(0);
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    await modal.getByLabel(/Nombre y apellido del paciente/).fill(people.paciente_nombre);
    await modal.getByLabel(/DNI del paciente/).fill('30.111.222');
    await modal.getByRole('tab', { name: 'Medicamentos' }).click();
    await modal.getByLabel('Medicamento 1 *').selectOption(String(fx.id));
    await modal.getByLabel('Cantidad *').fill('1');
    await modal.getByRole('button', { name: 'Registrar préstamo' }).click();
    await expect(modal).not.toBeVisible();

    const list = await apiCall(request, 'medicamentos_prestamos', { params: { buscar: people.nombre_receptor } });
    const created = list.registros.find(p => p.nombre_receptor === people.nombre_receptor);
    expect(created).toBeTruthy();
    expect(created.paciente_nombre).toBe(people.paciente_nombre);
    expect(created.paciente_dni).toBe('30111222');
    expect(created.dni_receptor).toBe('30111222');
    expect(created.celular_receptor).toBe(people.celular_receptor);
  });
});
