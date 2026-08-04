import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "../styles/Global_Modals.css";

export default function CrudModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  saving = false,
  submitLabel = "Guardar",
  danger = false,
  wide = false,
  hideSubmit = false,
  submitDisabled = false,
  hideCancel = false,
  cancelLabel = "Cancelar",
  footerStart = null,
  modalClassName = "",
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    const onKey = (event) => event.key === "Escape" && !saving && onClose?.();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, saving]);

  if (!open) return null;
  return createPortal(
    <div
      className="entity-modal-overlay"
      role="presentation"
      onMouseDown={() => !saving && onClose?.()}
    >
      <div
        className={`entity-modal ${wide ? "entity-modal--wide" : ""} ${modalClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="entity-modal__header">
          <div>
            <h2 id="entity-modal-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            className="entity-modal__close"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="entity-modal__body">{children}</div>
          {footerStart || !hideCancel || !hideSubmit ? (
            <footer className="entity-modal__footer">
              {footerStart ? (
                <div className="entity-modal__footer-start">{footerStart}</div>
              ) : null}
              {!hideCancel ? (
                <button
                  className="mov-btn mov-btn--ghost"
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                >
                  {cancelLabel}
                </button>
              ) : null}
              {!hideSubmit ? (
                <button
                  className={`mov-btn ${danger ? "mov-btn--danger" : "mov-btn--primary"}`}
                  type="submit"
                  disabled={saving || submitDisabled}
                >
                  {saving ? "Guardando..." : submitLabel}
                </button>
              ) : null}
            </footer>
          ) : null}
        </form>
      </div>
    </div>,
    document.body,
  );
}
