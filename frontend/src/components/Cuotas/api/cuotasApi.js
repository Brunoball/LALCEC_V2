import { apiGet, apiPost } from "../../Global/api/apiClient";

export const cuotasApi = {
  listar: (params) => apiGet("cuotas_listar", params),
  catalogos: () => apiGet("cuotas_catalogos"),
  detalleSocio: (id, hastaAnio = "") => apiGet("cuotas_detalle_socio", { id, hasta_anio: hastaAnio }),
  registrarCobro: (payload) => apiPost("cuotas_registrar_cobro", payload),
  registrarPago: (payload) => apiPost("cuotas_registrar_pago", payload),
  registrarInscripcion: (payload) => apiPost("cuotas_registrar_inscripcion", payload),
  anular: (codigoOperacion, lineas) => apiPost("cuotas_anular", {
    codigo_operacion: codigoOperacion,
    lineas: lineas.map(({ tipo, id_linea }) => ({ tipo, id_linea })),
  }),
  comprobante: (codigoOperacion) => apiGet("cuotas_comprobante", { codigo: codigoOperacion }),
};
