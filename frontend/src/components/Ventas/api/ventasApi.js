import { apiGet, apiPost } from "../../Global/api/apiClient";

export const ventasApi = {
  catalogos: (options = {}) => apiGet("ventas_catalogos", {}, options),
  listar: (filtros = {}, options = {}) =>
    apiGet("ventas_listar", filtros, options),
  buscarSocios: (buscar, options = {}) =>
    apiGet("ventas_socios_buscar", { buscar }, options),
  guardarConfiguracion: (data) => apiPost("ventas_configuracion_guardar", data),
  estadoConfiguracion: (id_configuracion, activo) =>
    apiPost("ventas_configuracion_estado", { id_configuracion, activo }),
  guardarProducto: (data) => apiPost("ventas_producto_guardar", data),
  estadoProducto: (id_producto, activo) =>
    apiPost("ventas_producto_estado", { id_producto, activo }),
  guardarVenta: (data) => apiPost("ventas_venta_guardar", data),
  estadoVenta: (id_venta, estado) =>
    apiPost("ventas_venta_estado", { id_venta, estado }),
  eliminarVenta: (id_venta) =>
    apiPost("ventas_venta_eliminar", { id_venta }),
};
