const { expect } = require('@playwright/test');
const { apiCall, apiResult } = require('./api.helper');
const { todayIso, uniqueSuffix } = require('./data.helper');
const { personData } = require('../fixtures/socios.fixture');
const { createPerson } = require('./entities.helper');

const futureIso = (days = 365) => {
  // Para la fecha de vencimiento no dependemos de un día fijo del calendario.
  const [y,m,d] = todayIso().split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d+days)).toISOString().slice(0,10);
};

function medFixture(overrides = {}) {
  const suffix = uniqueSuffix();
  return {
    nombre_comercial: `PW E2E MED ${suffix}`,
    droga: `DROGA E2E ${suffix}`,
    laboratorio: 'LABORATORIO PLAYWRIGHT',
    presentacion: 'COMPRIMIDOS',
    dosis: '500 MG',
    unidad_stock: 'UNIDAD',
    // El backend actual exige vencimiento cuando el alta incluye stock.
    fecha_vencimiento: futureIso(365),
    observaciones: 'MEDICAMENTO EXCLUSIVO DE PLAYWRIGHT',
    ...overrides,
  };
}

function entryFixture(overrides = {}) {
  return {
    origen: 'DONACION',
    cantidad: 12,
    fecha_ingreso: todayIso(),
    procedencia: `PW E2E PROVEEDOR ${uniqueSuffix()}`,
    observaciones: 'INGRESO EXCLUSIVO DE PLAYWRIGHT',
    ...overrides,
  };
}

async function medioPago(request) {
  const result = await apiCall(request, 'medicamentos_medios');
  const medio = result.registros?.[0];
  expect(medio, 'Debe existir un medio de pago activo para ejecutar el testing de Medicamentos').toBeTruthy();
  return Number(medio.id_medio_pago);
}

const accountingNames = {
  'CATEGORIA_EGRESO': ['COMPRA DE MEDICAMENTOS', 'DEVOLUCIONES DE SEÑAS', 'DEVOLUCIONES DE VENTAS DE MEDICAMENTOS'],
  'CONCEPTO_EGRESO': ['COMPRA DE MEDICAMENTOS', 'DEVOLUCIÓN DE SEÑA', 'DEVOLUCIÓN DE VENTA DE MEDICAMENTOS'],
  'CATEGORIA_INGRESO': ['VENTA DE MEDICAMENTOS', 'SEÑAS DE MEDICAMENTOS', 'REINTEGROS DE COMPRAS DE MEDICAMENTOS'],
  'CONCEPTO_INGRESO': ['VENTA DE MEDICAMENTOS', 'COBRO DE SEÑA', 'REINTEGRO DE COMPRA DE MEDICAMENTOS'],
};

async function requireAccountingOptions(request, use) {
  // MySQL usa una intercalación insensible a mayúsculas/acentos para estas
  // opciones: la precondición debe comparar con el mismo criterio lógico.
  const key = value => String(value || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Una transacción de Medicamentos puede crear nuevas opciones de Contabilidad.
  // Si faltan, NO ejecutamos escrituras económicas en una DB compartida: esa
  // creación no sería fixture E2E y el snapshot de datos reales se alteraría.
  const catalogs = await apiCall(request, 'contable_opciones_configuracion');
  const missing = [];
  for (const [type, wanted] of Object.entries(use)) {
    const existing = new Set((catalogs.listas?.[type] || []).map(x => key(x.nombre)));
    for (const name of wanted) if (!existing.has(key(name))) missing.push(`${type}: ${name}`);
  }
  if (!missing.length) return;

  // Las categorías/conceptos automáticos son nombres fijos del módulo, no
  // etiquetas PW E2E. El fixture protegido registra propiedad de las opciones
  // que NO existían, y el cleanup las elimina solo si no fueron usadas por
  // movimientos reales. No se modifica ninguna opción preexistente.
  await apiCall(request, 'e2e_medicamentos_contable_fixture', {
    method: 'POST',
    data: {
      confirmacion: 'LIMPIAR_PLAYWRIGHT',
      opciones: missing.map(item => {
        const index = item.indexOf(': ');
        return { tipo: item.slice(0, index), nombre: item.slice(index + 2) };
      }),
    },
  });
  const after = await apiCall(request, 'contable_opciones_configuracion');
  for (const [type, wanted] of Object.entries(use)) {
    const existing = new Set((after.listas?.[type] || []).map(x => key(x.nombre)));
    for (const name of wanted) {
      expect(existing.has(key(name)), `No quedó preparada la opción ${type}: ${name}`).toBe(true);
    }
  }
}

async function createMedicine(request, { medicine = medFixture(), first = entryFixture() } = {}) {
  const result = await apiCall(request, 'medicamentos_guardar', {
    method: 'POST',
    data: { ...medicine, ingreso_inicial: first },
  });
  const id = Number(result.id_medicamento);
  expect(id).toBeGreaterThan(0);
  return { id, medicine, first };
}

async function stockOf(request, id) {
  const catalog = await apiCall(request, 'medicamentos_catalogo');
  const row = (catalog.registros || []).find(m => Number(m.id_medicamento) === Number(id));
  expect(row, `El medicamento E2E #${id} no aparece en el catálogo`).toBeTruthy();
  return row;
}

async function movementsOf(request, id) {
  const hist = await apiCall(request, 'medicamentos_historial', {params: {id_medicamento: id}});
  return hist.registros || [];
}

async function createBorrower(request) {
  const person = personData();
  const row = await createPerson(request, person);
  const id = Number(row.id_socio);
  expect(id).toBeGreaterThan(0);
  return { id, person };
}

async function assertError(request, action, data, matcher = /./) {
  const result = await apiResult(request, action, { method:'POST', data });
  expect(result.ok, `Se esperaba error en ${action}, se recibió HTTP ${result.status}`).toBe(false);
  expect(result.status).toBeGreaterThanOrEqual(400);
  expect(result.status).toBeLessThan(500);
  if (matcher) expect(String(result.body?.mensaje || result.body?.error || '')).toMatch(matcher);
  return result;
}

module.exports = {
  futureIso, medFixture, entryFixture, medioPago, accountingNames, requireAccountingOptions,
  createMedicine, createBorrower, stockOf, movementsOf, assertError,
};
