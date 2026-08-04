import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faCalendarDays,
  faCheckCircle,
  faCircleInfo,
  faClockRotateLeft,
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
import { ModulePage } from "../../Global/components/ModulePage";
import GlobalDivTable from "../../Global/components/GlobalDivTable";
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
import { sociosApi } from "../api/sociosApi";
import { useSocios } from "../hooks/useSocios";
import "./Socios.css";
import "./SociosModal.css";

const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const upper = (value) => value.toLocaleUpperCase("es-AR");
const openDatePicker = (event) => {
  const input = event.currentTarget;

  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
    } catch {
      // El navegador conserva su comportamiento nativo si no puede abrirlo.
    }
  }
};
const FORM_TAB_PERSONAL = "personal";
const FORM_TAB_MEMBERSHIP = "membership";
const INFO_TAB_SUMMARY = "summary";
const INFO_TAB_ACTIVITY = "activity";
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";

function emptyForm(catalogos) {
  return {
    id_socio: "",
    nombre: "",
    apellido: "",
    dni: "",
    fecha_nacimiento: "",
    sexo: "NO_INFORMA",
    domicilio: "",
    id_localidad: catalogos?.localidades?.[0]?.id_localidad
      ? String(catalogos.localidades[0].id_localidad)
      : "__new__",
    localidad_nueva: "",
    telefono: "",
    email: "",
    fecha_ingreso: dateToday(),
    observaciones: "",
    categoria_ids: [],
  };
}

function SocioForm({ form, setForm, catalogos, activeTab, onTabChange }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggleCategory = (id) =>
    setForm((current) => ({
      ...current,
      categoria_ids: current.categoria_ids.includes(id)
        ? current.categoria_ids.filter((item) => item !== id)
        : [...current.categoria_ids, id],
    }));

  const locations = [...(catalogos.localidades || [])];
  if (
    form.id_localidad &&
    form.id_localidad !== "__new__" &&
    !locations.some(
      (item) => String(item.id_localidad) === String(form.id_localidad),
    ) &&
    form.localidad
  ) {
    locations.unshift({
      id_localidad: Number(form.id_localidad),
      nombre: `${form.localidad} (INACTIVA ACTUAL)`,
    });
  }

  return (
    <div className="entity-form socios-modal__form">
      <EntityTabs
        tabs={[
          {
            value: FORM_TAB_PERSONAL,
            label: "Datos personales",
            icon: faUser,
          },
          {
            value: FORM_TAB_MEMBERSHIP,
            label: "Contacto y membresía",
            icon: faAddressBook,
            badge: form.categoria_ids.length || null,
          },
        ]}
        value={activeTab}
        onChange={onTabChange}
        idPrefix="socio-form-tab"
        ariaLabel="Secciones de la ficha del socio"
      />

      {activeTab === FORM_TAB_PERSONAL ? (
        <EntityFormPanel
          tabValue={FORM_TAB_PERSONAL}
          idPrefix="socio-form-tab"
          eyebrow="Ficha principal"
          title="Identidad del socio"
          icon={faIdCard}
          tag="Datos obligatorios"
          bodyClassName="entity-form__grid"
          hint="Completá los datos identificatorios. En la siguiente pestaña podés agregar el contacto, la ubicación y las categorías."
        >
          <FloatingField label="Apellido *" active={Boolean(form.apellido)}>
            <input
              value={form.apellido}
              placeholder=" "
              onChange={(e) => update("apellido", upper(e.target.value))}
              maxLength={120}
              autoFocus
            />
          </FloatingField>
          <FloatingField label="Nombre *" active={Boolean(form.nombre)}>
            <input
              value={form.nombre}
              placeholder=" "
              onChange={(e) => update("nombre", upper(e.target.value))}
              maxLength={120}
            />
          </FloatingField>
          <FloatingField label="DNI *" active={Boolean(form.dni)}>
            <input
              value={form.dni}
              placeholder=" "
              onChange={(e) => update("dni", e.target.value.replace(/\D/g, ""))}
              maxLength={9}
              inputMode="numeric"
            />
          </FloatingField>
          <FloatingField label="Fecha de nacimiento" active>
            <input
              type="date"
              value={form.fecha_nacimiento}
              max={dateToday()}
              onClick={openDatePicker}
              onChange={(e) => update("fecha_nacimiento", e.target.value)}
            />
          </FloatingField>
          <FloatingField label="Sexo" active>
            <select
              value={form.sexo}
              onChange={(e) => update("sexo", e.target.value)}
            >
              <option value="NO_INFORMA">NO INFORMA</option>
              <option value="MASCULINO">MASCULINO</option>
              <option value="FEMENINO">FEMENINO</option>
              <option value="OTRO">OTRO</option>
            </select>
          </FloatingField>
          <FloatingField label="Fecha de ingreso *" active>
            <input
              type="date"
              value={form.fecha_ingreso}
              max={dateToday()}
              onClick={openDatePicker}
              onChange={(e) => update("fecha_ingreso", e.target.value)}
            />
          </FloatingField>
        </EntityFormPanel>
      ) : (
        <EntityFormPanel
          tabValue={FORM_TAB_MEMBERSHIP}
          idPrefix="socio-form-tab"
          eyebrow="Información complementaria"
          title="Contacto y membresía"
          icon={faAddressBook}
          tag={
            form.categoria_ids.length
              ? `${form.categoria_ids.length} ${form.categoria_ids.length === 1 ? "categoría" : "categorías"}`
              : "Sin categorías"
          }
          bodyClassName="socios-form-panel__body--membership"
        >
          <div className="entity-form__grid socios-contact-grid">
            <FloatingField
              label="Domicilio"
              active={Boolean(form.domicilio)}
              wide
            >
              <input
                value={form.domicilio}
                placeholder=" "
                onChange={(e) => update("domicilio", upper(e.target.value))}
                maxLength={255}
              />
            </FloatingField>
            <FloatingField label="Localidad *" active>
              <select
                value={form.id_localidad}
                onChange={(e) => update("id_localidad", e.target.value)}
              >
                {locations.map((item) => (
                  <option key={item.id_localidad} value={item.id_localidad}>
                    {item.nombre}
                  </option>
                ))}
                <option value="__new__">+ AGREGAR LOCALIDAD</option>
              </select>
            </FloatingField>
            {form.id_localidad === "__new__" ? (
              <FloatingField
                label="Nueva localidad *"
                active={Boolean(form.localidad_nueva)}
              >
                <input
                  value={form.localidad_nueva}
                  placeholder=" "
                  onChange={(e) =>
                    update("localidad_nueva", upper(e.target.value))
                  }
                  maxLength={120}
                />
              </FloatingField>
            ) : (
              <FloatingField label="Teléfono" active={Boolean(form.telefono)}>
                <input
                  value={form.telefono}
                  placeholder=" "
                  onChange={(e) => update("telefono", e.target.value)}
                  maxLength={50}
                  inputMode="tel"
                />
              </FloatingField>
            )}
            {form.id_localidad === "__new__" ? (
              <FloatingField label="Teléfono" active={Boolean(form.telefono)}>
                <input
                  value={form.telefono}
                  placeholder=" "
                  onChange={(e) => update("telefono", e.target.value)}
                  maxLength={50}
                  inputMode="tel"
                />
              </FloatingField>
            ) : null}
            <FloatingField
              label="Email"
              active={Boolean(form.email)}
              wide={form.id_localidad !== "__new__"}
            >
              <input
                type="text"
                inputMode="email"
                value={form.email}
                placeholder=" "
                onChange={(e) => update("email", e.target.value)}
                maxLength={190}
              />
            </FloatingField>
            <FloatingField
              label="Observaciones"
              active={Boolean(form.observaciones)}
              textarea
              wide
            >
              <textarea
                value={form.observaciones}
                placeholder=" "
                onChange={(e) => update("observaciones", upper(e.target.value))}
                rows={2}
                maxLength={5000}
              />
            </FloatingField>
          </div>
          <fieldset className="entity-checks socios-modal__categories">
            <legend>
              <FontAwesomeIcon icon={faTags} /> Categorías del socio
            </legend>
            <div className="socios-categories__grid">
              {(catalogos.categorias || []).length ? (
                (catalogos.categorias || []).map((category) => {
                  const selected = form.categoria_ids.includes(
                    category.id_categoria,
                  );

                  return (
                    <label
                      key={category.id_categoria}
                      className={`socios-category-option${selected ? " is-selected" : ""}${!category.activo ? " is-inactive" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!category.activo && !selected}
                        onChange={() => toggleCategory(category.id_categoria)}
                      />
                      <span className="socios-category-option__name">
                        {category.nombre}
                      </span>
                      {!category.activo ? (
                        <small className="socios-category-option__status">
                          Baja
                        </small>
                      ) : null}
                    </label>
                  );
                })
              ) : (
                <p className="entity-help socios-categories__empty">
                  Primero creá una categoría para poder asignarla.
                </p>
              )}
            </div>
          </fieldset>
        </EntityFormPanel>
      )}
    </div>
  );
}

export default function Socios() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("activo");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const filters = useMemo(
    () => ({
      buscar: search,
      estado: status,
      categoria: category,
      localidad: location,
    }),
    [search, status, category, location],
  );
  const { items, catalogos, loading, error, cargar } = useSocios(filters);
  const [modalOpen, setModalOpen] = useState(false);
  const [formTab, setFormTab] = useState(FORM_TAB_PERSONAL);
  const [form, setForm] = useState(emptyForm({}));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [stateModal, setStateModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [historyTab, setHistoryTab] = useState(INFO_TAB_SUMMARY);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stateForm, setStateForm] = useState({
    fecha_baja: dateToday(),
  });

  const openNew = () => {
    setForm(emptyForm(catalogos));
    setFormTab(FORM_TAB_PERSONAL);
    setModalOpen(true);
  };
  const openHistory = async (item) => {
    setHistoryTab(INFO_TAB_SUMMARY);
    setHistoryModal({ socio: item, data: null, error: null });
    setHistoryLoading(true);
    try {
      const response = await sociosApi.historial(item.id_socio);
      setHistoryModal({ socio: item, data: response, error: null });
    } catch (err) {
      setHistoryModal({ socio: item, data: null, error: err.message });
    } finally {
      setHistoryLoading(false);
    }
  };
  const openEdit = (item) => {
    setForm({
      ...emptyForm(catalogos),
      ...item,
      id_socio: item.id_socio,
      id_localidad: String(item.id_localidad),
      fecha_nacimiento: item.fecha_nacimiento || "",
      categoria_ids: item.categoria_ids || [],
    });
    setFormTab(FORM_TAB_PERSONAL);
    setModalOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();

    if (!form.apellido.trim() || !form.nombre.trim()) {
      setFormTab(FORM_TAB_PERSONAL);
      setFeedback({
        type: "error",
        message: "Completá el apellido y el nombre del socio.",
      });
      return;
    }
    if (!/^\d{6,9}$/.test(form.dni)) {
      setFormTab(FORM_TAB_PERSONAL);
      setFeedback({
        type: "error",
        message: "El DNI debe contener entre 6 y 9 números.",
      });
      return;
    }
    if (!form.fecha_ingreso) {
      setFormTab(FORM_TAB_PERSONAL);
      setFeedback({
        type: "error",
        message: "Completá la fecha de ingreso del socio.",
      });
      return;
    }
    if (!form.id_localidad) {
      setFormTab(FORM_TAB_MEMBERSHIP);
      setFeedback({ type: "error", message: "Seleccioná una localidad." });
      return;
    }
    if (form.id_localidad === "__new__" && !form.localidad_nueva.trim()) {
      setFormTab(FORM_TAB_MEMBERSHIP);
      setFeedback({
        type: "error",
        message: "Ingresá el nombre de la nueva localidad.",
      });
      return;
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      setFormTab(FORM_TAB_MEMBERSHIP);
      setFeedback({
        type: "error",
        message: "El email ingresado no tiene un formato válido.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        id_localidad:
          form.id_localidad === "__new__" ? null : Number(form.id_localidad),
        localidad_nueva:
          form.id_localidad === "__new__" ? form.localidad_nueva : null,
      };
      const response = await sociosApi.guardar(payload);
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };
  const changeState = async ({ motivo }) => {
    if (!stateModal) return;
    const response = stateModal.activo
      ? await sociosApi.darBaja({
          id: stateModal.id_socio,
          fecha_baja: stateForm.fecha_baja,
          motivo_baja: motivo,
        })
      : await sociosApi.reactivar(stateModal.id_socio);
    await cargar();
    return response;
  };

  const pageFilters = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: "Estado de los socios",
      value: status,
      onChange: setStatus,
      options: [
        { value: "activo", label: "Activos" },
        { value: "inactivo", label: "Bajas" },
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
    {
      key: "localidad",
      label: "Localidad",
      type: "select",
      placeholder: "Todas",
      value: location,
      onChange: setLocation,
      options: (catalogos.localidades || []).map((item) => ({
        value: item.id_localidad,
        label: item.nombre,
      })),
    },
  ];

  return (
    <>
      <ModulePage
        title="Socios"
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="socios-headFilters"
        primaryActionLabel="Nuevo socio"
        onPrimaryAction={openNew}
        canCreate={writable}
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
        <GlobalDivTable
          className="socios-table"
          bodyClassName="entity-table-wrap"
          gridClassName="socios-grid"
          ariaLabel="Listado de socios"
          columns={[
            "Socio",
            "DNI",
            "Categorías",
            "Familia",
            "Contacto",
            "Ingreso",
            "Estado",
            "Acciones",
          ]}
        >
          {loading && !items.length ? (
            <div className="module-empty">
              <strong>Cargando socios...</strong>
              <span>Consultando el padrón de la organización.</span>
            </div>
          ) : null}
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <strong>Sin socios para mostrar</strong>
              <span>Creá el primer socio o cambiá los filtros aplicados.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <div
              className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row socios-grid"
              role="row"
              key={item.id_socio}
            >
              <div className="mov-gridCell entity-main-cell">
                <strong>
                  {item.apellido}, {item.nombre}
                </strong>
                <small>
                  {item.localidad}
                  {item.domicilio ? ` · ${item.domicilio}` : ""}
                </small>
              </div>
              <div className="mov-gridCell is-strong">{item.dni}</div>
              <div className="mov-gridCell">
                <span className="entity-wrap-text">
                  {item.categorias || "SIN CATEGORÍA"}
                </span>
              </div>
              <div className="mov-gridCell">{item.familia || "—"}</div>
              <div className="mov-gridCell entity-main-cell">
                <span>{item.telefono || "—"}</span>
                <small>{item.email || ""}</small>
              </div>
              <div className="mov-gridCell">
                {formatDate(item.fecha_ingreso)}
              </div>
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
                          setStateForm({
                            fecha_baja: dateToday(),
                          });
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
        title={form.id_socio ? "Editar socio" : "Nuevo socio"}
        subtitle={
          form.id_socio
            ? "Actualizá la ficha sin perder sus categorías ni su historial."
            : "Cargá los datos personales, el contacto y su membresía."
        }
        onClose={() => setModalOpen(false)}
        onSubmit={save}
        saving={saving}
        submitLabel={form.id_socio ? "Guardar cambios" : "Crear socio"}
        modalClassName="socios-modal socios-modal--form"
        wide
      >
        <SocioForm
          form={form}
          setForm={setForm}
          catalogos={catalogos}
          activeTab={formTab}
          onTabChange={setFormTab}
        />
      </CrudModal>

      <InfoModal
        open={Boolean(historyModal)}
        title="Ficha e historial del socio"
        subtitle={
          historyModal?.socio
            ? `${historyModal.socio.apellido}, ${historyModal.socio.nombre}`
            : ""
        }
        onClose={() => setHistoryModal(null)}
        tabs={[
          { value: INFO_TAB_SUMMARY, label: "Resumen", icon: faCircleInfo },
          {
            value: INFO_TAB_ACTIVITY,
            label: "Actividad",
            icon: faClockRotateLeft,
            badge:
              Number(historyModal?.data?.resumen?.cuotas_pendientes) || null,
          },
        ]}
        activeTab={historyTab}
        onTabChange={setHistoryTab}
        loading={historyLoading}
        loadingTitle="Cargando ficha del socio..."
        loadingText="Consultando categorías, cuotas e historial."
        modalClassName="socios-info-modal"
      >
        {historyModal?.error ? (
          <ModuleFeedback type="error" message={historyModal.error} />
        ) : historyModal?.data ? (
          historyTab === INFO_TAB_SUMMARY ? (
            <div className="socios-info-content">
              <InfoSummary
                items={[
                  {
                    label: "Estado",
                    value:
                      historyModal.data.socio.activo === true ||
                      Number(historyModal.data.socio.activo) === 1
                        ? "ACTIVO"
                        : "BAJA",
                    icon:
                      historyModal.data.socio.activo === true ||
                      Number(historyModal.data.socio.activo) === 1
                        ? faCheckCircle
                        : faUserSlash,
                    tone:
                      historyModal.data.socio.activo === true ||
                      Number(historyModal.data.socio.activo) === 1
                        ? "success"
                        : "danger",
                  },
                  {
                    label: "Cuenta",
                    value:
                      historyModal.data.resumen.estado_cuenta === "AL_DIA"
                        ? "AL DÍA"
                        : "CON DEUDA",
                    icon: faWallet,
                    tone:
                      historyModal.data.resumen.estado_cuenta === "AL_DIA"
                        ? "success"
                        : "danger",
                  },
                  {
                    label: "Cuotas pagadas",
                    value: historyModal.data.resumen.cuotas_pagadas,
                    icon: faReceipt,
                  },
                  {
                    label: "Pendientes",
                    value: historyModal.data.resumen.cuotas_pendientes,
                    icon: faCalendarDays,
                    tone:
                      Number(historyModal.data.resumen.cuotas_pendientes) > 0
                        ? "danger"
                        : "success",
                  },
                ]}
              />
              <div className="entity-info-grid">
                <InfoSection title="Datos personales" icon={faIdCard}>
                  <InfoRow
                    title="DNI"
                    detail={
                      historyModal.data.socio.dni || historyModal.socio.dni
                    }
                  />
                  <InfoRow
                    title="Fecha de nacimiento"
                    detail={formatDate(
                      historyModal.data.socio.fecha_nacimiento ||
                        historyModal.socio.fecha_nacimiento,
                    )}
                  />
                  <InfoRow
                    title="Fecha de ingreso"
                    detail={formatDate(
                      historyModal.data.socio.fecha_ingreso ||
                        historyModal.socio.fecha_ingreso,
                    )}
                  />
                </InfoSection>
                <InfoSection title="Contacto y ubicación" icon={faHouse}>
                  <InfoRow
                    title="Localidad"
                    detail={
                      historyModal.data.socio.localidad ||
                      historyModal.socio.localidad ||
                      "—"
                    }
                  />
                  <InfoRow
                    title="Domicilio"
                    detail={
                      historyModal.data.socio.domicilio ||
                      historyModal.socio.domicilio ||
                      "—"
                    }
                  />
                  <InfoRow
                    title="Teléfono"
                    detail={
                      historyModal.data.socio.telefono ||
                      historyModal.socio.telefono ||
                      "—"
                    }
                  />
                  <InfoRow
                    title="Email"
                    detail={
                      historyModal.data.socio.email ||
                      historyModal.socio.email ||
                      "—"
                    }
                  />
                </InfoSection>
              </div>
              <InfoSection
                title="Categorías actuales"
                icon={faTags}
                badge={
                  historyModal.data.categorias.filter(
                    (categoria) => !categoria.fecha_hasta,
                  ).length
                }
              >
                {historyModal.data.categorias.some(
                  (categoria) => !categoria.fecha_hasta,
                ) ? (
                  <div className="entity-info-chips">
                    {historyModal.data.categorias
                      .filter((categoria) => !categoria.fecha_hasta)
                      .map((categoria) => (
                        <span key={categoria.id_socio_categoria}>
                          {categoria.categoria}
                        </span>
                      ))}
                  </div>
                ) : (
                  <InfoEmpty>El socio no tiene categorías activas.</InfoEmpty>
                )}
              </InfoSection>
            </div>
          ) : (
            <div className="socios-info-content">
              <div className="entity-info-grid">
                <InfoSection
                  title="Períodos de actividad"
                  icon={faCalendarDays}
                  badge={historyModal.data.periodos.length}
                >
                  {historyModal.data.periodos.length ? (
                    historyModal.data.periodos.map((periodo) => (
                      <InfoRow
                        key={periodo.id_periodo}
                        title={`${formatDate(periodo.vigente_desde)} → ${periodo.vigente_hasta ? formatDate(periodo.vigente_hasta) : "ACTUALIDAD"}`}
                        detail={
                          periodo.vigente_hasta
                            ? periodo.motivo_baja || "PERÍODO CERRADO"
                            : "PERÍODO ACTIVO"
                        }
                        tone={periodo.vigente_hasta ? "" : "success"}
                      />
                    ))
                  ) : (
                    <InfoEmpty>Sin períodos registrados.</InfoEmpty>
                  )}
                </InfoSection>
                <InfoSection
                  title="Historial de categorías"
                  icon={faTags}
                  badge={historyModal.data.categorias.length}
                >
                  {historyModal.data.categorias.length ? (
                    historyModal.data.categorias.map((categoria) => (
                      <InfoRow
                        key={categoria.id_socio_categoria}
                        title={categoria.categoria}
                        detail={`${formatDate(categoria.fecha_desde)} → ${categoria.fecha_hasta ? formatDate(categoria.fecha_hasta) : "ACTUALIDAD"}`}
                        tone={categoria.fecha_hasta ? "" : "success"}
                      />
                    ))
                  ) : (
                    <InfoEmpty>Sin categorías registradas.</InfoEmpty>
                  )}
                </InfoSection>
              </div>
              <InfoSection
                title="Cuotas pendientes"
                icon={faCalendarDays}
                badge={historyModal.data.pendientes.length}
              >
                {historyModal.data.pendientes.length ? (
                  <div className="entity-info-chips">
                    {historyModal.data.pendientes.map((item) => (
                      <span
                        key={`${item.id_categoria}-${item.anio}-${item.id_mes}`}
                      >
                        {item.categoria} · {item.mes} {item.anio}
                      </span>
                    ))}
                  </div>
                ) : (
                  <InfoEmpty tone="success">El socio está al día.</InfoEmpty>
                )}
              </InfoSection>
              <InfoSection
                title="Pagos y condonaciones"
                icon={faReceipt}
                badge={historyModal.data.pagos.length}
              >
                {historyModal.data.pagos.length ? (
                  historyModal.data.pagos.map((pago) => (
                    <InfoRow
                      key={pago.id_pago}
                      title={`${pago.categoria} · ${pago.mes} ${pago.anio}`}
                      detail={pago.estado}
                      meta={`$${Number(pago.monto).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })} · ${formatDate(pago.fecha_pago)}`}
                    />
                  ))
                ) : (
                  <InfoEmpty>Sin cuotas registradas.</InfoEmpty>
                )}
              </InfoSection>
              <InfoSection
                title="Inscripciones"
                icon={faIdCard}
                badge={historyModal.data.inscripciones.length}
              >
                {historyModal.data.inscripciones.length ? (
                  historyModal.data.inscripciones.map((item) => (
                    <InfoRow
                      key={item.id_pago_inscripcion}
                      title={`${item.categoria} · ${item.anio}`}
                      detail={item.estado}
                      meta={`$${Number(item.monto).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })} · ${formatDate(item.fecha_pago)}`}
                    />
                  ))
                ) : (
                  <InfoEmpty>Sin inscripciones registradas.</InfoEmpty>
                )}
              </InfoSection>
            </div>
          )
        ) : null}
      </InfoModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={stateModal?.activo ? "Dar de baja al socio" : "Reactivar socio"}
        message={
          stateModal?.activo
            ? "El socio dejará de figurar como activo, pero se conservarán sus datos y su historial."
            : "El socio volverá a estar disponible para nuevas categorías y operaciones."
        }
        details={
          stateModal
            ? [
                {
                  label: "Socio",
                  value: `${stateModal.apellido}, ${stateModal.nombre}`,
                },
                { label: "DNI", value: stateModal.dni },
                {
                  label: "Estado actual",
                  value: stateModal.activo ? "ACTIVO" : "BAJA",
                },
              ]
            : []
        }
        onClose={() => setStateModal(null)}
        onConfirm={changeState}
        onToast={(type, message, duration) =>
          setFeedback({ type, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
        loadingMessage={
          stateModal?.activo
            ? "Dando de baja al socio…"
            : "Reactivando al socio…"
        }
        successMessage={
          stateModal?.activo
            ? "Socio dado de baja correctamente."
            : "Socio reactivado correctamente."
        }
        errorMessage={
          stateModal?.activo
            ? "No se pudo dar de baja al socio."
            : "No se pudo reactivar al socio."
        }
        showReason={Boolean(stateModal?.activo)}
        reasonRequired={Boolean(stateModal?.activo)}
        reasonLabel="Motivo de baja *"
        reasonPlaceholder="Indicá el motivo de la baja..."
        confirmDisabled={Boolean(stateModal?.activo && !stateForm.fecha_baja)}
        extraContent={
          stateModal?.activo ? (
            <label className="entity-field gdel-date-field">
              <span>Fecha de baja *</span>
              <input
                type="date"
                value={stateForm.fecha_baja}
                min={stateModal.fecha_ingreso}
                max={dateToday()}
                onClick={openDatePicker}
                onChange={(e) =>
                  setStateForm((current) => ({
                    ...current,
                    fecha_baja: e.target.value,
                  }))
                }
                required
              />
            </label>
          ) : null
        }
      />
    </>
  );
}
