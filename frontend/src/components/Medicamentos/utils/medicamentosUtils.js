// La aplicación de LALCEC utiliza Argentina/Córdoba en PHP. Un usuario
// con el equipo en otro huso horario debe ver los mismos vencimientos.
const fechaArgentina = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const fechaHoy = () => {
  const parts = Object.fromEntries(fechaArgentina.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export const dinero = (num) => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS' }).format(Number(num || 0));
export const fecha = (value) => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
export const num = (value) => Number(value || 0);
export const MED_TIPOS = {
  INGRESO_DONACION:'Ingreso por donación', INGRESO_COMPRA:'Ingreso por compra', INGRESO_INICIAL:'Stock inicial',
  ENTREGA_PRESTAMO:'Préstamo', ENTREGA_DONACION:'Entrega sin cargo', SALIDA_VENTA:'Venta',
  DEVOLUCION_A_CUARENTENA:'Devolución anterior', DEVOLUCION_LIBERADA:'Devolución registrada', DEVOLUCION_DESCARTADA:'Devolución anterior no incorporada',
  AJUSTE_ENTRADA:'Ajuste positivo',AJUSTE_SALIDA:'Ajuste negativo',BAJA_VENCIMIENTO:'Baja por vencimiento',BAJA_DESCARTE:'Descarte',PASE_CUARENTENA:'Liberación de cuarentena',
};
