import { apiGet, apiPost } from "../../_shared/api/apiClient";

// Evita duplicar mutaciones idénticas mientras la primera petición sigue en
// vuelo. Es una segunda barrera además del guard sincrónico del formulario:
// cualquier caller que invoque dos veces registrarPago(s) recibe la misma
// Promise y el backend ve un único POST.
const paymentMutationsInFlight = new Map();

function stablePayloadKey(action, payload) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((result, key) => {
          result[key] = normalize(value[key]);
          return result;
        }, {});
    }
    return value;
  };

  return `${action}:${JSON.stringify(normalize(payload || {}))}`;
}

function postPaymentSingleFlight(action, payload) {
  const key = stablePayloadKey(action, payload);
  const current = paymentMutationsInFlight.get(key);
  if (current) return current;

  const request = apiPost(action, payload).finally(() => {
    if (paymentMutationsInFlight.get(key) === request) {
      paymentMutationsInFlight.delete(key);
    }
  });
  paymentMutationsInFlight.set(key, request);
  return request;
}

export const cuotasApi = {
  totalesEstado: (params, options) => apiGet("cuotas_totales_estado", params, options),
  listar: (params, options) => apiGet("cuotas_listar", params, options),
  saldosFavor: (params, options) => apiGet("cuotas_saldos_favor", params, options),
  ajustarSaldoFavor: (payload) => apiPost("cuotas_ajustar_saldo_favor", payload),
  catalogos: (params, options) => apiGet("cuotas_catalogos", params, options),
  contextoPago: (params) => apiGet("cuotas_contexto_pago", params),
  contextosPago: (params) => apiGet("cuotas_contextos_pago", params),
  registrarPago: (payload) => postPaymentSingleFlight("cuotas_registrar_pago", payload),
  registrarPagos: (payload) => postPaymentSingleFlight("cuotas_registrar_pagos", payload),
  condonarPago: (payload) => apiPost("cuotas_condonar_pago", payload),
  eliminarPago: (idPago) =>
    apiPost("cuotas_eliminar_pago", { id_pago: idPago }),
};
