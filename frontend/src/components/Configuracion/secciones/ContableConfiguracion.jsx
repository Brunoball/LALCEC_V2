import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowLeft,
  faArrowUp,
  faCalculator,
  faList,
  faPen,
  faTag,
  faTrashCan,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/ModulePage";
import CrudModal from "../../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/ModuleFeedback";
import { canWrite } from "../../_shared/auth/session";
import { contableApi } from "../../Contable/api/contableApi";
import "../configuracion.css";

const upper = (value) => String(value ?? "").toLocaleUpperCase("es-AR");

const LIST_META = {
  PROVEEDOR: {
    label: "persona o proveedor",
    createLabel: "Nueva persona o proveedor",
    title: "Personas / proveedores",
    description: "Opciones disponibles para identificar de quién proviene un ingreso o a quién se realiza un egreso.",
    detail: "Se comparte entre otros ingresos y egresos.",
    icon: faUser,
    empty: "Todavía no hay personas o proveedores configurados.",
  },
  CATEGORIA_INGRESO: {
    label: "categoría de ingreso",
    createLabel: "Nueva categoría de ingreso",
    title: "Categorías de ingresos",
    description: "Clasificación general utilizada al registrar ingresos ajenos a las cuotas de socios.",
    detail: "Ejemplos: donaciones, eventos o campañas.",
    icon: faArrowUp,
    empty: "Todavía no hay categorías de ingresos configuradas.",
  },
  CONCEPTO_INGRESO: {
    label: "concepto de ingreso",
    createLabel: "Nuevo concepto de ingreso",
    title: "Conceptos de ingresos",
    description: "Motivos concretos que aparecen en el selector de otros ingresos.",
    detail: "Permiten detallar el origen de cada ingreso manual.",
    icon: faList,
    empty: "Todavía no hay conceptos de ingresos configurados.",
  },
  CATEGORIA_EGRESO: {
    label: "categoría de egreso",
    createLabel: "Nueva categoría de egreso",
    title: "Categorías de egresos",
    description: "Clasificación general utilizada para ordenar los gastos de la asociación.",
    detail: "Ejemplos: servicios, insumos o mantenimiento.",
    icon: faArrowDown,
    empty: "Todavía no hay categorías de egresos configuradas.",
  },
  CONCEPTO_EGRESO: {
    label: "concepto de egreso",
    createLabel: "Nuevo concepto de egreso",
    title: "Conceptos de egresos",
    description: "Motivos concretos que aparecen en el selector al registrar un egreso.",
    detail: "Permiten identificar rápidamente para qué se realizó el gasto.",
    icon: faTag,
    empty: "Todavía no hay conceptos de egresos configurados.",
  },
};

const initialLists = Object.keys(LIST_META).reduce((result, key) => {
  result[key] = [];
  return result;
}, {});

function OptionList({ items, meta, writable, onEdit, onDelete }) {
  if (!items.length) return <div className="config-list__empty">{meta.empty}</div>;

  return (
    <div className="config-list">
      {items.map((item) => (
        <article className="config-list__item" key={item.id_opcion}>
          <div className="config-list__main">
            <strong>{item.nombre}</strong>
            <span>Disponible en los selectores de Contabilidad</span>
          </div>
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
                className="config-iconButton is-danger"
                onClick={() => onDelete(item)}
                title={`Eliminar ${meta.label}`}
                aria-label={`Eliminar ${item.nombre}`}
              >
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export default function ContableConfiguracion() {
  const navigate = useNavigate();
  const writable = canWrite();
  const requestId = useRef(0);
  const [activeType, setActiveType] = useState("PROVEEDOR");
  const [lists, setLists] = useState(initialLists);
  const [summary, setSummary] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ id_opcion: "", tipo: "PROVEEDOR", nombre: "" });
  const [deleteModal, setDeleteModal] = useState(null);

  const meta = LIST_META[activeType];
  const items = useMemo(() => lists[activeType] || [], [lists, activeType]);
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-AR");
    if (!term) return items;
    return items.filter((item) =>
      String(item.nombre || "").toLocaleLowerCase("es-AR").includes(term),
    );
  }, [items, search]);
  const totalCount = Number(summary[`${activeType}_total`] ?? items.length);

  const loadOptions = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await contableApi.opcionesConfiguracion();
      if (currentRequest === requestId.current) {
        setLists({ ...initialLists, ...(response.listas || {}) });
        setSummary(response.resumen || {});
      }
      return response;
    } catch (error) {
      if (currentRequest === requestId.current) {
        setFeedback({
          type: "error",
          message: error.message || "No se pudo cargar la configuración contable.",
        });
      }
      return null;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
    return () => {
      requestId.current += 1;
    };
  }, [loadOptions]);

  const openCreate = () => {
    setFeedback(null);
    setForm({ id_opcion: "", tipo: activeType, nombre: "" });
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setFeedback(null);
    setForm({
      id_opcion: String(item.id_opcion),
      tipo: item.tipo,
      nombre: item.nombre || "",
    });
    setFormOpen(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await contableApi.guardarOpcion({
        id_opcion: form.id_opcion || null,
        tipo: form.tipo,
        nombre: form.nombre.trim(),
      });
      setFormOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await loadOptions();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || `No se pudo guardar la ${meta.label}.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal) return { ok: false };
    setSaving(true);
    try {
      const response = await contableApi.eliminarOpcion(deleteModal.id_opcion);
      await loadOptions();
      return response;
    } finally {
      setSaving(false);
    }
  };

  const handleModalToast = useCallback((type, message, duration) => {
    setFeedback({ type, message, duration });
  }, []);

  return (
    <>
      <ModulePage
        className="config-sectionPage"
        title="Configuración contable"
        description="Administrá las opciones que aparecen en los selectores de otros ingresos y egresos."
        filters={[{
          key: "contable-search",
          type: "search",
          label: "Búsqueda",
          value: search,
          onChange: setSearch,
          placeholder: `Buscar ${meta.label}`,
        }]}
        primaryActionLabel={meta.createLabel}
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
          message={feedback?.message || ""}
          onClose={() => setFeedback(null)}
        />

        <section className="config-detailPanel config-detailPanel--list config-catalogPanel">
          <header className="config-catalogHeader config-catalogHeader--contable">
            <div className="config-catalogHeader__intro">
              <span className="config-detailPanel__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faCalculator} />
              </span>
              <div>
                <small>LISTAS DE CONTABILIDAD</small>
                <h2>{meta.title}</h2>
                <p>{meta.description}</p>
              </div>
            </div>

            <div
              className="config-catalogTabs config-catalogTabs--contable"
              role="tablist"
              aria-label="Listas contables"
            >
              {Object.entries(LIST_META).map(([type, option]) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={activeType === type}
                  className={activeType === type ? "is-active" : ""}
                  onClick={() => {
                    setActiveType(type);
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
              <strong>{totalCount}</strong>
              <small>{totalCount === 1 ? "opción" : "opciones"}</small>
            </span>
          </div>

          {!loading ? (
            <OptionList
              items={filteredItems}
              meta={meta}
              writable={writable}
              onEdit={openEdit}
              onDelete={setDeleteModal}
            />
          ) : null}
        </section>
      </ModulePage>

      <CrudModal
        open={formOpen}
        title={`${form.id_opcion ? "Editar" : "Agregar"} ${meta.label}`}
        subtitle="La opción aparecerá inmediatamente en los formularios de Contabilidad."
        onClose={() => setFormOpen(false)}
        onSubmit={saveItem}
        saving={saving}
        submitLabel={form.id_opcion ? "Guardar cambios" : "Agregar"}
      >
        <div className="entity-form">
          <div className="entity-form__grid entity-form__grid--single">
            <label className="entity-field">
              <span>Nombre *</span>
              <input
                value={form.nombre}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  nombre: upper(event.target.value),
                }))}
                maxLength={160}
                required
                autoFocus
              />
            </label>
          </div>
        </div>
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(deleteModal)}
        operacion="eliminar"
        row={deleteModal}
        title={`Eliminar ${meta.label}`}
        message="La opción se eliminará definitivamente de la configuración y dejará de aparecer en los selectores."
        warning="Los ingresos y egresos ya registrados conservan el nombre que tenían guardado. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loadingLabel="Eliminando..."
        loadingMessage="Eliminando opción…"
        successMessage="Opción eliminada correctamente."
        errorMessage="No se pudo eliminar la opción contable."
        details={deleteModal ? [
          { label: "Opción", value: deleteModal.nombre },
          { label: "Lista", value: meta.title },
        ] : []}
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        onToast={handleModalToast}
        loading={saving}
      />
    </>
  );
}
