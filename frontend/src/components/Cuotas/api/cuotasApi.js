import { apiGet, apiPost } from "../../_shared/api/apiClient";

export const cuotasApi = {
  listar: (params) => apiGet("cuotas_listar", params),
  catalogos: () => apiGet("cuotas_catalogos"),
  registrarPago: (payload) => apiPost("cuotas_registrar_pago", payload),
  eliminarPago: (idPago) =>
    apiPost("cuotas_eliminar_pago", { id_pago: idPago }),
};
