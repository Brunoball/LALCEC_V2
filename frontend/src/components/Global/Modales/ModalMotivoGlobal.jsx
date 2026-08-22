import React from "react";
import InfoModal from "./InfoModal";
import "../Global_css/Global_ModalMotivo.css";

export function MotivoPreviewGlobal({
  text,
  onOpen,
  emptyText = "SIN MOTIVO REGISTRADO",
  previewLimit = 50,
  actionLabel = "Ver motivo completo",
  title = "Ver motivo completo",
  ariaLabel,
  className = "",
}) {
  const reason = String(text || "").trim();
  const displayReason = reason || emptyText;
  const needsModal = reason.length > previewLimit;

  if (!needsModal) {
    return <span className={`global-reason-preview__text ${className}`.trim()}>{displayReason}</span>;
  }

  const preview = `${reason.slice(0, previewLimit).trimEnd()}…`;

  return (
    <button
      className={`global-reason-preview ${className}`.trim()}
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={ariaLabel || title}
    >
      <span>{preview}</span>
      <small>{actionLabel}</small>
    </button>
  );
}

export default function ModalMotivoGlobal({
  open,
  title = "Motivo",
  subtitle = "",
  label = "Motivo registrado",
  text,
  emptyText = "SIN MOTIVO REGISTRADO",
  onClose,
  closeOnBackdrop = false,
  modalClassName = "",
}) {
  const reason = String(text || "").trim() || emptyText;

  return (
    <InfoModal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      modalClassName={`global-reason-modal ${modalClassName}`.trim()}
      closeOnBackdrop={closeOnBackdrop}
    >
      <section className="global-reason-modal__content">
        <span>{label}</span>
        <p>{reason}</p>
      </section>
    </InfoModal>
  );
}
