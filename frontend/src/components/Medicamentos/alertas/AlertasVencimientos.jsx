import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faChevronDown, faChevronUp, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { fecha } from '../utils/medicamentosUtils';

const mensajeDias = valor => {
  const dias = Number(valor);
  if (dias < 0) return `Venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`;
  if (dias === 0) return 'Vence hoy';
  return `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} para el vencimiento`;
};

/**
 * Ocultar contrae las tarjetas hasta volver a tocar la pestaña; al volver a
 * entrar a la sección se despliegan de nuevo. Descartar con confirmación las
 * persiste por usuario y fecha en la base de datos.
 */
export default function AlertasVencimientos({ tipo, onSelect, actualizacion = 0 }) {
  const esMedicamento = tipo === 'MEDICAMENTO';
  const [alertas, setAlertas] = useState([]);
  const [desplegado, setDesplegado] = useState(true);
  const [aDescartar, setADescartar] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const vigente = useRef(true);
  const consulta = useRef(0);

  const cargar = useCallback(async () => {
    const token = ++consulta.current;
    try {
      const respuesta = await api.alertas({ tipo });
      if (vigente.current && token === consulta.current) {
        setAlertas(respuesta.registros || []);
        setError('');
      }
    } catch (e) {
      if (vigente.current && token === consulta.current) setError(e.message || 'No se pudieron actualizar las alertas.');
    }
  }, [tipo]);

  useEffect(() => {
    vigente.current = true;
    void cargar();
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(); };
    const timer = window.setInterval(alVolver, 120000);
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente.current = false;
      ++consulta.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);
  useEffect(() => { if (actualizacion) void cargar(); }, [actualizacion, cargar]);

  const verAlerta = async alerta => {
    setDesplegado(false);
    try { await onSelect(alerta); }
    catch (e) { setError(e.message || 'No se pudo abrir el registro.'); }
  };
  const descartar = async () => {
    if (!aDescartar || procesando) return;
    setProcesando(true);
    try {
      await api.descartarAlerta({
        tipo: aDescartar.tipo,
        id_referencia: aDescartar.id_referencia,
        fecha_objetivo: aDescartar.fecha_objetivo,
      });
      setAlertas(prev => prev.filter(a => !(a.tipo === aDescartar.tipo &&
        String(a.id_referencia) === String(aDescartar.id_referencia) &&
        a.fecha_objetivo === aDescartar.fecha_objetivo)));
      setError('');
      void cargar();
    } catch (e) {
      setError(e.message || 'No se pudo descartar la alerta.');
      // Re-lanzar: el modal global debe indicar fallo, no un éxito falso.
      throw e;
    } finally { setProcesando(false); }
  };

  if (!alertas.length && !error && !aDescartar) return null;
  return <>
    <aside className={`med-alertas ${desplegado ? 'med-alertas--abiertas' : 'med-alertas--minimizadas'}`} aria-label={esMedicamento ? "Alertas de vencimiento de medicamentos" : "Alertas de préstamos"}>
      {<button className="med-alertas__tab" tabIndex={desplegado ? -1 : 0} aria-hidden={desplegado} type="button" onClick={() => setDesplegado(true)} aria-expanded={false}>
        <FontAwesomeIcon icon={faBell} /> Alertas {alertas.length ? `(${alertas.length})` : ''} <FontAwesomeIcon icon={faChevronUp} />
      </button>}
      <div className="med-alertas__panel" aria-hidden={!desplegado} inert={!desplegado ? "" : undefined}>
        <div className="med-alertas__head">
          <div className="med-alertas__heading"><FontAwesomeIcon icon={faBell} /><strong>{esMedicamento ? "Alertas de vencimiento" : "Alertas de devolución"}</strong><span>{alertas.length}</span></div>
          <button type="button" className="med-alertas__minimizar" aria-label="Ocultar tarjetas de alertas temporalmente" title="Ocultar tarjetas" onClick={() => setDesplegado(false)}><FontAwesomeIcon icon={faChevronDown} /></button>
        </div>
        {alertas.length ? <div className="med-alertas__scroll">
          {alertas.map(a => <div className={`med-alertas__item ${Number(a.dias_restantes) < 0 ? 'med-alertas__item--vencido' : 'med-alertas__item--proximo'}`} key={`${a.tipo}-${a.id_referencia}-${a.fecha_objetivo}`}>
            <button type="button" className="med-alertas__contenido" onClick={() => void verAlerta(a)}
              title={esMedicamento ? "Abrir medicamento para gestionarlo" : "Abrir préstamo para gestionarlo"}>
              <span className="med-alertas__nombre">{a.titulo}</span>
              <strong>{mensajeDias(a.dias_restantes)}</strong>
              <small>{fecha(a.fecha_objetivo)} · {esMedicamento ? "Ver / editar medicamento" : "Ver / finalizar préstamo"}</small>
            </button>
            <button type="button" className="med-alertas__descartar" aria-label={`Descartar permanentemente alerta de ${a.titulo}`} title="Descartar esta alerta (requiere confirmación)" onClick={() => setADescartar(a)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>)}
        </div> : null}
        {error ? <div className="med-alertas__error" role="alert">{error} <button type="button" onClick={() => void cargar()}>Reintentar</button></div> : null}
        <p className="med-alertas__hint">Tocá un aviso para gestionarlo. La flecha oculta las tarjetas; la X descarta solo esa alerta.</p>
      </div>
    </aside>
    <ModalEliminarGlobal
      open={!!aDescartar}
      operacion="advertencia"
      tone="danger"
      icon={faTriangleExclamation}
      title="Descartar alerta definitivamente"
      message={esMedicamento ? "¿Querés dejar de ver este aviso de vencimiento?" : "¿Querés dejar de ver este aviso de devolución?"}
      warning={esMedicamento ? "No modifica el medicamento ni su stock. Solo descarta la alerta para esta fecha y usuario; si se cambia la fecha, puede volver a aparecer." : "No modifica el préstamo, solo descarta el recordatorio. Si cambia la fecha prevista, puede volver a aparecer."}
      details={aDescartar ? [
        { label: 'Registro', value: aDescartar.titulo },
        { label: 'Fecha', value: fecha(aDescartar.fecha_objetivo) },
      ] : []}
      confirmLabel="Sí, descartar alerta"
      loadingLabel="Descartando..."
      loadingMessage="Guardando el descarte…"
      successMessage="Alerta descartada para este usuario."
      errorMessage="No se pudo descartar la alerta."
      onConfirm={descartar}
      onClose={() => { if (!procesando) setADescartar(null); }}
      loading={procesando}
    />
  </>;
}
