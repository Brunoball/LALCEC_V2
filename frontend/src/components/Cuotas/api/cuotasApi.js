import { apiGet, apiPost } from "../../_shared/api/apiClient";

export const cuotasApi = {
  listar: (params) => apiGet("cuotas_listar", params),
  catalogos: () => apiGet("cuotas_catalogos"),
  contextoPago: (params) => apiGet("cuotas_contexto_pago", params),
  registrarPago: (payload) => apiPost("cuotas_registrar_pago", payload),
  registrarPagos: (payload) => apiPost("cuotas_registrar_pagos", payload),
  eliminarPago: (idPago) =>
    apiPost("cuotas_eliminar_pago", { id_pago: idPago }),
};
