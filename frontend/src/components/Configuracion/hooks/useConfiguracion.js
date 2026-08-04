import { useCallback, useEffect, useRef, useState } from "react";
import { configuracionApi } from "../api/configuracionApi";

const initialLists = {
  medios_pago: [],
  localidades: [],
  contable_proveedores: [],
  contable_categorias_ingreso: [],
  contable_conceptos_ingreso: [],
  contable_categorias_egreso: [],
  contable_conceptos_egreso: [],
};

const initialState = {
  parametros: { monto_inscripcion: "0.00" },
  listas: initialLists,
  resumen: {
    medios_pago_activos: 0,
    localidades_activos: 0,
    localidades_activas: 0,
    contable_listas_activas: 0,
  },
};

export function useConfiguracion() {
  const requestId = useRef(0);
  const [data, setData] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await configuracionApi.obtener();
      if (currentRequest === requestId.current) {
        setData({
          parametros: response.parametros || initialState.parametros,
          listas: { ...initialLists, ...(response.listas || {}) },
          resumen: { ...initialState.resumen, ...(response.resumen || {}) },
        });
      }
      return response;
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || "No se pudo cargar la configuración.");
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    return () => { requestId.current += 1; };
  }, [cargar]);

  return { ...data, loading, error, cargar };
}
