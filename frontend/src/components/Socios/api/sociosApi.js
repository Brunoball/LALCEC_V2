import { apiGet, apiPost } from "../../Global/api/apiClient";

// Acceso al backend del módulo Socios. Mantener acá todas las operaciones
// de ListadoSocios y Familias evita APIs duplicadas dentro de subsecciones.
export const sociosApi = {
  listar: (params) => apiGet("socios_listar", params),
  obtener: (id) => apiGet("socios_obtener", { id }),
  historial: (id) => apiGet("socios_historial", { id }),
  guardar: (payload) => apiPost("socios_guardar", payload),
  darBaja: (payload) => apiPost("socios_eliminar", payload),
  reactivar: (id) => apiPost("socios_reactivar", { id }),
};

export const familiasApi = {
  listar: (params) => apiGet("familias_listar", params),
  obtener: (id) => apiGet("familias_obtener", { id }),
  guardar: (payload) => apiPost("familias_guardar", payload),
  darBaja: (id) => apiPost("familias_eliminar", { id }),
  reactivar: (id) => apiPost("familias_reactivar", { id }),
};
