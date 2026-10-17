import { apiGet, apiPost } from '../../_shared/api/apiClient';

// La misma clave se reutiliza al reintentar una petición cuya respuesta se perdió.
// Solo al confirmar la respuesta se libera; la siguiente operación recibe otra clave.
// Se mantiene por acción y contenido para no confundir dos formularios distintos.
const pendientes = new Map();
const nuevaClave = () => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `med-${uuid}`;
};

async function escritura(accion, datos = {}) {
  const { _idempotency_key: claveExplicita, ...contenido } = datos;
  const huella = JSON.stringify(contenido);
  const anterior = pendientes.get(accion);
  const clave = claveExplicita || (anterior?.huella === huella ? anterior.clave : nuevaClave());
  // Se conserva la clave mientras la petición no haya recibido una respuesta exitosa.
  pendientes.set(accion, { huella, clave });
  const resultado = await apiPost(accion, { ...contenido, _idempotency_key: clave });
  if (pendientes.get(accion)?.clave === clave) pendientes.delete(accion);
  return resultado;
}

export const medicamentosApi = {
  alertas: (params) => apiGet('medicamentos_alertas', params),
  descartarAlerta: (data) => apiPost('medicamentos_descartar_alerta', data),
  catalogo: () => apiGet('medicamentos_catalogo'),
  lotes: (params) => apiGet('medicamentos_lotes', params),
  historial: (params) => apiGet('medicamentos_historial', params),
  prestamos: (params) => apiGet('medicamentos_prestamos', params),
  prestamoDetalle: (id) => apiGet('medicamentos_prestamo_detalle', { id }),
  socios: (buscar) => apiGet('medicamentos_socios', { buscar }),
  procedencias: (buscar) => apiGet('medicamentos_procedencias', { buscar }),
  medios: () => apiGet('medicamentos_medios'),
  guardar: (data) => escritura('medicamentos_guardar', data),
  cambiarEstado: (data) => escritura('medicamentos_cambiar_estado', data),
  ingresar: (data) => escritura('medicamentos_ingresar', data),
  salida: (data) => escritura('medicamentos_salida', data),
  anular: (data) => escritura('medicamentos_anular', data),
  revisarLote: (data) => escritura('medicamentos_revisar_lote', data),
  prestar: (data) => escritura('medicamentos_prestar', data),
  devolver: (data) => escritura('medicamentos_devolver', data),
  cerrar: (data) => escritura('medicamentos_cerrar', data),
  sena: (data) => escritura('medicamentos_sena', data),
};
