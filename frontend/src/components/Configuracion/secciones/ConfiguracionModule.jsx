import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRotateLeft,
  faArrowTrendDown,
  faArrowTrendUp,
  faCashRegister,
  faChevronRight,
  faGear,
  faLocationDot,
  faMoneyBillTransfer,
  faPen,
  faTags,
  faTrashCan,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/ModulePage";
import CrudModal from "../../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/ModuleFeedback";
import { canWrite } from "../../_shared/auth/session";
import { configuracionApi } from "../api/configuracionApi";
import { useConfiguracion } from "../hooks/useConfiguracion";
import VentasConfiguracion from "./VentasConfiguracion";
import "../configuracion.css";

const upper = (value) => String(value ?? "").toLocaleUpperCase("es-AR");
const money = (value) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
}).format(Number(value || 0));

const AMOUNT_SECTION = "monto_inscripcion";

const LIST_META = {
  medios_pago: {
    label: "medio de pago",
    title: "Medios de pago",
    description: "Administrá las opciones disponibles al cobrar cuotas, inscripciones y movimientos contables.",
    icon: faMoneyBillTransfer,
    area: "Cobros",
    detail: "Cuotas, ingresos y egresos",
    summaryKey: "medios_pago_activos",
    activeSingular: "activo",
    activePlural: "activos",
    empty: "Todavía no hay medios de pago configurados.",
    subtitle: "El medio quedará disponible en Cuotas, Ingresos y Egresos.",
    maxLength: 100,
  },
  localidades: {
    label: "localidad",
    title: "Localidades",
    description: "Organizá las localidades que se pueden seleccionar en el domicilio de cada socio.",
    icon: faLocationDot,
    area: "Socios",
    detail: "Domicilios y códigos postales",
    summaryKey: "localidades_activos",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay localidades configuradas.",
    subtitle: "La localidad quedará disponible en Socios.",
    maxLength: 120,
  },
  contable_proveedores: {
    label: "persona o proveedor",
    title: "Personas y proveedores",
    description: "Gestioná la lista compartida por los formularios de otros ingresos y egresos.",
    icon: faCashRegister,
    area: "Contable",
    detail: "Personas y proveedores frecuentes",
    summaryKey: "contable_proveedores_activos",
    activeSingular: "activo",
    activePlural: "activos",
    empty: "Todavía no hay personas o proveedores contables.",
    subtitle: "La opción quedará disponible en Ingresos y Egresos.",
    maxLength: 160,
  },
  contable_categorias_ingreso: {
    label: "categoría de ingreso",
    title: "Categorías de ingresos",
    description: "Definí las categorías utilizadas para ordenar y resumir los ingresos manuales.",
    icon: faArrowTrendUp,
    area: "Ingresos",
    detail: "Clasificación principal",
    summaryKey: "contable_categorias_ingreso_activos",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay categorías de ingresos.",
    subtitle: "La categoría quedará disponible al registrar otros ingresos.",
    maxLength: 160,
  },
  contable_conceptos_ingreso: {
    label: "descripción de ingreso",
    title: "Descripciones de ingresos",
    description: "Creá conceptos reutilizables para identificar con rapidez cada ingreso manual.",
    icon: faTags,
    area: "Ingresos",
    detail: "Conceptos e imputaciones",
    summaryKey: "contable_conceptos_ingreso_activos",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay descripciones de ingresos.",
    subtitle: "La descripción quedará disponible al registrar otros ingresos.",
    maxLength: 160,
  },
  contable_categorias_egreso: {
    label: "categoría de egreso",
    title: "Categorías de egresos",
    description: "Definí las categorías principales utilizadas para ordenar y resumir los gastos.",
    icon: faArrowTrendDown,
    area: "Egresos",
    detail: "Clasificación principal",
    summaryKey: "contable_categorias_egreso_activos",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay categorías de egresos.",
    subtitle: "La categoría quedará disponible al registrar egresos.",
    maxLength: 160,
  },
  contable_conceptos_egreso: {
    label: "descripción de egreso",
    title: "Descripciones de egresos",
    description: "Creá conceptos reutilizables para detallar la imputación de cada gasto.",
    icon: faTags,
    area: "Egresos",
    detail: "Conceptos e imputaciones",
    summaryKey: "contable_conceptos_egreso_activos",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay descripciones de egresos.",
    subtitle: "La descripción quedará disponible al registrar egresos.",
    maxLength: 160,
  },
};

const CONFIG_GROUPS = {
  usuarios: {
    title: "Usuarios",
    description: "Administrá accesos, roles, contraseñas y el estado de cada usuario de la organización.",
    icon: faUsers,
    area: "Seguridad",
    detail: "Altas, bajas, roles y contraseñas",
    sections: [],
  },
  cuotas: {
    title: "Cuotas y cobros",
    description: "Configurá el importe de inscripción y los medios disponibles para registrar cobros.",
    icon: faMoneyBillTransfer,
    area: "Cuotas",
    detail: "Inscripción y medios de pago",
    sections: [
      { value: AMOUNT_SECTION, label: "Monto de inscripción" },
      { value: "medios_pago", label: "Medios de pago" },
    ],
  },
  socios: {
    title: "Socios",
    description: "Administrá las localidades y códigos postales utilizados en los domicilios.",
    icon: faLocationDot,
    area: "Socios",
    detail: "Localidades y códigos postales",
    sections: [
      { value: "localidades", label: "Localidades" },
    ],
  },
  contable: {
    title: "Configuración contable",
    description: "Centralizá proveedores, categorías y descripciones de ingresos y egresos.",
    icon: faCashRegister,
    area: "Contable",
    detail: "Proveedores, ingresos y egresos",
    sections: [
      { value: "contable_proveedores", label: "Proveedores" },
      { value: "contable_categorias_ingreso", label: "Categorías de ingresos" },
      { value: "contable_conceptos_ingreso", label: "Descripciones de ingresos" },
      { value: "contable_categorias_egreso", label: "Categorías de egresos" },
      { value: "contable_conceptos_egreso", label: "Descripciones de egresos" },
    ],
  },
};

const itemId = (item) => item.id_medio_pago || item.id_localidad || item.id_opcion;

const emptyListForm = (lista = "medios_pago") => ({
  lista,
  id: "",
  nombre: "",
  codigo_postal: "",
});

function ConfigAccessCard({ icon, title, description, status, area, detail, onClick }) {
  return (
    <button type="button" className="config-accessCard" onClick={onClick}>
      <span className="config-accessCard__icon" aria-hidden="true">
        <FontAwesomeIcon icon={icon} />
      </span>
      <strong className="config-accessCard__title">{title}</strong>
      <span className="config-accessCard__status">{status}</span>
      <span className="config-accessCard__description">{description}</span>
      <span className="config-accessCard__meta">
        <span><small>ÁREA</small>{area}</span>
        <span><small>DETALLE</small>{detail}</span>
      </span>
      <span className="config-accessCard__arrow" aria-hidden="true">
        <FontAwesomeIcon icon={faChevronRight} />
      </span>
    </button>
  );
}

function ConfigList({ items, listKey, emptyText, writable, onEdit, onState }) {
  if (!items.length) return <div className="config-list__empty">{emptyText}</div>;

  return (
    <div className="config-list">
      {items.map((item) => {
        const id = itemId(item);
        const usageCount = Number(item.cantidad_usos || 0);
        const stateAction = item.activo || usageCount === 0 ? "eliminar" : "reactivar";
        return (
          <article className={`config-list__item ${item.activo ? "" : "is-inactive"}`} key={id}>
            <div className="config-list__main">
              <strong>{item.nombre}</strong>
              <span>
                {listKey === "localidades" && item.codigo_postal
                  ? `CP ${item.codigo_postal} · `
                  : ""}
                {usageCount
                  ? `${usageCount} uso${usageCount === 1 ? "" : "s"}`
                  : "Sin uso"}
              </span>
            </div>
            <span className={`config-status ${item.activo ? "is-active" : "is-inactive"}`}>
              {item.activo ? "ACTIVO" : "INACTIVO"}
            </span>
            {writable ? (
              <div className="config-list__actions">
                <button
                  type="button"
                  className="config-iconButton"
                  onClick={() => onEdit(listKey, item)}
                  title="Editar"
                  aria-label={`Editar ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={faPen} />
                </button>
                <button
                  type="button"
                  className={`config-iconButton ${stateAction === "eliminar" ? "is-danger" : "is-success"}`}
                  onClick={() => onState(listKey, item, stateAction)}
                  title={stateAction === "eliminar" ? "Eliminar" : "Reactivar"}
                  aria-label={`${stateAction === "eliminar" ? "Eliminar" : "Reactivar"} ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={stateAction === "eliminar" ? faTrashCan : faArrowRotateLeft} />
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function ConfiguracionModule({ group = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const writable = canWrite();
  const { parametros, listas, resumen, error, cargar } = useConfiguracion();
  const activeGroup = group;
  const [activeSection, setActiveSection] = useState(
    group ? CONFIG_GROUPS[group]?.sections[0]?.value || null : null,
  );
  const [amount, setAmount] = useState("");
  const [listForm, setListForm] = useState(emptyListForm());
  const [listModalOpen, setListModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setActiveSection(
      group ? CONFIG_GROUPS[group]?.sections[0]?.value || null : null,
    );
    setFeedback(null);
  }, [group]);

  useEffect(() => {
    const configured = Number(parametros.monto_inscripcion || 0);
    setAmount(configured > 0 ? String(parametros.monto_inscripcion) : "");
  }, [parametros.monto_inscripcion]);

  const locationsActive = resumen.localidades_activos ?? resumen.localidades_activas ?? 0;

  const accessCards = useMemo(() => {
    const paymentCount = Number(resumen.medios_pago_activos || 0);
    const accountingCount = Number(resumen.contable_listas_activas || 0);

    const cards = [
      {
        id: "cuotas",
        ...CONFIG_GROUPS.cuotas,
        status: `${paymentCount} ${paymentCount === 1 ? "medio" : "medios"}`,
      },
      {
        id: "socios",
        ...CONFIG_GROUPS.socios,
        status: `${Number(locationsActive || 0)} ${Number(locationsActive || 0) === 1 ? "localidad" : "localidades"}`,
      },
      {
        id: "ventas",
        title: "Configuración de ventas",
        description: "Administrá cajas, sedes, puntos o canales y su imputación contable.",
        icon: faCashRegister,
        area: "Ventas",
        detail: "Cajas, canales e integración contable",
        status: "Cajas y canales",
        sections: [],
      },
      {
        id: "contable",
        ...CONFIG_GROUPS.contable,
        status: `${accountingCount} ${accountingCount === 1 ? "opción" : "opciones"}`,
      },
    ];

    if (writable) {
      cards.push({
        id: "usuarios",
        ...CONFIG_GROUPS.usuarios,
        status: "Administración",
      });
    }

    return cards;
  }, [locationsActive, resumen, writable]);

  const saveAmount = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarParametros({ monto_inscripcion: amount });
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openNewItem = (lista) => {
    setListForm(emptyListForm(lista));
    setListModalOpen(true);
  };

  const openEditItem = (lista, item) => {
    setListForm({
      lista,
      id: String(itemId(item)),
      nombre: item.nombre || "",
      codigo_postal: item.codigo_postal || "",
    });
    setListModalOpen(true);
  };

  const saveListItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarItem({
        ...listForm,
        id: listForm.id || null,
      });
      setListModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmState = async () => {
    if (!stateModal) return { ok: false };
    const id = itemId(stateModal.item);
    setSaving(true);
    try {
      const response = stateModal.action === "eliminar"
        ? await configuracionApi.eliminarItem(stateModal.lista, id)
        : await configuracionApi.reactivarItem(stateModal.lista, id);
      await cargar();
      return response;
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const currentMeta = LIST_META[listForm.lista] || LIST_META.medios_pago;
  const sectionMeta = activeSection && activeSection !== AMOUNT_SECTION
    ? LIST_META[activeSection]
    : null;
  const sectionActiveCount = sectionMeta
    ? activeSection === "localidades"
      ? Number(locationsActive || 0)
      : Number(resumen[sectionMeta.summaryKey] || 0)
    : 0;
  const activeGroupMeta = activeGroup ? CONFIG_GROUPS[activeGroup] : null;
  const groupTabs = activeGroupMeta?.sections.length > 1
    ? [{
      type: "tabs",
      label: `Opciones de ${activeGroupMeta.title}`,
      value: activeSection,
      onChange: (value) => {
        setFeedback(null);
        setActiveSection(value);
      },
      options: activeGroupMeta.sections,
    }]
    : [];

  const salesSettingsOpen =
    !activeGroup && new URLSearchParams(location.search).get("seccion") === "ventas";

  const feedbackNode = (
    <ModuleFeedback
      type={feedback?.type || "error"}
      message={feedback?.message || error}
      onClose={() => setFeedback(null)}
    />
  );

  if (salesSettingsOpen && !activeGroup) {
    return <VentasConfiguracion onBack={() => navigate("/configuracion")} />;
  }

  if (!activeGroup) {
    return (
      <section className="config-homePage">
        {feedbackNode}
        {!writable ? (
          <div className="module-notice">
            Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas.
          </div>
        ) : null}
        <header className="config-homeIntro">
          <span className="config-homeIntro__icon" aria-hidden="true"><FontAwesomeIcon icon={faGear} /></span>
          <div>
            <small>PANEL DE CONFIGURACIÓN</small>
            <strong>Todo organizado en accesos independientes</strong>
            <p>Ingresá a una de las áreas y elegí la opción que necesitás desde sus pestañas.</p>
          </div>
        </header>

        <nav className="config-accessGrid" aria-label="Áreas de configuración">
          {accessCards.map((card) => (
            <ConfigAccessCard
              key={card.id}
              {...card}
              onClick={() => {
                if (card.id === "ventas") {
                  navigate("/configuracion?seccion=ventas");
                  return;
                }
                navigate(`/configuracion/${card.id}`);
              }}
            />
          ))}
        </nav>
      </section>
    );
  }

  const goBack = () => navigate("/configuracion");

  return (
    <>
      <ModulePage
        className="config-sectionPage"
        title={activeGroupMeta.title}
        description={activeGroupMeta.description}
        filters={groupTabs}
        tabsInTitle={groupTabs.length > 0}
        primaryActionLabel="Agregar"
        onPrimaryAction={sectionMeta && writable ? () => openNewItem(activeSection) : undefined}
        canCreate={Boolean(sectionMeta && writable)}
        secondaryActions={[{
          key: "volver",
          label: "Volver a configuración",
          icon: faArrowLeft,
          onClick: goBack,
        }]}
        notice={!writable ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas." : null}
      >
        {feedbackNode}

        {activeSection === AMOUNT_SECTION ? (
          <section className="config-detailPanel config-detailPanel--amount">
            <div className="config-detailPanel__lead">
              <span className="config-detailPanel__icon"><FontAwesomeIcon icon={faCashRegister} /></span>
              <div>
                <small>CUOTAS</small>
                <h2>Importe predeterminado</h2>
                <p>Este es el valor oficial que el backend utilizará al registrar cada inscripción.</p>
              </div>
            </div>
            <form className="config-amountForm" onSubmit={saveAmount}>
              <label className="entity-field">
                <span>Monto predeterminado *</span>
                <input
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0,00"
                  required
                  disabled={!writable || saving}
                />
              </label>
              <div className="config-amountPreview">
                <small>VALOR ACTUAL</small>
                <strong>{money(parametros.monto_inscripcion)}</strong>
              </div>
              {writable ? (
                <button className="mov-btn mov-btn--primary" type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar monto"}
                </button>
              ) : null}
            </form>
          </section>
        ) : (
          <section className="config-detailPanel config-detailPanel--list">
            <header className="config-listSummary">
              <span className="config-detailPanel__icon"><FontAwesomeIcon icon={sectionMeta.icon} /></span>
              <div>
                <small>{sectionMeta.area.toLocaleUpperCase("es-AR")}</small>
                <h2>{sectionMeta.title}</h2>
                <p>{sectionMeta.detail}</p>
              </div>
              <span className="config-listSummary__count">
                <strong>{sectionActiveCount}</strong>
                <small>{sectionActiveCount === 1 ? sectionMeta.activeSingular : sectionMeta.activePlural}</small>
              </span>
            </header>
            <ConfigList
              items={listas[activeSection] || []}
              listKey={activeSection}
              emptyText={sectionMeta.empty}
              writable={writable}
              onEdit={openEditItem}
              onState={(lista, item, action) => setStateModal({ lista, item, action })}
            />
          </section>
        )}
      </ModulePage>

      <CrudModal
        open={listModalOpen}
        title={`${listForm.id ? "Editar" : "Agregar"} ${currentMeta.label}`}
        subtitle={currentMeta.subtitle}
        onClose={() => setListModalOpen(false)}
        onSubmit={saveListItem}
        saving={saving}
        submitLabel={listForm.id ? "Guardar cambios" : "Agregar"}
      >
        <div className="entity-form">
          <div className="entity-form__grid entity-form__grid--single">
            <label className="entity-field">
              <span>Nombre *</span>
              <input
                value={listForm.nombre}
                onChange={(event) => setListForm((current) => ({ ...current, nombre: upper(event.target.value) }))}
                maxLength={currentMeta.maxLength}
                required
                autoFocus
              />
            </label>
            {listForm.lista === "localidades" ? (
              <label className="entity-field">
                <span>Código postal</span>
                <input
                  value={listForm.codigo_postal}
                  onChange={(event) => setListForm((current) => ({ ...current, codigo_postal: upper(event.target.value) }))}
                  maxLength={20}
                />
              </label>
            ) : null}
          </div>
        </div>
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.action === "reactivar"
          ? "alta"
          : Number(stateModal?.item?.cantidad_usos || 0) === 0
            ? "eliminar"
            : "baja"}
        row={stateModal?.item || null}
        title={stateModal?.action === "reactivar"
          ? "Reactivar opción"
          : Number(stateModal?.item?.cantidad_usos || 0) === 0
            ? "Eliminar opción"
            : "Desactivar opción"}
        message={stateModal?.action === "reactivar"
          ? "La opción volverá a estar disponible en los formularios del sistema."
          : Number(stateModal?.item?.cantidad_usos || 0) === 0
            ? "La opción no tiene registros asociados y se eliminará definitivamente."
            : "La opción tiene registros asociados y se desactivará para conservar el historial."}
        warning={stateModal?.action === "eliminar" && Number(stateModal?.item?.cantidad_usos || 0) === 0
          ? "Esta acción no se puede deshacer."
          : ""}
        confirmLabel={stateModal?.action === "reactivar"
          ? "Reactivar"
          : Number(stateModal?.item?.cantidad_usos || 0) === 0
            ? "Eliminar"
            : "Desactivar"}
        loadingLabel={stateModal?.action === "reactivar" ? "Reactivando..." : "Procesando..."}
        loadingMessage={stateModal?.action === "reactivar" ? "Reactivando opción…" : "Procesando opción…"}
        successMessage={stateModal?.action === "reactivar"
          ? "Opción reactivada correctamente."
          : Number(stateModal?.item?.cantidad_usos || 0) === 0
            ? "Opción eliminada correctamente."
            : "Opción desactivada correctamente."}
        errorMessage="No se pudo actualizar la opción."
        details={stateModal ? [
          { label: "Opción", value: stateModal.item?.nombre },
          { label: "Sección", value: LIST_META[stateModal.lista]?.title },
          { label: "Usos", value: Number(stateModal.item?.cantidad_usos || 0) },
        ] : []}
        onClose={() => setStateModal(null)}
        onConfirm={confirmState}
        loading={saving}
      />
    </>
  );
}
