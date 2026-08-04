import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCashRegister,
  faChartLine,
  faCircleInfo,
  faPen,
  faTags,
  faTrashCan,
  faToggleOff,
  faToggleOn,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/ModulePage";
import ModuleFeedback from "../../Global/ModuleFeedback";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import { canWrite } from "../../_shared/auth/session";
import { ventasApi } from "../../Ventas/api/ventasApi";
import { apiPost } from "../../_shared/api/apiClient";
import { uppercaseConfigText } from "../../Ventas/utils/textCase";
import ConfiguracionVentaModal from "../modales/ConfiguracionVentaModal";
import "../../Ventas/Ventas.css";
import "./VentasConfiguracion.css";

const emptyConfig = () => ({
  id_configuracion: "",
  nombre: "",
  descripcion: "",
  impacta_contable: true,
  id_proveedor_contable: "",
  id_categoria_contable: "",
  id_concepto_contable: "",
  permite_precio_manual: false,
  solicita_comprador: false,
});

function Empty({ loading }) {
  return (
    <div className="sales-empty">
      <FontAwesomeIcon icon={faCashRegister} />
      <strong>
        {loading ? "Cargando configuración..." : "No hay cajas configuradas"}
      </strong>
      <span>
        {loading
          ? "Consultando las cajas, sedes y canales de venta."
          : "Creá una caja, sede, punto o canal para poder registrar ventas."}
      </span>
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span
      className={`sales-status sales-status--${active ? "activa" : "inactiva"}`}
    >
      {active ? "ACTIVA" : "INACTIVA"}
    </span>
  );
}

function ActionButton({ icon, label, onClick, tone = "", disabled = false }) {
  return (
    <button
      type="button"
      className={`sales-iconButton ${tone ? `sales-iconButton--${tone}` : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

function InfoTooltip({ id, text }) {
  return (
    <span className="sales-infoTooltip">
      <button
        type="button"
        className="sales-infoTooltip__trigger"
        aria-label="Ver información sobre los medios de pago"
        aria-describedby={id}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
      <span className="sales-infoTooltip__content" id={id} role="tooltip">
        {text}
      </span>
    </span>
  );
}

export default function VentasConfiguracion({ onBack }) {
  const writable = canWrite();
  const [catalogs, setCatalogs] = useState({
    configuraciones: [],
    opciones_contables: {
      PROVEEDOR: [],
      CATEGORIA_INGRESO: [],
      CONCEPTO_INGRESO: [],
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ventasApi.catalogos();
      setCatalogs({
        configuraciones: data.configuraciones || [],
        opciones_contables: data.opciones_contables || {},
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.message || "No se pudo cargar la configuración de ventas.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = catalogs.configuraciones.filter((item) => item.activo);
    return [
      {
        label: "Cajas activas",
        value: active.length,
        detail: `${catalogs.configuraciones.length} configuradas en total`,
        icon: faCashRegister,
      },
      {
        label: "Con impacto contable",
        value: active.filter((item) => item.impacta_contable).length,
        detail: "Generan ingreso al confirmar",
        icon: faChartLine,
      },
      {
        label: "Comprador obligatorio",
        value: active.filter((item) => item.solicita_comprador).length,
        detail: "No permiten venta anónima",
        icon: faUserCheck,
      },
    ];
  }, [catalogs.configuraciones]);

  const edit = (item) => {
    setForm({
      ...emptyConfig(),
      ...uppercaseConfigText(item),
      id_configuracion: String(item.id_configuracion),
      id_proveedor_contable: item.id_proveedor_contable
        ? String(item.id_proveedor_contable)
        : "",
      id_categoria_contable: item.id_categoria_contable
        ? String(item.id_categoria_contable)
        : "",
      id_concepto_contable: item.id_concepto_contable
        ? String(item.id_concepto_contable)
        : "",
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload = uppercaseConfigText(form);
      await ventasApi.guardarConfiguracion(payload);
      setForm(null);
      await load();
      setFeedback({
        type: "success",
        message: "Configuración de ventas guardada correctamente.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.message || "No se pudo guardar la configuración de ventas.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item) => {
    setSaving(true);
    try {
      await ventasApi.estadoConfiguracion(item.id_configuracion, !item.activo);
      await load();
      return { ok: true };
    } catch (error) {
      throw new Error(
        error?.message || "No se pudo cambiar el estado de la configuración.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    setSaving(true);
    try {
      await apiPost("ventas_configuracion_eliminar", {
        id_configuracion: item.id_configuracion,
      });
      await load();
      return { ok: true };
    } catch (error) {
      throw new Error(
        error?.message || "No se pudo eliminar la configuración de ventas.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModulePage
        className="sales-settingsPage"
        title={
          <span className="sales-titleWithInfo">
            <span>Configuración de ventas</span>
            <InfoTooltip
              id="sales-settings-payment-info"
              text="El medio de pago no se configura acá: se selecciona individualmente al registrar cada venta."
            />
          </span>
        }
        description="Administrá las cajas, sedes, puntos o canales usados al registrar ventas."
        stats={stats}
        primaryActionLabel="Nueva configuración"
        onPrimaryAction={() => setForm(emptyConfig())}
        canCreate={writable}
        secondaryActions={[
          {
            key: "volver",
            label: "Volver a configuración",
            icon: faArrowLeft,
            onClick: onBack,
          },
        ]}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        {loading ? <Empty loading /> : null}
        {!loading && !catalogs.configuraciones.length ? <Empty /> : null}
        {!loading && catalogs.configuraciones.length ? (
          <div className="sales-cardGrid">
            {catalogs.configuraciones.map((item) => (
              <article
                className={`sales-configCard ${!item.activo ? "is-inactive" : ""}`}
                key={item.id_configuracion}
              >
                  <header>
                    <span className="sales-cardIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faCashRegister} />
                    </span>
                    <div className="sales-configCard__identity">
                      <h3>{item.nombre}</h3>
                      <StatusBadge active={Boolean(item.activo)} />
                    </div>
                    {writable ? (
                      <div className="sales-actions">
                        <ActionButton
                          icon={faPen}
                          label="Editar"
                          onClick={() => edit(item)}
                          disabled={saving}
                        />
                        <ActionButton
                          icon={item.activo ? faToggleOff : faToggleOn}
                          label={item.activo ? "Dar de baja" : "Reactivar"}
                          tone={item.activo ? "danger" : "success"}
                          onClick={() =>
                            setActionModal({
                              type: item.activo ? "baja" : "alta",
                              item,
                            })
                          }
                          disabled={saving}
                        />
                        <ActionButton
                          icon={faTrashCan}
                          label="Eliminar"
                          tone="danger"
                          onClick={() =>
                            setActionModal({ type: "eliminar", item })
                          }
                          disabled={saving}
                        />
                      </div>
                    ) : null}
                  </header>
                  <p>{item.descripcion || "Sin descripción."}</p>
                  <div className="sales-configCard__facts">
                    <div className="sales-configCard__fact">
                      <span
                        className="sales-configCard__factIcon"
                        aria-hidden="true"
                      >
                        <FontAwesomeIcon icon={faChartLine} />
                      </span>
                      <div className="sales-configCard__factContent">
                        <span className="sales-configCard__factLabel">
                          Impacto contable
                        </span>
                        <strong className="sales-configCard__factValue">
                          {item.impacta_contable ? "Automático" : "Desactivado"}
                        </strong>
                      </div>
                    </div>
                    <div className="sales-configCard__fact">
                      <span
                        className="sales-configCard__factIcon"
                        aria-hidden="true"
                      >
                        <FontAwesomeIcon icon={faTags} />
                      </span>
                      <div className="sales-configCard__factContent">
                        <span className="sales-configCard__factLabel">
                          Categoría / concepto
                        </span>
                        <strong className="sales-configCard__factValue">
                          {item.impacta_contable
                            ? `${item.categoria_nombre || "—"} · ${item.concepto_nombre || "—"}`
                            : "—"}
                        </strong>
                      </div>
                    </div>
                    <div className="sales-configCard__fact">
                      <span
                        className="sales-configCard__factIcon"
                        aria-hidden="true"
                      >
                        <FontAwesomeIcon icon={faUserCheck} />
                      </span>
                      <div className="sales-configCard__factContent">
                        <span className="sales-configCard__factLabel">
                          Comprador
                        </span>
                        <strong className="sales-configCard__factValue">
                          {item.solicita_comprador ? "Obligatorio" : "Opcional"}
                        </strong>
                      </div>
                    </div>
                    <div className="sales-configCard__fact">
                      <span
                        className="sales-configCard__factIcon"
                        aria-hidden="true"
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </span>
                      <div className="sales-configCard__factContent">
                        <span className="sales-configCard__factLabel">
                          Precio manual
                        </span>
                        <strong className="sales-configCard__factValue">
                          {item.permite_precio_manual
                            ? "Permitido"
                            : "Bloqueado"}
                        </strong>
                      </div>
                    </div>
                  </div>
              </article>
            ))}
          </div>
        ) : null}
      </ModulePage>

      <ConfiguracionVentaModal
        form={form}
        setForm={setForm}
        catalogs={catalogs}
        saving={saving}
        onSubmit={submit}
      />

      <ModalEliminarGlobal
        open={Boolean(actionModal)}
        operacion={actionModal?.type || "advertencia"}
        row={actionModal?.item || null}
        title={
          actionModal?.type === "eliminar"
            ? "Eliminar configuración"
            : actionModal?.type === "baja"
              ? "Dar de baja configuración"
              : "Reactivar configuración"
        }
        message={
          actionModal?.type === "eliminar"
            ? "La configuración se eliminará definitivamente si todavía no fue utilizada en ninguna venta."
            : actionModal?.type === "baja"
              ? "La configuración dejará de estar disponible al registrar ventas, pero se conservará para mantener el historial."
              : "La configuración volverá a estar disponible al registrar ventas."
        }
        warning={
          actionModal?.type === "eliminar"
            ? "Si ya tiene ventas asociadas, deberás darla de baja en lugar de eliminarla."
            : ""
        }
        confirmLabel={
          actionModal?.type === "eliminar"
            ? "Eliminar"
            : actionModal?.type === "baja"
              ? "Dar de baja"
              : "Reactivar"
        }
        loadingLabel={
          actionModal?.type === "eliminar"
            ? "Eliminando..."
            : actionModal?.type === "baja"
              ? "Dando de baja..."
              : "Reactivando..."
        }
        loadingMessage={
          actionModal?.type === "eliminar"
            ? "Eliminando configuración…"
            : actionModal?.type === "baja"
              ? "Dando de baja la configuración…"
              : "Reactivando configuración…"
        }
        successMessage={
          actionModal?.type === "eliminar"
            ? "Configuración eliminada correctamente."
            : actionModal?.type === "baja"
              ? "Configuración dada de baja correctamente."
              : "Configuración reactivada correctamente."
        }
        errorMessage={
          actionModal?.type === "eliminar"
            ? "No se pudo eliminar la configuración."
            : "No se pudo cambiar el estado de la configuración."
        }
        details={
          actionModal
            ? [
                { label: "Configuración", value: actionModal.item?.nombre },
                {
                  label: "Estado actual",
                  value: actionModal.item?.activo ? "ACTIVA" : "INACTIVA",
                },
                {
                  label: "Impacto contable",
                  value: actionModal.item?.impacta_contable
                    ? "AUTOMÁTICO"
                    : "DESACTIVADO",
                },
              ]
            : []
        }
        loading={saving}
        onClose={() => !saving && setActionModal(null)}
        onConfirm={() =>
          actionModal?.type === "eliminar"
            ? remove(actionModal.item)
            : toggle(actionModal.item)
        }
      />

      <ModuleFeedback
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </>
  );
}
