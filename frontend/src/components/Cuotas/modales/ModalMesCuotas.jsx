// src/components/.../ModalMesCuotas.jsx
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faPrint } from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalMesCuotas.css";

const ModalMesCuotas = ({
  mesesSeleccionados,
  onMesSeleccionadosChange,
  onCancelar,
  onImprimir,
  loading = false,
}) => {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;

    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        if (!loading) onCancelar?.();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [loading, onCancelar]);

  const meses = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];

  const toggleMes = (mes) => {
    if (mesesSeleccionados.includes(mes)) {
      onMesSeleccionadosChange(mesesSeleccionados.filter((m) => m !== mes));
    } else {
      onMesSeleccionadosChange([...mesesSeleccionados, mes]);
    }
  };

  const seleccionarTodos = () => {
    if (mesesSeleccionados.length === meses.length) {
      onMesSeleccionadosChange([]);
    } else {
      onMesSeleccionadosChange(meses);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!loading && mesesSeleccionados.length > 0) onImprimir?.();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="entity-modal-overlay mescuot_overlay"
      role="presentation"
    >
      <div
        className="entity-modal entity-modal--wide mescuot_contenido"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mescuot-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="entity-modal__header mescuot_header">
          <div>
            <h2 id="mescuot-modal-title">Seleccionar meses</h2>
            <p>Elegí los períodos cuyos comprobantes querés imprimir.</p>
          </div>
          <button
            type="button"
            className="entity-modal__close"
            onClick={onCancelar}
            disabled={loading}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="entity-modal__body mescuot_body">
            <div className="mescuot_periodos-section">
              <div className="mescuot_section-header">
                <h3 className="mescuot_section-title">Meses disponibles</h3>
                <div className="mescuot_section-header-actions">
                  <button
                    type="button"
                    className="mov-btn mov-btn--ghost mescuot_select-all-btn"
                    onClick={seleccionarTodos}
                    disabled={loading}
                  >
                    {mesesSeleccionados.length === meses.length
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </button>
                </div>
              </div>

              <div className="mescuot_periodos-grid-container">
                <div className="mescuot_periodos-grid">
                  {meses.map((mes) => {
                    const checked = mesesSeleccionados.includes(mes);
                    return (
                      <label
                        key={mes}
                        className={`mescuot_periodo-card ${
                          checked ? "mescuot_seleccionado" : ""
                        }`}
                      >
                        <div className="mescuot_periodo-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMes(mes)}
                            disabled={loading}
                            aria-checked={checked}
                            aria-label={mes}
                          />
                          <span
                            className="mescuot_checkmark"
                            aria-hidden="true"
                          />
                        </div>
                        <span className="mescuot_periodo-label">{mes}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <footer className="entity-modal__footer mescuot_footer">
            <div className="mescuot_footer-left">
              <div className="mescuot_selection-info" aria-live="polite">
                {mesesSeleccionados.length > 0
                  ? `${mesesSeleccionados.length} ${
                      mesesSeleccionados.length === 1
                        ? "seleccionado"
                        : "seleccionados"
                    }`
                  : "Ninguno seleccionado"}
              </div>
            </div>
            <div className="mescuot_footer-right">
              <button
                type="button"
                className="mov-btn mov-btn--ghost mescuot_action-btn"
                onClick={onCancelar}
                disabled={loading}
              >
                <FontAwesomeIcon icon={faTimes} />
                <span className="btn-label">Cancelar</span>
              </button>
              <button
                type="submit"
                className="mov-btn mov-btn--primary mescuot_action-btn"
                disabled={loading || mesesSeleccionados.length === 0}
              >
                <FontAwesomeIcon icon={faPrint} />
                <span className="btn-label">
                  {loading ? "Preparando..." : "Imprimir"}
                </span>
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default ModalMesCuotas;
