import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cuotasApi } from "../api/cuotasApi";

export function useCuotas(filtros = {}) {
  const query = useMemo(() => JSON.stringify(filtros), [filtros]);
  const requestId = useRef(0);
  const [response, setResponse] = useState({ items: [], resumen: {}, catalogos: { categorias: [] } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    // Evita renderizar durante un cambio de pestaña los registros de la
    // consulta anterior, que tienen otra estructura y pueden generar filas
    // duplicadas o claves React inválidas.
    setResponse((current) => ({
      items: [],
      resumen: {},
      catalogos: current.catalogos || { categorias: [] },
    }));
    try {
      const result = await cuotasApi.listar(JSON.parse(query));
      if (currentRequest === requestId.current) {
        setResponse({
          items: result.items || [],
          resumen: result.resumen || {},
          catalogos: result.catalogos || { categorias: [] },
        });
      }
      return result;
    } catch (err) {
      if (currentRequest === requestId.current) setError(err.message || "No se pudo cargar el módulo de cuotas.");
      return null;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    cargar();
    return () => { requestId.current += 1; };
  }, [cargar]);

  return { ...response, loading, error, cargar };
}
