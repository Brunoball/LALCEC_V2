import { useCallback, useEffect, useRef, useState } from "react";
import { categoriasApi } from "../api/categoriasApi";

export function useDescuentosFamiliares() {
  const requestId = useRef(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await categoriasApi.listarDescuentosFamiliares();
      if (currentRequest === requestId.current) setItems(result.items || []);
      return result;
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || "No se pudieron cargar los descuentos familiares.");
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

  return { items, loading, error, cargar };
}
