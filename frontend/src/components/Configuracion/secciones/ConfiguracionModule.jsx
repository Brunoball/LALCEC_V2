import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRotateLeft,
  faChevronRight,
  faFileInvoiceDollar,
  faGear,
  faMoneyBillTransfer,
  faPen,
  faSliders,
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
import "../configuracion.css";

const upper = (value) => String(value ?? "").toLocaleUpperCase("es-AR");

const CATALOG_META = {
  medios_pago: {
    label: "medio de pago",
    title: "Medios de pago",
    description: "Opciones disponibles para socios y para registrar el cobro de cuotas.",
    detail: "Se utilizan como medio habitual del socio y como medio real de cada pago.",
    icon: faMoneyBillTransfer,
    idField: "id_medio_pago",
    activeSingular: "activo",
    activePlural: "activos",
    empty: "Todavía no hay medios de pago configurados.",
    maxLength: 100,
  },
  condiciones_iva: {
    label: "condición frente al IVA",
    title: "Condiciones frente al IVA",
    description: "Condiciones fiscales disponibles al registrar o editar una empresa.",
    detail: "Se aplican únicamente a socios de tipo empresa.",
    icon: faFileInvoiceDollar,
    idField: "id_condicion_iva",
    activeSingular: "activa",
    activePlural: "activas",
    empty: "Todavía no hay condiciones frente al IVA configuradas.",
    maxLength: 100,
  },
};

const emptyForm = (lista = "medios_pago") => ({
  lista,
  id: "",
  nombre: "",
});

function AccessCard({ icon, title, description, status, area, detail, onClick }) {
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

function ConfigurationHome() {
  const navigate = useNavigate();

  const cards = [
    {
      id: "usuarios",
      title: "Usuarios y roles",
      description: "Creá, editá, eliminá o desactivá usuarios y definí qué rol tiene cada acceso.",
      icon: faUsers,
      status: "Seguridad",
      area: "Usuarios",
      detail: "Administradores y solo lectura",
      path: "/configuracion/usuarios",
    },
    {
      id: "catalogos",
      title: "Catálogos generales",
      description: "Administrá en una sola caja los medios de pago y las condiciones frente al IVA.",
      icon: faSliders,
      status: "2 pestañas",
      area: "Sistema",
      detail: "Medios de pago y condición IVA",
      path: "/configuracion/catalogos",
    },
  ];

  return (
    <section className="config-homePage">
      <header className="config-homeIntro">
        <span className="config-homeIntro__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faGear} />
        </span>
        <div>
          <small>CONFIGURACIÓN DEL SISTEMA</small>
          <strong>Solo las opciones que utiliza LALCEC V2</strong>
          <p>Gestioná usuarios, roles y los catálogos generales vinculados con socios, empresas y pagos.</p>
        </div>
      </header>

      <nav className="config-accessGrid config-accessGrid--compact" aria-label="Secciones de configuración">
        {cards.map((card) => (
          <AccessCard key={card.id} {...card} onClick={() => navigate(card.path)} />
        ))}
      </nav>
    </section>
  );
}

function CatalogList({ items, meta, writable, onEdit, onState }) {
  if (!items.length) {
    return <div className="config-list__empty">{meta.empty}</div>;
  }

  return (
    <div className="config-list">
      {items.map((item) => {
        const id = item[meta.idField];
        const usageCount = Number(item.cantidad_usos || 0);
        const active = Boolean(item.activo);
        const stateAction = active ? "eliminar" : "reactivar";

        return (
          <article className={`config-list__item ${active ? "" : "is-inactive"}`} key={id}>
            <div className="config-list__main">
              <strong>{item.nombre}</strong>
              <span>
                {usageCount > 0
                  ? `${usageCount} registro${usageCount === 1 ? "" : "s"} asociado${usageCount === 1 ? "" : "s"}`
                  : "Sin registros asociados"}
              </span>
            </div>
            <span className={`config-status ${active ? "is-active" : "is-inactive"}`}>
              {active ? "ACTIVO" : "INACTIVO"}
            </span>
            {writable ? (
              <div className="config-list__actions">
                <button
                  type="button"
                  className="config-iconButton"
                  onClick={() => onEdit(item)}
                  title={`Editar ${meta.label}`}
                  aria-label={`Editar ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={faPen} />
                </button>
                <button
                  type="button"
                  className={`config-iconButton ${active ? "is-danger" : "is-success"}`}
                  onClick={() => onState(item, stateAction)}
                  title={active ? (usageCount ? "Dar de baja" : "Eliminar") : "Reactivar"}
                  aria-label={`${active ? (usageCount ? "Dar de baja" : "Eliminar") : "Reactivar"} ${item.nombre}`}
                >
                  <FontAwesomeIcon icon={active ? faTrashCan : faArrowRotateLeft} />
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function CatalogsPanel() {
  const navigate = useNavigate();
  const writable = canWrite();
  const { listas, resumen, loading, error, cargar } = useConfiguracion();
  const [activeList, setActiveList] = useState("medios_pago");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleModalToast = useCallback((type, message, duration) => {
    setFeedback({ type, message, duration });
  }, []);

  const meta = CATALOG_META[activeList];
  const items = useMemo(() => listas[activeList] || [], [listas, activeList]);
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-AR");
    if (!term) return items;
    return items.filter((item) => String(item.nombre || "").toLocaleLowerCase("es-AR").includes(term));
  }, [items, search]);

  const activeCount = Number(resumen[`${activeList}_activos`] || 0);

  const openCreate = () => {
    setFeedback(null);
    setForm(emptyForm(activeList));
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setFeedback(null);
    setForm({
      lista: activeList,
      id: String(item[meta.idField]),
      nombre: item.nombre || "",
    });
    setFormOpen(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await configuracionApi.guardarItem({
        lista: form.lista,
        id: form.id || null,
        nombre: form.nombre.trim(),
      });
      setFormOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (requestError) {
      setFeedback({ type: "error", message: requestError.message || `No se pudo guardar el ${meta.label}.` });
    } finally {
      setSaving(false);
    }
  };

  const confirmState = async () => {
    if (!stateModal) return { ok: false };
    setSaving(true);
    try {
      const id = stateModal.item[meta.idField];
      const response = stateModal.action === "reactivar"
        ? await configuracionApi.reactivarItem(activeList, id)
        : await configuracionApi.eliminarItem(activeList, id);
      await cargar();
      return response;
    } finally {
      setSaving(false);
    }
  };

  const usageCount = Number(stateModal?.item?.cantidad_usos || 0);
  const definitiveDelete = stateModal?.action === "eliminar" && usageCount === 0;

  return (
    <>
      <ModulePage
        className="config-sectionPage"
        title="Catálogos generales"
        description="Medios de pago y condiciones frente al IVA en una única sección con pestañas."
        filters={[{
          key: "catalog-search",
          type: "search",
          label: "Búsqueda",
          value: search,
          onChange: setSearch,
          placeholder: `Buscar ${meta.label}`,
        }]}
        primaryActionLabel={`Nuevo ${meta.label}`}
        onPrimaryAction={writable ? openCreate : undefined}
        canCreate={writable}
        secondaryActions={[{
          key: "volver",
          label: "Volver a configuración",
          icon: faArrowLeft,
          onClick: () => navigate("/configuracion"),
        }]}
        notice={!writable ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas." : null}
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          onClose={() => setFeedback(null)}
        />

        <section className="config-detailPanel config-detailPanel--list config-catalogPanel">
          <header className="config-catalogHeader">
            <div className="config-catalogHeader__intro">
              <span className="config-detailPanel__icon" aria-hidden="true">
                <FontAwesomeIcon icon={meta.icon} />
              </span>
              <div>
                <small>CATÁLOGOS DEL SISTEMA</small>
                <h2>{meta.title}</h2>
                <p>{meta.description}</p>
              </div>
            </div>

            <div className="config-catalogTabs" role="tablist" aria-label="Catálogos generales">
              {Object.entries(CATALOG_META).map(([key, option]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeList === key}
                  className={activeList === key ? "is-active" : ""}
                  onClick={() => {
                    setActiveList(key);
                    setSearch("");
                    setFeedback(null);
                  }}
                >
                  <FontAwesomeIcon icon={option.icon} />
                  {option.title}
                </button>
              ))}
            </div>
          </header>

          <div className="config-catalogSummary">
            <div>
              <strong>{meta.detail}</strong>
              <span>
                {loading
                  ? "Cargando opciones..."
                  : `Mostrando ${filteredItems.length} de ${items.length} opciones`}
              </span>
            </div>
            <span className="config-listSummary__count">
              <strong>{activeCount}</strong>
              <small>{activeCount === 1 ? meta.activeSingular : meta.activePlural}</small>
            </span>
          </div>

          {!loading ? (
            <CatalogList
              items={filteredItems}
              meta={meta}
              writable={writable}
              onEdit={openEdit}
              onState={(item, action) => setStateModal({ item, action })}
            />
          ) : null}
        </section>
      </ModulePage>

      <CrudModal
        open={formOpen}
        title={`${form.id ? "Editar" : "Agregar"} ${meta.label}`}
        subtitle={form.lista === "medios_pago"
          ? "La opción estará disponible en socios y pagos nuevos."
          : "La opción estará disponible en el formulario de empresas."}
        onClose={() => setFormOpen(false)}
        onSubmit={saveItem}
        saving={saving}
        submitLabel={form.id ? "Guardar cambios" : "Agregar"}
      >
        <div className="entity-form">
          <div className="entity-form__grid entity-form__grid--single">
            <label className="entity-field">
              <span>Nombre *</span>
              <input
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: upper(event.target.value) }))}
                maxLength={meta.maxLength}
                required
                autoFocus
              />
            </label>
          </div>
        </div>
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.action === "reactivar" ? "alta" : definitiveDelete ? "eliminar" : "baja"}
        row={stateModal?.item || null}
        title={stateModal?.action === "reactivar"
          ? `Reactivar ${meta.label}`
          : definitiveDelete
            ? `Eliminar ${meta.label}`
            : `Dar de baja ${meta.label}`}
        message={stateModal?.action === "reactivar"
          ? "La opción volverá a aparecer en los formularios del sistema."
          : definitiveDelete
            ? "La opción no fue utilizada y se eliminará definitivamente."
            : "La opción posee registros asociados. Se dará de baja para conservar el historial y dejará de aparecer en nuevas operaciones."}
        warning={definitiveDelete ? "Esta acción no se puede deshacer." : "Los registros existentes conservarán esta opción asociada."}
        confirmLabel={stateModal?.action === "reactivar" ? "Reactivar" : definitiveDelete ? "Eliminar" : "Dar de baja"}
        loadingLabel={stateModal?.action === "reactivar" ? "Reactivando..." : "Procesando..."}
        loadingMessage={stateModal?.action === "reactivar" ? "Reactivando opción…" : "Actualizando opción…"}
        successMessage={stateModal?.action === "reactivar"
          ? "Opción reactivada correctamente."
          : definitiveDelete
            ? "Opción eliminada correctamente."
            : "Opción dada de baja correctamente."}
        errorMessage="No se pudo actualizar la opción."
        details={stateModal ? [
          { label: "Opción", value: stateModal.item?.nombre },
          { label: "Sección", value: meta.title },
          { label: "Registros asociados", value: usageCount },
        ] : []}
        onClose={() => setStateModal(null)}
        onConfirm={confirmState}
        onToast={handleModalToast}
        loading={saving}
      />
    </>
  );
}

export default function ConfiguracionModule({ group = null }) {
  if (group === "catalogos") return <CatalogsPanel />;
  return <ConfigurationHome />;
}
