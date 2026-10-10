import { useCallback, useEffect, useRef, useState } from 'react';

// Actualiza sin botones: después de guardar, al volver a la pestaña y,
// si permanece abierta, cada dos minutos. Evita consultas mientras está oculta.
const INTERVALO_ACTUALIZACION = 120_000;
const MINIMO_ENTRE_CONSULTAS = 15_000;

export function useMedicamentos(loader) {
  const [state, setState] = useState({ loading: true, error: '', registros: [], total: 0, pagina: 1, por_pagina: 20 });
  const serial = useRef(0);
  const ultimaConsulta = useRef(0);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    ultimaConsulta.current = Date.now();
    const seq = ++serial.current;
    if (!silencioso) {
      setState(v => ({ ...v, loading: true, error: '' }));
    }
    try {
      const result = await loader();
      if (seq === serial.current) {
        setState({ loading: false, error: '', registros: result.registros || [], total: Number(result.total ?? (result.registros || []).length), pagina: Number(result.pagina || 1), por_pagina: Number(result.por_pagina || 20) });
      }
    } catch (error) {
      if (seq === serial.current) {
        setState(v => ({
          ...v,
          loading: false,
          error: error.message || 'Error cargando medicamentos.',
          // Una falla temporal al actualizar no borra datos ya visibles.
          registros: silencioso ? v.registros : [],
        }));
      }
    }
  }, [loader]);

  useEffect(() => {
    cargar();

    const actualizarSiCorresponde = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaConsulta.current < MINIMO_ENTRE_CONSULTAS) return;
      cargar({ silencioso: true });
    };

    const timer = window.setInterval(actualizarSiCorresponde, INTERVALO_ACTUALIZACION);
    window.addEventListener('focus', actualizarSiCorresponde);
    document.addEventListener('visibilitychange', actualizarSiCorresponde);

    return () => {
      serial.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', actualizarSiCorresponde);
      document.removeEventListener('visibilitychange', actualizarSiCorresponde);
    };
  }, [cargar]);

  return { ...state, cargar };
}
