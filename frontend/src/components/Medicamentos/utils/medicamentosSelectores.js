import { fechaHoy } from './medicamentosUtils';

/** Opciones VISIBLES por contexto en Banco de Drogas; no altera catálogos compartidos.
 * Misma lista que MedicamentosOpciones::PRESENTACIONES_* en el backend. */
export const PRESENTACIONES_SECTOR = Object.freeze({
  MEDICAMENTOS: ['COMPRIMIDOS', 'INYECTABLES', 'GOTAS', 'CREMAS', 'OTRAS/OS'],
  DOLOR: ['JARABE', 'CONCENTRADO', 'DOBLE CONCENTRADO', 'AMITRIPTILINA'],
});
/** Presentaciones fijas: no se renombran, dan de baja ni eliminan desde Configuración. */
export const PRESENTACIONES_FIJAS = Object.freeze([...PRESENTACIONES_SECTOR.MEDICAMENTOS, ...PRESENTACIONES_SECTOR.DOLOR]);
export const sectorDePresentacion = valor => PRESENTACIONES_SECTOR.DOLOR.includes(valor) ? 'DOLOR' : 'MEDICAMENTOS';

/** Trello: al elegir Comprimidos o Inyectables la unidad de dosis se completa con MG. */
export const PRESENTACIONES_CON_MG = Object.freeze(['COMPRIMIDOS', 'INYECTABLES']);
export const unidadDosisInicial = presentacion => PRESENTACIONES_CON_MG.includes(presentacion) ? 'MG' : '';
/** Al cambiar de presentación: MG para comprimidos/inyectables; para el resto se
 * quita solo el MG automático y se respeta una unidad escrita a mano (ML, G, %...). */
export const unidadDosisAlCambiar = (presentacion, unidadActual) => {
  if (PRESENTACIONES_CON_MG.includes(presentacion)) return 'MG';
  return String(unidadActual || '').trim().toUpperCase() === 'MG' ? '' : (unidadActual || '');
};

export const soloOrigenesTrello = catalogos => (catalogos || []).filter(o =>
  o.tipo === 'ORIGEN_INGRESO' && Number(o.activo) === 1 && ['DONACION', 'COMPRA'].includes(o.codigo_sistema));

export const SALIDAS_TRELLO = Object.freeze({
  ENTREGA_DONACION: 'ENTREGA SIN CARGO',
  BAJA_DESCARTE: 'DESCARTE POR VENCIMIENTO',
  AJUSTE_SALIDA: 'AJUSTE POR ERROR DE CARGA',
});
/** Mismo criterio que el backend: el descarte por vencimiento exige stock vencido
 * (o sin fecha, que tampoco puede entregarse). "Vence hoy" todavía se entrega. */
export const descartablePorVencimiento = fechaVence => !fechaVence || String(fechaVence).slice(0, 10) < fechaHoy();
/**
 * Motivos visibles al restar stock:
 * - Entrega sin cargo: solo con vencimiento vigente.
 * - Descarte por vencimiento: solo vencido o sin fecha.
 * - Ajuste por error de carga: siempre (exige explicar el motivo).
 */
export const soloSalidasTrello = (catalogos, entregable, descartable = true) => (catalogos || []).filter(o =>
  o.tipo === 'SALIDA_STOCK' && Number(o.activo) === 1 &&
  Object.prototype.hasOwnProperty.call(SALIDAS_TRELLO, o.codigo_sistema) &&
  (entregable || o.codigo_sistema !== 'ENTREGA_DONACION') &&
  (descartable || o.codigo_sistema !== 'BAJA_DESCARTE'));

export const normalizarMedio = nombre => String(nombre || '').trim().toLocaleUpperCase('es-AR');
export const medioEfectivo = medios => (medios || []).find(m => normalizarMedio(m.nombre) === 'EFECTIVO');
