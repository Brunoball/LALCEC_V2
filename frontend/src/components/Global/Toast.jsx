import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSpinner,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import "./Toast.css";

const TIPOS_PERSISTENTES = new Set(["error", "advertencia", "alerta"]);

const normalizarTipo = (tipo) => {
  if (tipo === "success" || tipo === "ok") return "exito";
  if (tipo === "warning") return "advertencia";
  return tipo;
};

const Toast = ({ tipo, mensaje, onClose, duracion }) => {
  const [desapareciendo, setDesapareciendo] = useState(false);
  const cierreEjecutadoRef = useRef(false);
  const tipoNormalizado = useMemo(() => normalizarTipo(tipo), [tipo]);
  const esPersistente = useMemo(
    () => TIPOS_PERSISTENTES.has(tipoNormalizado),
    [tipoNormalizado],
  );

  const cerrarToast = useCallback(() => {
    if (cierreEjecutadoRef.current) return;

    cierreEjecutadoRef.current = true;
    setDesapareciendo(true);

    window.setTimeout(() => {
      if (typeof onClose === "function") onClose();
    }, 280);
  }, [onClose]);

  useEffect(() => {
    const cerrarConEscape = (event) => {
      if (event.key === "Escape") cerrarToast();
    };

    const cerrarConBotones = (event) => {
      const objetivo = event.target;
      if (!(objetivo instanceof Element)) return;

      const botonAccion = objetivo.closest(
        'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]',
      );

      if (botonAccion) cerrarToast();
    };

    window.addEventListener("keydown", cerrarConEscape);
    document.addEventListener("click", cerrarConBotones, true);

    return () => {
      window.removeEventListener("keydown", cerrarConEscape);
      document.removeEventListener("click", cerrarConBotones, true);
    };
  }, [cerrarToast]);

  useEffect(() => {
    if (esPersistente) return undefined;

    if (duracion === undefined || duracion === null) {
      console.warn("⚠ Toast: No se especificó la duración del mensaje.");
      return undefined;
    }

    const tiempoSalida = Math.max(Number(duracion) - 500, 0);

    const mostrarTimer = window.setTimeout(() => {
      setDesapareciendo(true);
    }, tiempoSalida);

    const ocultarTimer = window.setTimeout(() => {
      if (typeof onClose === "function") onClose();
    }, Number(duracion));

    return () => {
      window.clearTimeout(mostrarTimer);
      window.clearTimeout(ocultarTimer);
    };
  }, [onClose, duracion, esPersistente]);

  const iconos = {
    exito: faCheckCircle,
    error: faTimesCircle,
    advertencia: faExclamationTriangle,
    alerta: faExclamationTriangle,
    cargando: faSpinner,
  };

  const clasesTipo = {
    exito: "toast-exito",
    error: "toast-error",
    advertencia: "toast-advertencia",
    alerta: "toast-advertencia",
    cargando: "toast-cargando",
  };

  const iconoSeleccionado = iconos[tipoNormalizado] || faInfoCircle;
  const claseSeleccionada = clasesTipo[tipoNormalizado] || "toast-info";

  const contenidoToast = (
    <div
      className={`toast-container ${claseSeleccionada} ${desapareciendo ? "desaparecer" : ""}`}
    >
      <FontAwesomeIcon
        icon={iconoSeleccionado}
        className={`toast-icon ${tipoNormalizado === "cargando" ? "spin" : ""}`}
      />
      <span className="toast-message">{mensaje}</span>

      {esPersistente && (
        <button
          type="button"
          className="toast-close"
          onClick={cerrarToast}
          aria-label="Cerrar notificación"
          title="Cerrar"
        >
          ×
        </button>
      )}
    </div>
  );

  if (typeof document === "undefined") return contenidoToast;

  return createPortal(contenidoToast, document.body);
};

export default Toast;
