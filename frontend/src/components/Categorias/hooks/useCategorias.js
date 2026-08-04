import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categoriasApi } from "../api/categoriasApi";

export function useCategorias(filtros = {}) {
  const query = useMemo(() => JSON.stringify(filtros), [filtros]);
  const requestId = useRef(0);
  const [response, setResponse] = useState({ items: [], resumen: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await categoriasApi.listar(JSON.parse(query));
      if (currentRequest === requestId.current) {
        setResponse({ items: result.items || [], resumen: result.resumen || {} });
      }
      return result;
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || "No se pudieron cargar las categorías.");
      }
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
