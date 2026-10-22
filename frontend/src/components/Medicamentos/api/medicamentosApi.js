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

// Ventana de reintento: un reintento legítimo tras perder la respuesta ocurre en
// segundos. Pasado este tiempo, una operación idéntica se considera NUEVA; así no
// se "absorbe" una entrega o venta real igual a otra anterior cuya respuesta se perdió.
export const VENTANA_REINTENTO_MS = 120_000;

async function escritura(accion, datos = {}) {
  const { _idempotency_key: claveExplicita, ...contenido } = datos;
  const huella = JSON.stringify(contenido);
  const anterior = pendientes.get(accion);
  const reutilizable = anterior?.huella === huella && Date.now() - anterior.creada < VENTANA_REINTENTO_MS;
  const clave = claveExplicita || (reutilizable ? anterior.clave : nuevaClave());
  // Se conserva la clave mientras la petición no haya recibido una respuesta exitosa.
  pendientes.set(accion, { huella, clave, creada: reutilizable ? anterior.creada : Date.now() });
  const resultado = await apiPost(accion, { ...contenido, _idempotency_key: clave });
  if (pendientes.get(accion)?.clave === clave) pendientes.delete(accion);
  return resultado;
}

export const medicamentosApi = {
  alertas: (params) => apiGet('medicamentos_alertas', params),
  descartarAlerta: (data) => apiPost('medicamentos_descartar_alerta', data),
  catalogo: () => apiGet('medicamentos_catalogo'),
  opciones: () => apiGet('medicamentos_opciones'),
  guardarOpcion: (data) => apiPost('medicamentos_opcion_guardar', data),
  estadoOpcion: (id_opcion, activo) => apiPost('medicamentos_opcion_estado', { id_opcion, activo }),
  eliminarOpcion: (id_opcion) => apiPost('medicamentos_opcion_eliminar', { id_opcion }),
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
  prestar: (data) => escritura('medicamentos_prestar', data),
  devolver: (data) => escritura('medicamentos_devolver', data),
  cerrar: (data) => escritura('medicamentos_cerrar', data),
  sena: (data) => escritura('medicamentos_sena', data),
};
