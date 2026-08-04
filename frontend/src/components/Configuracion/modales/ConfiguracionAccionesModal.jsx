import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faRotateLeft,
  faTrash,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../../Global/Modales/CrudModal";
import "./ConfiguracionAccionesModal.css";

export default function ConfiguracionAccionesModal({
  item,
  saving,
  onClose,
  onChangeStatus,
  onDelete,
}) {
  const [localAction, setLocalAction] = useState("");

  if (!item) return null;

  const active = Boolean(item.activo);
  const processing = saving || Boolean(localAction);

  const runStatusAction = async (event) => {
    event.preventDefault();
    if (processing) return;
    setLocalAction(active ? "baja" : "alta");
    try {
      const completed = await onChangeStatus?.(item);
      if (completed) onClose?.();
    } finally {
      setLocalAction("");
    }
  };

  const runDelete = async () => {
    if (processing) return;
    setLocalAction("eliminar");
    try {
      const completed = await onDelete?.(item);
      if (completed) onClose?.();
    } finally {
      setLocalAction("");
    }
  };

  return (
    <CrudModal
      open
      title={active ? "Dar de baja o eliminar" : "Reactivar o eliminar"}
      subtitle={`CONFIGURACIÓN: ${item.nombre || "—"}`}
      onClose={onClose}
      onSubmit={runStatusAction}
      saving={processing}
      submitLabel={active ? "Dar de baja" : "Reactivar"}
      danger={active}
      footerStart={(
        <button
          type="button"
          className="mov-btn mov-btn--danger"
          onClick={runDelete}
          disabled={processing}
        >
          <FontAwesomeIcon icon={faTrash} />
          {localAction === "eliminar" ? "Eliminando..." : "Eliminar definitivamente"}
        </button>
      )}
    >
      <div className="sales-action-confirmation">
        <span className="sales-cardIcon" aria-hidden="true">
          <FontAwesomeIcon icon={active ? faUserSlash : faRotateLeft} />
        </span>
        <div>
          <strong>
            {active
              ? "Dar de baja conserva esta configuración y permite reactivarla después."
              : "Reactivar vuelve a habilitar esta configuración para nuevas ventas."}
          </strong>
          <p>
            Las ventas ya registradas no se eliminan ni se modifican al cambiar el estado.
          </p>
        </div>
      </div>

      <div className="sales-action-warning">
        <FontAwesomeIcon icon={faCircleExclamation} />
        <div>
          <strong>Eliminar es definitivo.</strong>
          <p>
            Solo se podrá eliminar si esta configuración todavía no fue utilizada en ninguna venta.
            Si ya tiene ventas asociadas, el sistema te pedirá que la des de baja.
          </p>
        </div>
      </div>
    </CrudModal>
  );
}
