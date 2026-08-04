import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faCheckCircle,
  faClockRotateLeft,
  faPen,
  faRotateLeft,
  faTags,
  faToggleOff,
  faTrashCan,
  faUsers,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/components/ModulePage";
import CrudModal from "../../Global/components/CrudModal";
import InfoModal, {
  InfoEmpty,
  InfoRow,
  InfoSection,
  InfoSummary,
} from "../../Global/components/InfoModal";
import ModalEliminarGlobal from "../../Global/components/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/components/ModuleFeedback";
import {
  EntityFormPanel,
  EntityTabs,
  FloatingField,
} from "../../Global/components/TabbedForm";
import { canWrite } from "../../Global/auth/session";
import { categoriasApi } from "../api/categoriasApi";
import { useCategorias } from "../hooks/useCategorias";
import { useDescuentosFamiliares } from "../hooks/useDescuentosFamiliares";
import "./Categorias.css";
import "./CategoriasModal.css";

const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const openDatePicker = (event) => {
  const input = event.currentTarget;
  if (typeof input.showPicker !== "function") return;

  try {
    input.showPicker();
  } catch {
    // El navegador mantiene el comportamiento nativo si no permite abrirlo.
  }
};

const upper = (value) => value.toLocaleUpperCase("es-AR");
const CATEGORY_TAB_GENERAL = "general";
const CATEGORY_TAB_PRICE = "price";
const money = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(value || 0),
  );
const percentage = (value) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(value || 0))}%`;
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "ACTUAL";

const emptyCategoryForm = () => ({
  id_categoria: "",
  nombre: "",
  descripcion: "",
  monto_actual: "",
  vigente_desde: dateToday(),
  motivo_precio: "",
});

const emptyDiscountForm = () => ({
  id_descuento_familiar: "",
  cantidad_integrantes: "2",
  porcentaje_descuento: "",
});

function CategoryForm({ form, setForm, activeTab, onTabChange }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="entity-form categorias-modal__form">
      <EntityTabs
        tabs={[
          {
            value: CATEGORY_TAB_GENERAL,
            label: "Datos generales",
            icon: faTags,
          },
          {
            value: CATEGORY_TAB_PRICE,
            label: "Precio y vigencia",
            icon: faWallet,
          },
        ]}
        value={activeTab}
        onChange={onTabChange}
        idPrefix="categoria-form-tab"
        ariaLabel="Secciones de la categoría"
      />

      {activeTab === CATEGORY_TAB_GENERAL ? (
        <EntityFormPanel
          tabValue={CATEGORY_TAB_GENERAL}
          idPrefix="categoria-form-tab"
          eyebrow="Identificación"
          title="Datos generales de la categoría"
          icon={faTags}
          tag="Paso 1 de 2"
          bodyClassName="entity-form__grid entity-form__grid--single"
          hint="Definí un nombre claro y una descripción breve para identificar la categoría en socios, cuotas y reportes."
        >
          <FloatingField label="Nombre *" active={Boolean(form.nombre)}>
            <input
              value={form.nombre}
              placeholder=" "
              onChange={(event) => update("nombre", upper(event.target.value))}
              required
              maxLength={120}
              autoFocus
            />
          </FloatingField>
          <FloatingField
            label="Descripción"
            active={Boolean(form.descripcion)}
            textarea
          >
            <textarea
              value={form.descripcion}
              placeholder=" "
              onChange={(event) =>
                update("descripcion", upper(event.target.value))
              }
              rows={3}
              maxLength={500}
            />
          </FloatingField>
        </EntityFormPanel>
      ) : (
        <EntityFormPanel
          tabValue={CATEGORY_TAB_PRICE}
          idPrefix="categoria-form-tab"
          eyebrow="Configuración económica"
          title="Precio mensual y vigencia"
          icon={faWallet}
          tag={form.id_categoria ? "Actualización" : "Precio inicial"}
          bodyClassName="entity-form__grid categorias-price-panel__body"
          hint="Los importes semestrales y anuales se calculan automáticamente a partir del monto mensual."
        >
          <FloatingField
            label="Monto mensual *"
            active={form.monto_actual !== ""}
          >
            <input
              type="number"
              placeholder=" "
              min="0"
              max="9999999999.99"
              step="0.01"
              value={form.monto_actual}
              onChange={(event) => update("monto_actual", event.target.value)}
              required
            />
          </FloatingField>
          <FloatingField label="Vigente desde *" active>
            <input
              type="date"
              value={form.vigente_desde}
              max={dateToday()}
              onClick={openDatePicker}
              onChange={(event) => update("vigente_desde", event.target.value)}
              required
            />
          </FloatingField>
          <FloatingField
            label="Motivo del precio"
            active={Boolean(form.motivo_precio)}
            wide
          >
            <input
              value={form.motivo_precio}
              placeholder=" "
              onChange={(event) =>
                update("motivo_precio", upper(event.target.value))
              }
              maxLength={255}
            />
          </FloatingField>
        </EntityFormPanel>
      )}
    </div>
  );
}

function DiscountForm({ form, setForm }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="entity-form categorias-discount-form">
      <EntityFormPanel
        tabValue="discount-rule"
        eyebrow="Regla global"
        title="Umbral y porcentaje"
        icon={faUsers}
        tag="Descuento familiar"
        standalone
        bodyClassName="entity-form__grid entity-form__grid--single categorias-discount-panel__body"
        hint="La regla se aplica desde esa cantidad hasta el siguiente umbral. El porcentaje es global y no depende de una categoría."
      >
        <FloatingField label="Cantidad mínima de integrantes *" active>
          <input
            type="number"
            placeholder=" "
            min="2"
            max="50"
            step="1"
            value={form.cantidad_integrantes}
            onChange={(event) =>
              update("cantidad_integrantes", event.target.value)
            }
            required
          />
        </FloatingField>
        <FloatingField
          label="Porcentaje de descuento *"
          active={form.porcentaje_descuento !== ""}
        >
          <input
            type="number"
            placeholder=" "
            min="0.01"
            max="100"
            step="0.01"
            value={form.porcentaje_descuento}
            onChange={(event) =>
              update("porcentaje_descuento", event.target.value)
            }
            required
          />
        </FloatingField>
      </EntityFormPanel>
    </div>
  );
}

export default function CategoriasModule({ section = "categorias" }) {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const filters = useMemo(
    () => ({ buscar: search, estado: status }),
    [search, status],
  );
  const { items, loading, error, cargar } = useCategorias(filters);
  const {
    items: discounts,
    loading: discountsLoading,
    error: discountsError,
    cargar: cargarDescuentos,
  } = useDescuentosFamiliares();

  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [categoryFormTab, setCategoryFormTab] = useState(CATEGORY_TAB_GENERAL);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm());
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [deleteDiscountModal, setDeleteDiscountModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const openNewCategory = () => {
    setCategoryForm(emptyCategoryForm());
    setCategoryFormTab(CATEGORY_TAB_GENERAL);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (item) => {
    setCategoryForm({
      id_categoria: item.id_categoria,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      monto_actual: item.monto_actual,
      vigente_desde: dateToday(),
      motivo_precio: "",
    });
    setCategoryFormTab(CATEGORY_TAB_GENERAL);
    setCategoryModalOpen(true);
  };

  const openNewDiscount = () => {
    setDiscountForm(emptyDiscountForm());
    setDiscountModalOpen(true);
  };

  const openEditDiscount = (item) => {
    setDiscountForm({
      id_descuento_familiar: item.id_descuento_familiar,
      cantidad_integrantes: String(item.cantidad_integrantes),
      porcentaje_descuento: String(item.porcentaje_descuento),
    });
    setDiscountModalOpen(true);
  };

  const saveCategory = async (event) => {
    event.preventDefault();

    if (!categoryForm.nombre.trim()) {
      setCategoryFormTab(CATEGORY_TAB_GENERAL);
      setFeedback({
        type: "error",
        message: "Completá el nombre de la categoría.",
      });
      return;
    }
    if (
      categoryForm.monto_actual === "" ||
      Number(categoryForm.monto_actual) < 0
    ) {
      setCategoryFormTab(CATEGORY_TAB_PRICE);
      setFeedback({
        type: "error",
        message: "Ingresá un monto mensual válido.",
      });
      return;
    }
    if (!categoryForm.vigente_desde) {
      setCategoryFormTab(CATEGORY_TAB_PRICE);
      setFeedback({
        type: "error",
        message: "Seleccioná desde cuándo estará vigente el precio.",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await categoriasApi.guardar(categoryForm);
      setCategoryModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveDiscount = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response =
        await categoriasApi.guardarDescuentoFamiliar(discountForm);
      setDiscountModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargarDescuentos();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const changeCategoryState = async () => {
    if (!stateModal) return;
    const response = stateModal.activo
      ? await categoriasApi.darBaja(stateModal.id_categoria)
      : await categoriasApi.reactivar(stateModal.id_categoria);
    await cargar();
    return response;
  };

  const deleteDiscount = async () => {
    if (!deleteDiscountModal) return;
    const response = await categoriasApi.eliminarDescuentoFamiliar(
      deleteDiscountModal.id_descuento_familiar,
    );
    await cargarDescuentos();
    return response;
  };

  const openHistory = async (item) => {
    setHistoryModal(item);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await categoriasApi.historial(item.id_categoria);
      setHistory(response.items || []);
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
      setHistoryModal(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const activeError = section === "categorias" ? error : discountsError;
  const activeLoading = section === "categorias" ? loading : discountsLoading;
  const historyIsActive =
    historyModal?.activo === true || Number(historyModal?.activo) === 1;
  const primaryAction =
    section === "categorias" ? openNewCategory : openNewDiscount;
  const primaryLabel =
    section === "categorias" ? "Nueva categoría" : "Nuevo descuento";
  const pageFilters = section === "categorias"
    ? [
        {
          key: "estado",
          label: "Estado",
          type: "tabs",
          ariaLabel: "Estado de las categorías",
          value: status,
          onChange: (value) => {
            setStatus(value);
            setFeedback(null);
          },
          options: [
            { value: "activo", label: "Activas" },
            { value: "inactivo", label: "Dadas de baja" },
          ],
        },
        {
          key: "buscar",
          label: "Búsqueda",
          type: "search",
          placeholder: " ",
          value: search,
          onChange: setSearch,
        },
      ]
    : [];

  return (
    <>
      <ModulePage
        title={section === "categorias" ? "Categorías" : "Descuentos familiares"}
        description={
          section === "descuentos"
            ? "Configurá los descuentos automáticos según la cantidad de integrantes activos de cada familia."
            : undefined
        }
        filters={pageFilters}
        tabsInTitle={section === "categorias"}
        primaryActionLabel={primaryLabel}
        onPrimaryAction={primaryAction}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || activeError}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />


        {section === "categorias" ? (
          <div
            className="global-divTable categorias-table"
            role="table"
            aria-label="Listado de categorías"
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head categorias-grid"
                role="row"
              >
                {[
                  "Categoría",
                  "Descripción",
                  "Monto mensual",
                  "Socios",
                  "Estado",
                  "Actualización",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {loading && !items.length ? (
                <div className="module-empty">
                  <strong>Cargando categorías...</strong>
                  <span>Consultando precios e historial.</span>
                </div>
              ) : null}
              {!loading && !error && !items.length ? (
                <div className="module-empty">
                  <strong>Sin categorías para mostrar</strong>
                  <span>Creá la primera categoría o cambiá los filtros.</span>
                </div>
              ) : null}
              {items.map((item) => (
                <div
                  className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row categorias-grid"
                  role="row"
                  key={item.id_categoria}
                >
                  <div className="mov-gridCell is-strong">{item.nombre}</div>
                  <div className="mov-gridCell">
                    <span className="entity-wrap-text">
                      {item.descripcion || "—"}
                    </span>
                  </div>
                  <div className="mov-gridCell is-strong">
                    {money(item.monto_actual)}
                  </div>
                  <div className="mov-gridCell is-center">
                    <span className="mov-chip">{item.cantidad_socios}</span>
                  </div>
                  <div className="mov-gridCell">
                    <span
                      className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                    >
                      {item.activo ? "ACTIVA" : "BAJA"}
                    </span>
                  </div>
                  <div className="mov-gridCell">
                    {formatDate(item.updated_at?.slice(0, 10))}
                  </div>
                  <div className="mov-gridCell mov-gridCell--actions">
                    <div className="mov-actionsInline">
                      <button
                        className="mov-iconBtn"
                        type="button"
                        title="Ver historial de precios"
                        onClick={() => openHistory(item)}
                      >
                        <FontAwesomeIcon icon={faClockRotateLeft} />
                      </button>
                      {writable ? (
                        <>
                          <button
                            className="mov-iconBtn"
                            type="button"
                            title="Editar"
                            onClick={() => openEditCategory(item)}
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          <button
                            className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`}
                            type="button"
                            title={item.activo ? "Dar de baja" : "Reactivar"}
                            onClick={() => setStateModal(item)}
                          >
                            <FontAwesomeIcon
                              icon={item.activo ? faToggleOff : faRotateLeft}
                            />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="global-divTable categorias-discountsTable"
            role="table"
            aria-label="Descuentos familiares"
          >
            <div
              className="mov-tableWrap global-divTable__wrap entity-table-wrap"
              role="rowgroup"
            >
              <div
                className="mov-gridTable mov-gridTable--head global-divTable__head categorias-discountsGrid"
                role="row"
              >
                {[
                  "Desde integrantes",
                  "Descuento",
                  "Alcance",
                  "Actualización",
                  "Acciones",
                ].map((column) => (
                  <div className="mov-gridCell--head" key={column}>
                    {column}
                  </div>
                ))}
              </div>
              {discountsLoading && !discounts.length ? (
                <div className="module-empty">
                  <strong>Cargando descuentos...</strong>
                  <span>Consultando las reglas familiares.</span>
                </div>
              ) : null}
              {!discountsLoading && !discountsError && !discounts.length ? (
                <div className="module-empty">
                  <strong>Sin descuentos configurados</strong>
                  <span>
                    Si no agregás reglas, no se aplicará descuento familiar.
                  </span>
                </div>
              ) : null}
              {discounts.map((item, index) => {
                const nextQuantity = discounts[index + 1]?.cantidad_integrantes;
                const reach = nextQuantity
                  ? `DE ${item.cantidad_integrantes} A ${nextQuantity - 1} INTEGRANTES`
                  : `DESDE ${item.cantidad_integrantes} INTEGRANTES`;
                return (
                  <div
                    className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row categorias-discountsGrid"
                    role="row"
                    key={item.id_descuento_familiar}
                  >
                    <div className="mov-gridCell is-strong">
                      {item.cantidad_integrantes} INTEGRANTES
                    </div>
                    <div className="mov-gridCell">
                      <span className="mov-chip mov-chip--ok">
                        {percentage(item.porcentaje_descuento)}
                      </span>
                    </div>
                    <div className="mov-gridCell">{reach}</div>
                    <div className="mov-gridCell">
                      {formatDate(item.updated_at?.slice(0, 10))}
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions">
                      {writable ? (
                        <div className="mov-actionsInline">
                          <button
                            className="mov-iconBtn"
                            type="button"
                            title="Editar descuento"
                            onClick={() => openEditDiscount(item)}
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          <button
                            className="mov-iconBtn mov-iconBtn--danger"
                            type="button"
                            title="Eliminar descuento"
                            onClick={() => setDeleteDiscountModal(item)}
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        </div>
                      ) : (
                        <span className="entity-readonly">CONSULTA</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeLoading &&
        ((section === "categorias" && items.length) ||
          (section === "descuentos" && discounts.length)) ? (
          <span className="entity-readonly categorias-updating">
            ACTUALIZANDO...
          </span>
        ) : null}
      </ModulePage>

      <CrudModal
        open={categoryModalOpen}
        title={
          categoryForm.id_categoria ? "Editar categoría" : "Nueva categoría"
        }
        subtitle="Un precio mensual por categoría, con historial de cambios."
        onClose={() => setCategoryModalOpen(false)}
        onSubmit={saveCategory}
        saving={saving}
        submitLabel={
          categoryForm.id_categoria ? "Guardar cambios" : "Crear categoría"
        }
        modalClassName="categorias-modal categorias-modal--form"
        wide
      >
        <CategoryForm
          form={categoryForm}
          setForm={setCategoryForm}
          activeTab={categoryFormTab}
          onTabChange={setCategoryFormTab}
        />
      </CrudModal>

      <CrudModal
        open={discountModalOpen}
        title={
          discountForm.id_descuento_familiar
            ? "Editar descuento familiar"
            : "Nuevo descuento familiar"
        }
        subtitle="Definí un umbral de integrantes y el porcentaje global."
        onClose={() => setDiscountModalOpen(false)}
        onSubmit={saveDiscount}
        saving={saving}
        submitLabel={
          discountForm.id_descuento_familiar
            ? "Guardar cambios"
            : "Crear descuento"
        }
        modalClassName="categorias-modal categorias-modal--discount"
      >
        <DiscountForm form={discountForm} setForm={setDiscountForm} />
      </CrudModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={
          stateModal?.activo
            ? "Dar de baja la categoría"
            : "Reactivar categoría"
        }
        message={
          stateModal?.activo
            ? "La categoría no podrá asignarse ni cobrarse en nuevas operaciones."
            : "La categoría volverá a estar disponible para asignaciones y cobros."
        }
        warning={
          stateModal?.activo
            ? "Se conservarán los socios, precios y pagos históricos."
            : ""
        }
        details={
          stateModal
            ? [
                { label: "Categoría", value: stateModal.nombre },
                {
                  label: "Monto mensual",
                  value: money(stateModal.monto_actual),
                },
                { label: "Socios", value: stateModal.cantidad_socios },
                {
                  label: "Estado actual",
                  value: stateModal.activo ? "ACTIVA" : "BAJA",
                },
              ]
            : []
        }
        onClose={() => setStateModal(null)}
        onConfirm={changeCategoryState}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        loadingMessage={
          stateModal?.activo
            ? "Dando de baja la categoría…"
            : "Reactivando la categoría…"
        }
        successMessage={
          stateModal?.activo
            ? "Categoría dada de baja correctamente."
            : "Categoría reactivada correctamente."
        }
        errorMessage={
          stateModal?.activo
            ? "No se pudo dar de baja la categoría."
            : "No se pudo reactivar la categoría."
        }
      />

      <ModalEliminarGlobal
        open={Boolean(deleteDiscountModal)}
        operacion="eliminar"
        row={deleteDiscountModal}
        title="Eliminar descuento familiar"
        message="La regla dejará de aplicarse en los próximos cálculos."
        warning="Los pagos históricos conservarán el porcentaje utilizado en su momento."
        details={
          deleteDiscountModal
            ? [
                {
                  label: "Desde",
                  value: `${deleteDiscountModal.cantidad_integrantes} INTEGRANTES`,
                },
                {
                  label: "Descuento",
                  value: percentage(deleteDiscountModal.porcentaje_descuento),
                },
              ]
            : []
        }
        onClose={() => setDeleteDiscountModal(null)}
        onConfirm={deleteDiscount}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel="Eliminar regla"
        loadingMessage="Eliminando la regla de descuento…"
        successMessage="Descuento familiar eliminado correctamente."
        errorMessage="No se pudo eliminar el descuento familiar."
      />

      <InfoModal
        open={Boolean(historyModal)}
        title="Historial de precios"
        subtitle={historyModal?.nombre || ""}
        onClose={() => setHistoryModal(null)}
        loading={historyLoading}
        loadingTitle="Cargando historial de precios..."
        loadingText="Consultando importes, vigencias y motivos de actualización."
        modalClassName="categorias-info-modal"
      >
        <div className="categorias-info-content">
          <InfoSummary
            items={[
              {
                label: "Estado",
                value: historyIsActive ? "ACTIVA" : "BAJA",
                icon: historyIsActive ? faCheckCircle : faToggleOff,
                tone: historyIsActive ? "success" : "danger",
              },
              {
                label: "Precio actual",
                value: money(historyModal?.monto_actual),
                icon: faWallet,
              },
              {
                label: "Socios",
                value: historyModal?.cantidad_socios || 0,
                icon: faUsers,
              },
              {
                label: "Cambios registrados",
                value: history.length,
                icon: faClockRotateLeft,
              },
            ]}
          />
          <InfoSection
            title="Evolución del precio mensual"
            icon={faCalendarDays}
            badge={history.length}
          >
            {history.map((entry) => (
              <InfoRow
                key={entry.id_historial}
                title={money(entry.monto_nuevo)}
                detail={`${formatDate(entry.vigente_desde)} → ${formatDate(entry.vigente_hasta)} · ${entry.motivo || "SIN MOTIVO"}`}
                meta={
                  entry.monto_anterior !== null
                    ? `Anterior: ${money(entry.monto_anterior)}`
                    : "Precio inicial"
                }
              />
            ))}
            {!history.length ? (
              <InfoEmpty>No hay precios históricos registrados.</InfoEmpty>
            ) : null}
          </InfoSection>
        </div>
      </InfoModal>
    </>
  );
}
