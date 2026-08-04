import { apiGet, apiPost } from "../../Global/api/apiClient";

export const categoriasApi = {
  listar: (params) => apiGet("categorias_listar", params),
  obtener: (id) => apiGet("categorias_obtener", { id }),
  guardar: (payload) => apiPost("categorias_guardar", payload),
  darBaja: (id) => apiPost("categorias_eliminar", { id }),
  reactivar: (id) => apiPost("categorias_reactivar", { id }),
  historial: (id) => apiGet("categorias_historial", { id }),
  listarDescuentosFamiliares: () => apiGet("descuentos_familiares_listar"),
  guardarDescuentoFamiliar: (payload) => apiPost("descuentos_familiares_guardar", payload),
  eliminarDescuentoFamiliar: (id) => apiPost("descuentos_familiares_eliminar", { id }),
};
