/** Distribución FEFO idéntica a la regla validada en el backend.
 * No modifica el stock: sólo anticipa qué lotes usará una salida.
 */
export function distribuirEgreso(lotes, tipo, cantidad, hoy) {
  const requiereVigente = ['ENTREGA_DONACION', 'SALIDA_VENTA'].includes(tipo);
  const opciones = lotes.filter(l => l.estado !== 'DESCARTADO'
    && (requiereVigente ? l.estado === 'ACTIVO' && l.fecha_vencimiento >= hoy : tipo === 'BAJA_VENCIMIENTO' ? l.fecha_vencimiento < hoy : true)
    && Number(l.cantidad_disponible || 0) > 0)
    .sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)) || Number(a.id_lote) - Number(b.id_lote));
  let faltan = cantidad;
  const distribucion = [];
  for (const lote of opciones) {
    const unidades = Math.min(faltan, Number(lote.cantidad_disponible || 0));
    if (unidades > 0) distribucion.push({ lote, unidades });
    faltan -= unidades;
    if (faltan <= 0) break;
  }
  return { distribucion, disponibles: opciones.reduce((total, l) => total + Number(l.cantidad_disponible || 0), 0), suficiente: faltan <= 0 };
}

