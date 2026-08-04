import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faBuilding,
  faCalendarDays,
  faCircleInfo,
  faClockRotateLeft,
  faEnvelope,
  faHouse,
  faIdCard,
  faPen,
  faReceipt,
  faRotateLeft,
  faTags,
  faUser,
  faUserSlash,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/ModulePage";
import GlobalDivTable from "../Global/GlobalDivTable";
import CrudModal from "../Global/Modales/CrudModal";
import InfoModal, {
  InfoEmpty,
  InfoRow,
  InfoSection,
  InfoSummary,
} from "../Global/Modales/InfoModal";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../Global/ModuleFeedback";
import {
  EntityFormPanel,
  EntityTabs,
  FloatingField,
} from "../Global/Formularios/TabbedForm";
import { canWrite } from "../_shared/auth/session";
import { sociosApi } from "./api/sociosApi";
import { useSocios } from "./hooks/useSocios";
import "./Socios.css";
import "./modales/SociosModal.css";

const PERSON = "PERSONA";
const COMPANY = "EMPRESA";
const FORM_TAB_MAIN = "principal";
const FORM_TAB_CONFIG = "configuracion";
const INFO_TAB_SUMMARY = "resumen";
const INFO_TAB_HISTORY = "historial";
const INFO_TAB_PAYMENTS = "pagos";

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const upper = (value) => String(value || "").toLocaleUpperCase("es-AR");
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";
const formatMoney = (value) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
      }).format(Number(value || 0));

function emptyForm(type, catalogs = {}) {
  return {
    id_socio: "",
    tipo_socio: type,
    apellido: "",
    nombre: "",
    dni: "",
    razon_social: "",
    cuit: "",
    id_condicion_iva: "",
    domicilio: "",
    numero_domicilio: "",
    localidad: "",
    telefono: "",
    email: "",
    domicilio_alternativo: "",
    fecha_alta: today(),
    id_categoria: catalogs.categorias?.find((item) => item.activo)?.id_categoria
      ? String(catalogs.categorias.find((item) => item.activo).id_categoria)
      : "",
    id_medio_pago: catalogs.medios_pago?.find((item) => item.activo)
      ?.id_medio_pago
      ? String(catalogs.medios_pago.find((item) => item.activo).id_medio_pago)
      : "",
    enviar_recordatorio: true,
    observaciones: "",
  };
}

function activeOrCurrent(items, idKey, currentId) {
  return (items || []).filter(
    (item) => item.activo || String(item[idKey]) === String(currentId || ""),
  );
}

function PartnerForm({ type, form, setForm, catalogs, activeTab, onTabChange }) {
  const isCompany = type === COMPANY;
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="entity-form socios-modal__form">
      <EntityTabs
        tabs={[
          {
            value: FORM_TAB_MAIN,
            label: isCompany ? "Datos de la empresa" : "Datos personales",
            icon: isCompany ? faBuilding : faUser,
          },
          {
            value: FORM_TAB_CONFIG,
            label: "Contacto y membresía",
            icon: faAddressBook,
          },
        ]}
        value={activeTab}
        onChange={onTabChange}
        idPrefix={`socio-${type.toLowerCase()}-form-tab`}
        ariaLabel="Secciones de la ficha"
      />

      {activeTab === FORM_TAB_MAIN ? (
        <EntityFormPanel
          tabValue={FORM_TAB_MAIN}
          idPrefix={`socio-${type.toLowerCase()}-form-tab`}
          eyebrow="Ficha principal"
          title={isCompany ? "Identificación empresarial" : "Identificación personal"}
          icon={isCompany ? faBuilding : faIdCard}
          tag="Datos obligatorios"
          bodyClassName="entity-form__grid"
        >
          {isCompany ? (
            <>
              <FloatingField
                label="Razón social *"
                active={Boolean(form.razon_social)}
                wide
              >
                <input
                  value={form.razon_social}
                  onChange={(event) =>
                    update("razon_social", upper(event.target.value))
                  }
                  maxLength={255}
                  placeholder=" "
                  autoFocus
                />
              </FloatingField>
              <FloatingField label="CUIT" active={Boolean(form.cuit)}>
                <input
                  value={form.cuit}
                  onChange={(event) =>
                    update("cuit", event.target.value.replace(/\D/g, ""))
                  }
                  maxLength={11}
                  inputMode="numeric"
                  placeholder=" "
                />
              </FloatingField>
              <FloatingField label="Condición de IVA" active>
                <select
                  value={form.id_condicion_iva}
                  onChange={(event) =>
                    update("id_condicion_iva", event.target.value)
                  }
                >
                  <option value="">SIN INFORMAR</option>
                  {activeOrCurrent(
                    catalogs.condiciones_iva,
                    "id_condicion_iva",
                    form.id_condicion_iva,
                  ).map((item) => (
                    <option
                      value={item.id_condicion_iva}
                      key={item.id_condicion_iva}
                    >
                      {item.nombre}
                      {item.activo ? "" : " (BAJA)"}
                    </option>
                  ))}
                </select>
              </FloatingField>
              {form.id_empresa_anterior ? (
                <FloatingField label="ID anterior" active>
                  <input value={form.id_empresa_anterior} readOnly />
                </FloatingField>
              ) : null}
            </>
          ) : (
            <>
              <FloatingField label="Apellido *" active={Boolean(form.apellido)}>
                <input
                  value={form.apellido}
                  onChange={(event) =>
                    update("apellido", upper(event.target.value))
                  }
                  maxLength={100}
                  placeholder=" "
                  autoFocus
                />
              </FloatingField>
              <FloatingField label="Nombre *" active={Boolean(form.nombre)}>
                <input
                  value={form.nombre}
                  onChange={(event) =>
                    update("nombre", upper(event.target.value))
                  }
                  maxLength={100}
                  placeholder=" "
                />
              </FloatingField>
              <FloatingField label="DNI" active={Boolean(form.dni)}>
                <input
                  value={form.dni}
                  onChange={(event) =>
                    update("dni", event.target.value.replace(/\D/g, ""))
                  }
                  maxLength={8}
                  inputMode="numeric"
                  placeholder=" "
                />
              </FloatingField>
            </>
          )}

          <FloatingField label="Fecha de alta *" active>
            <input
              type="date"
              value={form.fecha_alta}
              onChange={(event) => update("fecha_alta", event.target.value)}
              max={today()}
            />
          </FloatingField>
        </EntityFormPanel>
      ) : (
        <EntityFormPanel
          tabValue={FORM_TAB_CONFIG}
          idPrefix={`socio-${type.toLowerCase()}-form-tab`}
          eyebrow="Información complementaria"
          title="Contacto, cuota y recordatorios"
          icon={faAddressBook}
          tag={isCompany ? "Socio empresa" : "Socio persona"}
          bodyClassName="socios-form-panel__body--membership"
        >
          <div className="entity-form__grid socios-contact-grid">
            <FloatingField label="Domicilio" active={Boolean(form.domicilio)} wide>
              <input
                value={form.domicilio}
                onChange={(event) =>
                  update("domicilio", upper(event.target.value))
                }
                maxLength={isCompany ? 255 : 150}
                placeholder=" "
              />
            </FloatingField>
            {!isCompany ? (
              <FloatingField
                label="Número"
                active={Boolean(form.numero_domicilio)}
              >
                <input
                  value={form.numero_domicilio}
                  onChange={(event) =>
                    update("numero_domicilio", upper(event.target.value))
                  }
                  maxLength={20}
                  placeholder=" "
                />
              </FloatingField>
            ) : null}
            {!isCompany ? (
              <FloatingField label="Localidad" active={Boolean(form.localidad)}>
                <input
                  value={form.localidad}
                  onChange={(event) =>
                    update("localidad", upper(event.target.value))
                  }
                  maxLength={100}
                  placeholder=" "
                />
              </FloatingField>
            ) : null}
            <FloatingField label="Teléfono" active={Boolean(form.telefono)}>
              <input
                value={form.telefono}
                onChange={(event) => update("telefono", event.target.value)}
                maxLength={30}
                placeholder=" "
              />
            </FloatingField>
            <FloatingField label="Correo" active={Boolean(form.email)}>
              <input
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                maxLength={190}
                placeholder=" "
              />
            </FloatingField>
            <FloatingField
              label="Domicilio alternativo"
              active={Boolean(form.domicilio_alternativo)}
              wide
            >
              <input
                value={form.domicilio_alternativo}
                onChange={(event) =>
                  update("domicilio_alternativo", upper(event.target.value))
                }
                maxLength={255}
                placeholder=" "
              />
            </FloatingField>
            <FloatingField label="Categoría" active>
              <select
                value={form.id_categoria}
                onChange={(event) => update("id_categoria", event.target.value)}
              >
                <option value="">SIN CATEGORÍA</option>
                {activeOrCurrent(
                  catalogs.categorias,
                  "id_categoria",
                  form.id_categoria,
                ).map((item) => (
                  <option value={item.id_categoria} key={item.id_categoria}>
                    {item.nombre} · {formatMoney(item.monto_cuota)}
                    {item.activo ? "" : " (BAJA)"}
                  </option>
                ))}
              </select>
            </FloatingField>
            <FloatingField label="Medio de pago habitual" active>
              <select
                value={form.id_medio_pago}
                onChange={(event) =>
                  update("id_medio_pago", event.target.value)
                }
              >
                <option value="">SIN INFORMAR</option>
                {activeOrCurrent(
                  catalogs.medios_pago,
                  "id_medio_pago",
                  form.id_medio_pago,
                ).map((item) => (
                  <option value={item.id_medio_pago} key={item.id_medio_pago}>
                    {item.nombre}
                    {item.activo ? "" : " (BAJA)"}
                  </option>
                ))}
              </select>
            </FloatingField>
          </div>

          <label className="socios-reminder-option">
            <input
              type="checkbox"
              checked={Boolean(form.enviar_recordatorio)}
              onChange={(event) =>
                update("enviar_recordatorio", event.target.checked)
              }
            />
            <span>
              <strong>Enviar recordatorios</strong>
              <small>Permite incluir este socio en futuros avisos de cuota.</small>
            </span>
          </label>

          <FloatingField
            label="Observaciones"
            active={Boolean(form.observaciones)}
            textarea
          >
            <textarea
              value={form.observaciones}
              onChange={(event) =>
                update("observaciones", upper(event.target.value))
              }
              maxLength={5000}
              rows={3}
              placeholder=" "
            />
          </FloatingField>
        </EntityFormPanel>
      )}
    </div>
  );
}

function formFromItem(item) {
  return {
    id_socio: item.id_socio,
    tipo_socio: item.tipo_socio,
    apellido: item.apellido || "",
    nombre: item.nombre || "",
    dni: item.dni || "",
    razon_social: item.razon_social || "",
    cuit: item.cuit || "",
    id_empresa_anterior: item.id_empresa_anterior || "",
    id_condicion_iva: item.id_condicion_iva
      ? String(item.id_condicion_iva)
      : "",
    domicilio: item.domicilio || "",
    numero_domicilio: item.numero_domicilio || "",
    localidad: item.localidad || "",
    telefono: item.telefono || "",
    email: item.email || "",
    domicilio_alternativo: item.domicilio_alternativo || "",
    fecha_alta: item.fecha_alta || today(),
    id_categoria: item.id_categoria ? String(item.id_categoria) : "",
    id_medio_pago: item.id_medio_pago ? String(item.id_medio_pago) : "",
    enviar_recordatorio: Boolean(item.enviar_recordatorio),
    observaciones: item.observaciones || "",
  };
}

export default function Socios({ tipo = PERSON }) {
  const type = tipo === COMPANY ? COMPANY : PERSON;
  const isCompany = type === COMPANY;
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVO");
  const [category, setCategory] = useState("");
  const filters = useMemo(
    () => ({ tipo: type, buscar: search, estado: status, categoria: category }),
    [type, search, status, category],
  );
  const { items, resumen, catalogos, loading, error, cargar } = useSocios(filters);
  const [form, setForm] = useState(() => emptyForm(type));
  const [formTab, setFormTab] = useState(FORM_TAB_MAIN);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [stateDate, setStateDate] = useState(today());
  const [historyModal, setHistoryModal] = useState(null);
  const [historyTab, setHistoryTab] = useState(INFO_TAB_SUMMARY);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const title = isCompany ? "Empresas" : "Socios";
  const singular = isCompany ? "empresa" : "socio";
  const createTitle = isCompany ? "Nueva empresa" : "Nuevo socio";

  const openNew = () => {
    setForm(emptyForm(type, catalogos));
    setFormTab(FORM_TAB_MAIN);
    setModalOpen(true);
  };
  const openEdit = async (item) => {
    try {
      const response = await sociosApi.obtener(item.id_socio);
      setForm(formFromItem(response.item || item));
      setFormTab(FORM_TAB_MAIN);
      setModalOpen(true);
    } catch (requestError) {
      setFeedback({ type: "error", message: requestError.message });
    }
  };
  const save = async (event) => {
    event.preventDefault();
    const missingMain = isCompany
      ? !form.razon_social.trim()
      : !form.apellido.trim() || !form.nombre.trim();
    if (missingMain || !form.fecha_alta) {
      setFormTab(FORM_TAB_MAIN);
      setFeedback({
        type: "error",
        message: isCompany
          ? "Completá la razón social y la fecha de alta."
          : "Completá apellido, nombre y fecha de alta.",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await sociosApi.guardar({
        ...form,
        tipo_socio: type,
        id_categoria: form.id_categoria || null,
        id_medio_pago: form.id_medio_pago || null,
        id_condicion_iva: form.id_condicion_iva || null,
      });
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (requestError) {
      setFeedback({ type: "error", message: requestError.message });
    } finally {
      setSaving(false);
    }
  };
  const openHistory = async (item) => {
    setHistoryModal({ item, data: null, error: "" });
    setHistoryTab(INFO_TAB_SUMMARY);
    setHistoryLoading(true);
    try {
      const response = await sociosApi.historial(item.id_socio);
      setHistoryModal({ item, data: response, error: "" });
    } catch (requestError) {
      setHistoryModal({ item, data: null, error: requestError.message });
    } finally {
      setHistoryLoading(false);
    }
  };
  const changeState = async ({ motivo }) => {
    if (!stateModal) return null;
    const response = stateModal.activo
      ? await sociosApi.darBaja({
          id: stateModal.id_socio,
          fecha_baja: stateDate,
          motivo_baja: motivo,
        })
      : await sociosApi.reactivar({
          id: stateModal.id_socio,
          fecha_reactivacion: today(),
        });
    await cargar();
    return response;
  };

  const pageFilters = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: `Estado de ${title.toLowerCase()}`,
      value: status,
      onChange: setStatus,
      options: [
        { value: "ACTIVO", label: "Activos" },
        { value: "INACTIVO", label: "Bajas" },
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
    {
      key: "categoria",
      label: "Categoría",
      type: "select",
      placeholder: "Todas",
      value: category,
      onChange: setCategory,
      options: (catalogos.categorias || []).map((item) => ({
        value: item.id_categoria,
        label: `${item.nombre}${item.activo ? "" : " (BAJA)"}`,
      })),
    },
  ];

  const info = historyModal?.data;
  const itemInfo = info?.item;

  return (
    <>
      <ModulePage
        title={title}
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="socios-headFilters"
        primaryActionLabel={isCompany ? "Nueva empresa" : "Nuevo socio"}
        onPrimaryAction={openNew}
        canCreate={writable}
        stats={[]}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />
        <div className="socios-summary-strip" aria-label={`Resumen de ${title}`}>
          <span>
            <strong>{Number(resumen.activos || 0)}</strong> activos
          </span>
          <span>
            <strong>{Number(resumen.inactivos || 0)}</strong> bajas
          </span>
          <span>
            <strong>{Number(resumen.sin_categoria || 0)}</strong> sin categoría
          </span>
          {!isCompany ? (
            <span>
              <strong>{Number(resumen.sin_familia || 0)}</strong> sin familia
            </span>
          ) : null}
        </div>
        <GlobalDivTable
          className="socios-table"
          bodyClassName="entity-table-wrap"
          gridClassName={`socios-grid ${isCompany ? "socios-grid--empresa" : "socios-grid--persona"}`}
          ariaLabel={`Listado de ${title.toLowerCase()}`}
          columns={
            isCompany
              ? [
                  "Empresa",
                  "CUIT",
                  "Condición IVA",
                  "Categoría",
                  "Contacto",
                  "Alta",
                  "Estado",
                  "Acciones",
                ]
              : [
                  "Socio",
                  "DNI",
                  "Categoría",
                  "Familia",
                  "Contacto",
                  "Alta",
                  "Estado",
                  "Acciones",
                ]
          }
        >
          {loading && !items.length ? (
            <div className="module-empty">
              <strong>Cargando {title.toLowerCase()}...</strong>
              <span>Consultando la base unificada de LALCEC.</span>
            </div>
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <strong>Sin {title.toLowerCase()} para mostrar</strong>
              <span>Creá el primer registro o cambiá los filtros.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <div
              className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row socios-grid ${isCompany ? "socios-grid--empresa" : "socios-grid--persona"}`}
              role="row"
              key={item.id_socio}
            >
              <div className="mov-gridCell entity-main-cell">
                <strong>{item.denominacion}</strong>
                <small>
                  {isCompany
                    ? `ID EMPRESA ${item.id_empresa_anterior || "—"}`
                    : [item.localidad, item.domicilio, item.numero_domicilio]
                        .filter(Boolean)
                        .join(" · ") || "SIN DOMICILIO"}
                </small>
              </div>
              <div className="mov-gridCell is-strong">
                {isCompany ? item.cuit || "—" : item.dni || "—"}
              </div>
              <div className="mov-gridCell">
                {isCompany ? item.condicion_iva || "—" : item.categoria || "—"}
              </div>
              <div className="mov-gridCell">
                {isCompany ? item.categoria || "—" : item.familia || "—"}
              </div>
              <div className="mov-gridCell entity-main-cell">
                <span>{item.telefono || "—"}</span>
                <small>{item.email || ""}</small>
              </div>
              <div className="mov-gridCell">{formatDate(item.fecha_alta)}</div>
              <div className="mov-gridCell">
                <span
                  className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                >
                  {item.activo ? "ACTIVO" : "BAJA"}
                </span>
              </div>
              <div className="mov-gridCell mov-gridCell--actions">
                <div className="mov-actionsInline">
                  <button
                    className="mov-iconBtn"
                    type="button"
                    title="Ver ficha e historial"
                    onClick={() => openHistory(item)}
                  >
                    <FontAwesomeIcon icon={faCircleInfo} />
                  </button>
                  {writable ? (
                    <>
                      <button
                        className="mov-iconBtn"
                        type="button"
                        title="Editar"
                        onClick={() => openEdit(item)}
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`}
                        type="button"
                        title={item.activo ? "Dar de baja" : "Reactivar"}
                        onClick={() => {
                          setStateDate(today());
                          setStateModal(item);
                        }}
                      >
                        <FontAwesomeIcon
                          icon={item.activo ? faUserSlash : faRotateLeft}
                        />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </GlobalDivTable>
      </ModulePage>

      <CrudModal
        open={modalOpen}
        title={form.id_socio ? `Editar ${singular}` : createTitle}
        subtitle={
          form.id_socio
            ? "Actualizá la ficha sin cambiar el tipo ni perder su historial."
            : "La información común y el detalle se guardan en una sola transacción."
        }
        onClose={() => setModalOpen(false)}
        onSubmit={save}
        saving={saving}
        submitLabel={form.id_socio ? "Guardar cambios" : `Crear ${singular}`}
        modalClassName="socios-modal socios-modal--form"
        wide
      >
        <PartnerForm
          type={type}
          form={form}
          setForm={setForm}
          catalogs={catalogos}
          activeTab={formTab}
          onTabChange={setFormTab}
        />
      </CrudModal>

      <InfoModal
        open={Boolean(historyModal)}
        title={isCompany ? "Ficha de la empresa" : "Ficha del socio"}
        subtitle={historyModal?.item?.denominacion || ""}
        onClose={() => setHistoryModal(null)}
        tabs={[
          { value: INFO_TAB_SUMMARY, label: "Resumen", icon: faCircleInfo },
          {
            value: INFO_TAB_HISTORY,
            label: "Estados",
            icon: faClockRotateLeft,
            badge: info?.historial_estados?.length || null,
          },
          {
            value: INFO_TAB_PAYMENTS,
            label: "Pagos",
            icon: faReceipt,
            badge: info?.pagos?.length || null,
          },
        ]}
        activeTab={historyTab}
        onTabChange={setHistoryTab}
        loading={historyLoading}
        loadingTitle="Cargando ficha..."
        loadingText="Consultando datos, estados, familias y pagos."
        modalClassName="socios-info-modal"
      >
        {historyModal?.error ? (
          <ModuleFeedback type="error" message={historyModal.error} />
        ) : itemInfo ? (
          historyTab === INFO_TAB_SUMMARY ? (
            <div className="socios-info-content">
              <InfoSummary
                items={[
                  {
                    label: "Estado",
                    value: itemInfo.estado,
                    icon: itemInfo.activo ? faUser : faUserSlash,
                    tone: itemInfo.activo ? "success" : "danger",
                  },
                  {
                    label: "Categoría",
                    value: itemInfo.categoria || "SIN CATEGORÍA",
                    icon: faTags,
                  },
                  {
                    label: "Cuota vigente",
                    value: formatMoney(itemInfo.monto_cuota),
                    icon: faWallet,
                  },
                  {
                    label: "Alta",
                    value: formatDate(itemInfo.fecha_alta),
                    icon: faCalendarDays,
                  },
                ]}
              />
              <div className="entity-info-grid">
                <InfoSection
                  title={isCompany ? "Datos empresariales" : "Datos personales"}
                  icon={isCompany ? faBuilding : faIdCard}
                >
                  <InfoRow
                    title={itemInfo.denominacion}
                    detail={isCompany ? `CUIT ${itemInfo.cuit || "—"}` : `DNI ${itemInfo.dni || "—"}`}
                  />
                  {isCompany ? (
                    <InfoRow
                      title="Condición de IVA"
                      detail={itemInfo.condicion_iva || "SIN INFORMAR"}
                      meta={`ID ANTERIOR ${itemInfo.id_empresa_anterior || "—"}`}
                    />
                  ) : (
                    <InfoRow
                      title="Familia activa"
                      detail={itemInfo.familia || "SIN FAMILIA"}
                      meta={itemInfo.parentesco || ""}
                    />
                  )}
                </InfoSection>
                <InfoSection title="Contacto" icon={faEnvelope}>
                  <InfoRow title="Teléfono" detail={itemInfo.telefono || "—"} />
                  <InfoRow title="Correo" detail={itemInfo.email || "—"} />
                  <InfoRow
                    title="Domicilio"
                    detail={
                      [
                        itemInfo.domicilio,
                        itemInfo.numero_domicilio,
                        itemInfo.localidad,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                  />
                </InfoSection>
              </div>
              <InfoSection title="Configuración" icon={faWallet}>
                <InfoRow
                  title="Medio habitual"
                  detail={itemInfo.medio_pago || "SIN INFORMAR"}
                />
                <InfoRow
                  title="Recordatorios"
                  detail={itemInfo.enviar_recordatorio ? "HABILITADOS" : "DESHABILITADOS"}
                  tone={itemInfo.enviar_recordatorio ? "success" : ""}
                />
                {itemInfo.observaciones ? (
                  <InfoRow title="Observaciones" detail={itemInfo.observaciones} />
                ) : null}
              </InfoSection>
              {!isCompany && info.familias?.length ? (
                <InfoSection title="Historial familiar" icon={faHouse} badge={info.familias.length}>
                  {info.familias.map((family) => (
                    <InfoRow
                      key={family.id_familia_socio}
                      title={family.familia}
                      detail={`${formatDate(family.fecha_incorporacion)} → ${family.fecha_desvinculacion ? formatDate(family.fecha_desvinculacion) : "ACTUALIDAD"}`}
                      meta={family.parentesco || (family.es_titular ? "TITULAR" : "")}
                      tone={family.activo ? "success" : ""}
                    />
                  ))}
                </InfoSection>
              ) : null}
            </div>
          ) : historyTab === INFO_TAB_HISTORY ? (
            <InfoSection
              title="Altas, bajas y reactivaciones"
              icon={faClockRotateLeft}
              badge={info.historial_estados?.length || 0}
            >
              {info.historial_estados?.length ? (
                info.historial_estados.map((event) => (
                  <InfoRow
                    key={event.id_historial_estado}
                    title={event.tipo_evento}
                    detail={
                      [
                        event.estado_anterior
                          ? `${event.estado_anterior} → ${event.estado_nuevo}`
                          : event.estado_nuevo,
                        event.motivo,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    }
                    meta={`${formatDate(event.fecha_efectiva)}${event.usuario ? ` · ${event.usuario}` : ""}`}
                    tone={event.estado_nuevo === "ACTIVO" ? "success" : "danger"}
                  />
                ))
              ) : (
                <InfoEmpty>Sin eventos de estado registrados.</InfoEmpty>
              )}
            </InfoSection>
          ) : (
            <InfoSection
              title="Últimos períodos pagados"
              icon={faReceipt}
              badge={info.pagos?.length || 0}
            >
              {info.pagos?.length ? (
                info.pagos.map((payment) => (
                  <InfoRow
                    key={payment.id_pago}
                    title={`${String(payment.mes).padStart(2, "0")}/${payment.anio}`}
                    detail={payment.medio_pago || "MEDIO HISTÓRICO SIN INFORMAR"}
                    meta={`${formatMoney(payment.monto)} · ${formatDate(payment.fecha_pago)}`}
                    tone="success"
                  />
                ))
              ) : (
                <InfoEmpty>El registro no tiene pagos cargados.</InfoEmpty>
              )}
            </InfoSection>
          )
        ) : null}
      </InfoModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={
          stateModal?.activo
            ? `Dar de baja ${isCompany ? "la empresa" : "al socio"}`
            : `Reactivar ${isCompany ? "empresa" : "socio"}`
        }
        message={
          stateModal?.activo
            ? "El registro quedará inactivo, pero conservará pagos, familia e historial."
            : "El registro volverá a estar disponible para operaciones nuevas."
        }
        details={
          stateModal
            ? [
                { label: isCompany ? "Empresa" : "Socio", value: stateModal.denominacion },
                { label: isCompany ? "CUIT" : "DNI", value: isCompany ? stateModal.cuit : stateModal.dni },
                { label: "Estado actual", value: stateModal.estado },
              ]
            : []
        }
        showReason={Boolean(stateModal?.activo)}
        reasonRequired={Boolean(stateModal?.activo)}
        reasonLabel="Motivo de baja *"
        reasonPlaceholder="Indicá el motivo de la baja..."
        extraContent={
          stateModal?.activo ? (
            <label className="entity-field gdel-date-field">
              <span>Fecha de baja *</span>
              <input
                type="date"
                value={stateDate}
                min={stateModal.fecha_alta || undefined}
                max={today()}
                onChange={(event) => setStateDate(event.target.value)}
                required
              />
            </label>
          ) : null
        }
        confirmDisabled={Boolean(stateModal?.activo && !stateDate)}
        onClose={() => setStateModal(null)}
        onConfirm={changeState}
        onToast={(typeFeedback, message, duration) =>
          setFeedback({ type: typeFeedback, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        successMessage={
          stateModal?.activo
            ? "Registro dado de baja correctamente."
            : "Registro reactivado correctamente."
        }
      />
    </>
  );
}
