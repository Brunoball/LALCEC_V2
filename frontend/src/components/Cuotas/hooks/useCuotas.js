import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cuotasApi } from "../api/cuotasApi";

const initialResponse = {
  items: [],
  resumen: {},
  periodo: {},
  catalogos: {
    categorias: [],
    medios_pago: [],
    socios: [],
    empresas: [],
    anios: [],
    meses: [],
  },
};

export function useCuotas(filtros = {}) {
  const query = useMemo(() => JSON.stringify(filtros), [filtros]);
  const requestId = useRef(0);
  const [response, setResponse] = useState(initialResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await cuotasApi.listar(JSON.parse(query));
      if (currentRequest === requestId.current) {
        setResponse({
          items: result.items || [],
          resumen: result.resumen || {},
          periodo: result.periodo || {},
          catalogos: result.catalogos || initialResponse.catalogos,
        });
      }
      return result;
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || "No se pudo cargar el módulo de cuotas.");
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    cargar();
    return () => {
      requestId.current += 1;
    };
  }, [cargar]);

  return { ...response, loading, error, cargar };
}
