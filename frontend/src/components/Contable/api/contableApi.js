import {
  apiDownload,
  apiFormPost,
  apiGet,
  apiPost,
} from "../../Global/api/apiClient";

export const contableApi = {
  resumen: (params) => apiGet("contable_resumen", params),
  catalogos: () => apiGet("contable_catalogos"),
  ingresosSocios: (params) => apiGet("contable_ingresos_socios", params),
  ingresos: (params) => apiGet("contable_ingresos_listar", params),
  egresos: (params) => apiGet("contable_egresos_listar", params),
  guardarOpcion: (payload) => apiPost("contable_opcion_guardar", payload),
  guardarIngreso: (payload) => apiPost("contable_ingreso_guardar", payload),
  anularIngreso: (idIngreso) =>
    apiPost("contable_ingreso_anular", { id_ingreso: idIngreso }),
  guardarEgreso: (formData) =>
    apiFormPost("contable_egreso_guardar", formData),
  anularEgreso: (idEgreso) =>
    apiPost("contable_egreso_anular", { id_egreso: idEgreso }),
  archivoEgreso: (idEgreso) =>
    apiDownload("contable_egreso_archivo", { id: idEgreso }),
};
