import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faBell,
  faBuilding,
  faCheck,
  faCircleInfo,
  faClockRotateLeft,
  faEnvelope,
  faHouse,
  faIdCard,
  faPen,
  faReceipt,
  faRotateLeft,
  faTags,
  faTrash,
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
import ModalExportarGlobal from "../Global/Modales/ModalExportarGlobal";
import ModuleFeedback from "../Global/ModuleFeedback";
import BotonExportarGlobal from "../Global/Botones/BotonExportarGlobal";
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
const INFO_TAB_SUMMARY = "general";
const INFO_TAB_CONTACT = "contacto";
const INFO_TAB_HISTORY = "historial";
const INFO_TAB_PAYMENTS = "pagos";
const PAGE_SIZE = 100;
const PARTNER_STATUS_STORAGE_KEY = "lalcec_socios_estado_seleccionado";

function readSharedPartnerStatus() {
  if (typeof window === "undefined") return "ACTIVO";
  try {
    return window.sessionStorage.getItem(PARTNER_STATUS_STORAGE_KEY) ===
      "INACTIVO"
      ? "INACTIVO"
      : "ACTIVO";
  } catch (_error) {
    return "ACTIVO";
  }
}

function saveSharedPartnerStatus(value) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PARTNER_STATUS_STORAGE_KEY,
      value === "INACTIVO" ? "INACTIVO" : "ACTIVO",
    );
  } catch (_error) {
    // La navegación sigue funcionando aunque el almacenamiento esté bloqueado.
  }
}

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

const PERSON_EXPORT_COLUMNS = [
  { label: "N.º", value: (_item, index) => index + 1 },
  { label: "Socio", key: "denominacion" },
  { label: "DNI", value: (item) => item.dni || "—" },
  { label: "Categoría", value: (item) => item.categoria || "SIN CATEGORÍA" },
  { label: "Fecha de alta", value: (item) => formatDate(item.fecha_alta) },
  { label: "Localidad", value: (item) => item.localidad || "—" },
  { label: "Teléfono", value: (item) => item.telefono || "—" },
  { label: "Correo", value: (item) => item.email || "—" },
  {
    label: "Estado",
    value: (item) => item.estado || (item.activo ? "ACTIVO" : "BAJA"),
  },
  {
    label: "Recordatorio",
    value: (item) =>
      item.enviar_recordatorio ? "WHATSAPP" : "SIN AVISO",
  },
];

const COMPANY_EXPORT_COLUMNS = [
  { label: "N.º", value: (_item, index) => index + 1 },
  { label: "Empresa", key: "denominacion" },
  { label: "CUIT", value: (item) => item.cuit || "—" },
  {
    label: "Condición IVA",
    value: (item) => item.condicion_iva || "SIN INFORMAR",
  },
  { label: "Categoría", value: (item) => item.categoria || "SIN CATEGORÍA" },
  { label: "Fecha de alta", value: (item) => formatDate(item.fecha_alta) },
  { label: "Teléfono", value: (item) => item.telefono || "—" },
  { label: "Correo", value: (item) => item.email || "—" },
  {
    label: "Estado",
    value: (item) => item.estado || (item.activo ? "ACTIVA" : "BAJA"),
  },
];

const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  if (currentPage > 4) items.push("ellipsis-left");

  const from = Math.max(2, currentPage - 1);
  const to = Math.min(totalPages - 1, currentPage + 1);
  for (let page = from; page <= to; page += 1) items.push(page);

  if (currentPage < totalPages - 3) items.push("ellipsis-right");
  items.push(totalPages);
  return items;
}

function PaymentCalendar({ payments = [], item }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const admissionDate = item?.fecha_alta
    ? new Date(`${item.fecha_alta}T00:00:00`)
    : null;
  const admissionYear = admissionDate?.getFullYear() || currentYear - 1;
  const admissionMonth = admissionDate?.getMonth() + 1 || 1;
  const years = Array.from(
    new Set([
      currentYear,
      currentYear - 1,
      ...payments.map((payment) => Number(payment.anio)),
    ]),
  )
    .filter((year) => Number.isFinite(year) && year >= admissionYear)
    .sort((left, right) => right - left);
  const [selectedYear, setSelectedYear] = useState(
    years.includes(currentYear) ? currentYear : years[0] || currentYear,
  );

  const paymentMap = new Map(
    payments
      .filter((payment) => Number(payment.anio) === selectedYear)
      .map((payment) => [Number(payment.mes), payment]),
  );
  const dueStart = selectedYear === admissionYear ? admissionMonth : 1;
  const dueEnd =
    selectedYear < currentYear
      ? 12
      : selectedYear === currentYear
        ? currentMonth
        : 0;
  const dueMonths = Math.max(0, dueEnd - dueStart + 1);
  let paidDue = 0;
  for (let month = dueStart; month <= dueEnd; month += 1) {
    if (paymentMap.has(month)) paidDue += 1;
  }
  const pendingDue = Math.max(0, dueMonths - paidDue);
  const paidTotal = paymentMap.size;
  const statusLabel =
    selectedYear > currentYear
      ? "Año futuro"
      : pendingDue === 0
        ? selectedYear < currentYear
          ? "Año completo"
          : "Al día"
        : selectedYear < currentYear
          ? `${pendingDue} ${pendingDue === 1 ? "mes pendiente" : "meses pendientes"}`
          : `Atrasado ${pendingDue} ${pendingDue === 1 ? "mes" : "meses"}`;

  return (
    <div className="socios-payments-card">
      <div className="socios-payments-toolbar">
        <div className="socios-payments-control">
          <strong>Año</strong>
          <div className="socios-payments-years">
            {years.map((year) => (
              <button
                type="button"
                key={year}
                className={year === selectedYear ? "is-active" : ""}
                onClick={() => setSelectedYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
        <div className="socios-payments-control">
          <strong>Estado</strong>
          <span
            className={`socios-payment-status ${pendingDue ? "is-danger" : "is-success"}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="socios-payments-legend">
          <span>
            <i className="is-paid" /> Pagado
          </span>
          <span>
            <i className="is-pending" /> Pendiente
          </span>
        </div>
      </div>

      <div className="socios-payments-heading">
        <strong>Meses — {selectedYear}</strong>
        <div>
          <span className="is-success">
            <FontAwesomeIcon icon={faCheck} /> {paidTotal} pagados
          </span>
          <span className="is-danger">× {pendingDue} pendientes</span>
        </div>
      </div>

      <div className="socios-payments-grid">
        {MONTHS.map((monthName, index) => {
          const month = index + 1;
          const payment = paymentMap.get(month);
          const beforeAdmission =
            selectedYear === admissionYear && month < admissionMonth;
          const future =
            selectedYear > currentYear ||
            (selectedYear === currentYear && month > currentMonth);
          const stateClass = payment
            ? "is-paid"
            : beforeAdmission
              ? "is-not-applicable"
              : future
                ? "is-future"
                : "is-pending";
          const title = payment
            ? `${formatDate(payment.fecha_pago)} · ${formatMoney(payment.monto)} · ${payment.medio_pago || "Medio sin informar"}`
            : beforeAdmission
              ? "Período anterior al alta"
              : future
                ? "Período todavía no vencido"
                : "Período pendiente";
          return (
            <article
              className={`socios-payment-month ${stateClass}`}
              key={monthName}
              title={title}
            >
              <strong>{monthName}</strong>
              <span aria-hidden="true" />
              {payment ? <small>{formatDate(payment.fecha_pago)}</small> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function StateHistory({ events = [] }) {
  if (!events.length) {
    return <InfoEmpty>Sin eventos de estado registrados.</InfoEmpty>;
  }

  return (
    <div className="socios-state-timeline">
      {events.map((event) => {
        const active = event.estado_nuevo === "ACTIVO";
        return (
          <article
            className={`socios-state-event ${active ? "is-active" : "is-inactive"}`}
            key={event.id_historial_estado}
          >
            <span className="socios-state-event__dot" aria-hidden="true" />
            <div className="socios-state-event__content">
              <div>
                <strong>{event.tipo_evento}</strong>
                <time>{formatDate(event.fecha_efectiva)}</time>
              </div>
              <p>
                {event.estado_anterior
                  ? `${event.estado_anterior} → ${event.estado_nuevo}`
                  : `Estado inicial: ${event.estado_nuevo}`}
              </p>
              {event.motivo ? <small>Motivo: {event.motivo}</small> : null}
              {event.observaciones ? (
                <small>{event.observaciones}</small>
              ) : null}
              {event.usuario ? <em>Registrado por {event.usuario}</em> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

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

function PartnerForm({
  type,
  form,
  setForm,
  catalogs,
  activeTab,
  onTabChange,
}) {
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
          title={
            isCompany ? "Identificación empresarial" : "Identificación personal"
          }
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
            <FloatingField
              label="Domicilio"
              active={Boolean(form.domicilio)}
              wide
            >
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

          <label
            className={`socios-reminder-option ${form.enviar_recordatorio ? "is-selected" : ""}`.trim()}
          >
            <input
              type="checkbox"
              checked={Boolean(form.enviar_recordatorio)}
              onChange={(event) =>
                update("enviar_recordatorio", event.target.checked)
              }
            />
            <span>
              <strong>Enviar recordatorios</strong>
              <small>
                Permite incluir este socio en futuros avisos de cuota.
              </small>
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(readSharedPartnerStatus);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [type]);

  const filters = useMemo(
    () => ({
      tipo: type,
      buscar: debouncedSearch,
      estado: status,
      categoria: category,
      pagina: page,
      por_pagina: PAGE_SIZE,
    }),
    [type, debouncedSearch, status, category, page],
  );
  const { items, catalogos, paginacion, loading, error, cargar } =
    useSocios(filters);
  const totalPages = Number(paginacion?.total_paginas || 0);
  const pageOptions = useMemo(
    () => paginationItems(page, totalPages),
    [page, totalPages],
  );

  useEffect(() => {
    if (loading || page <= 1) return;
    if (totalPages === 0 || page > totalPages) {
      setPage(Math.max(1, totalPages));
    }
  }, [loading, page, totalPages]);
  const [form, setForm] = useState(() => emptyForm(type));
  const [formTab, setFormTab] = useState(FORM_TAB_MAIN);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [stateDate, setStateDate] = useState(today());
  const [historyModal, setHistoryModal] = useState(null);
  const [historyTab, setHistoryTab] = useState(INFO_TAB_SUMMARY);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const title = isCompany ? "Empresas" : "Socios";
  const singular = isCompany ? "empresa" : "socio";
  const createTitle = isCompany ? "Nueva empresa" : "Nuevo socio";
  const exportColumns = isCompany
    ? COMPANY_EXPORT_COLUMNS
    : PERSON_EXPORT_COLUMNS;
  const exportFilterDescription = useMemo(() => {
    const selectedCategory = (catalogos.categorias || []).find(
      (item) => String(item.id_categoria) === String(category),
    );
    return [
      status === "INACTIVO" ? "Bajas" : "Activos",
      selectedCategory ? `Categoría: ${selectedCategory.nombre}` : "Todas las categorías",
      debouncedSearch ? `Búsqueda: ${debouncedSearch}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [catalogos.categorias, category, debouncedSearch, status]);

  const obtenerTodosParaExportar = useCallback(async () => {
    const primeraRespuesta = await sociosApi.listar({
      ...filters,
      pagina: 1,
      por_pagina: PAGE_SIZE,
    });
    const registros = [...(primeraRespuesta.items || [])];
    const totalRegistros = Number(
      primeraRespuesta.paginacion?.total || registros.length,
    );
    const totalPaginas = Number(
      primeraRespuesta.paginacion?.total_paginas ||
        Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE)),
    );

    for (let paginaActual = 2; paginaActual <= totalPaginas; paginaActual += 1) {
      const respuesta = await sociosApi.listar({
        ...filters,
        pagina: paginaActual,
        por_pagina: PAGE_SIZE,
      });
      registros.push(...(respuesta.items || []));
    }

    return registros;
  }, [filters]);

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

  const openPermanentDelete = async (item) => {
    if (!item) return;
    setDeleteModal({ item, data: null, loading: true, error: "" });
    try {
      const response = await sociosApi.historial(item.id_socio);
      setDeleteModal({ item, data: response, loading: false, error: "" });
    } catch (requestError) {
      setDeleteModal({
        item,
        data: null,
        loading: false,
        error:
          requestError.message ||
          "No se pudo calcular el impacto de la eliminación.",
      });
    }
  };

  const deletePermanently = async () => {
    if (!deleteModal?.item) return null;
    const response = await sociosApi.eliminarDefinitivo({
      id: deleteModal.item.id_socio,
      confirmacion: "ELIMINAR",
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
      onChange: (value) => {
        saveSharedPartnerStatus(value);
        setStatus(value);
        setPage(1);
      },
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
      onChange: (value) => {
        setCategory(value);
        setPage(1);
      },
      options: (catalogos.categorias || []).map((item) => ({
        value: item.id_categoria,
        label: `${item.nombre}${item.activo ? "" : " (BAJA)"}`,
      })),
    },
  ];

  const info = historyModal?.data;
  const itemInfo = info?.item;
  const deleteImpact = deleteModal?.data?.impacto_eliminacion || {};

  return (
    <>
      <ModulePage
        title={title}
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="socios-headFilters"
        primaryActionLabel={isCompany ? "Nueva empresa" : "Nuevo socio"}
        onPrimaryAction={openNew}
        headerActions={
          <BotonExportarGlobal
            label="Exportar"
            onClick={() => setExportModalOpen(true)}
            disabled={loading || items.length === 0}
            title={`Exportar ${title.toLowerCase()} en Excel o PDF`}
          />
        }
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
        <GlobalDivTable
          className={`socios-table ${Number(paginacion?.total || 0) > 0 ? "has-bottom-pagination" : ""}`.trim()}
          bodyClassName="entity-table-wrap"
          gridClassName={`socios-grid ${isCompany ? "socios-grid--empresa" : "socios-grid--persona"}`}
          ariaLabel={`Listado de ${title.toLowerCase()}`}
          loading={loading}
          loadingLabel={`Cargando ${title.toLowerCase()}...`}
          skeletonRows={7}
          columns={
            isCompany
              ? [
                  "Empresa",
                  "CUIT",
                  "Condición IVA",
                  "Categoría",
                  "Contacto",
                  "Recordatorio",
                  "Acciones",
                ]
              : [
                  "Socio",
                  "DNI",
                  "Categoría",
                  "Contacto",
                  "Recordatorio",
                  "Acciones",
                ]
          }
        >
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <FontAwesomeIcon icon={isCompany ? faBuilding : faUser} />
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
                {!isCompany ? (
                  <small>
                    {[item.localidad, item.domicilio, item.numero_domicilio]
                      .filter(Boolean)
                      .join(" · ") || "SIN DOMICILIO"}
                  </small>
                ) : null}
              </div>
              <div className="mov-gridCell is-strong">
                {isCompany ? item.cuit || "—" : item.dni || "—"}
              </div>
              <div className="mov-gridCell">
                {isCompany ? item.condicion_iva || "—" : item.categoria || "—"}
              </div>
              {isCompany ? (
                <div className="mov-gridCell">{item.categoria || "—"}</div>
              ) : null}
              <div className="mov-gridCell entity-main-cell">
                <span>{item.telefono || "—"}</span>
                <small>{item.email || ""}</small>
              </div>
              <div className="mov-gridCell">
                <span
                  className={`socios-reminder-chip ${item.enviar_recordatorio ? "is-enabled" : "is-disabled"}`}
                  title={
                    item.enviar_recordatorio
                      ? "Incluido en los recordatorios de pago del bot de WhatsApp"
                      : "No recibe recordatorios de pago por WhatsApp"
                  }
                >
                  <FontAwesomeIcon icon={faBell} />
                  <span>
                    {item.enviar_recordatorio ? "WHATSAPP" : "SIN AVISO"}
                  </span>
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
                        className={`mov-iconBtn socios-state-action ${
                          item.activo ? "is-deactivation" : "is-reactivation"
                        }`}
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
                      <button
                        className="mov-iconBtn mov-iconBtn--danger socios-delete-action"
                        type="button"
                        title={`Eliminar definitivamente ${isCompany ? "la empresa" : "al socio"}`}
                        aria-label={`Eliminar definitivamente ${item.denominacion}`}
                        onClick={() => openPermanentDelete(item)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </GlobalDivTable>

        {Number(paginacion?.total || 0) > 0 ? (
          <nav
            className="socios-pagination"
            aria-label={`Paginación de ${title.toLowerCase()}`}
          >
            <p className="socios-pagination__summary">
              Mostrando <strong>{paginacion.desde}</strong>–
              <strong>{paginacion.hasta}</strong> de{" "}
              <strong>{paginacion.total}</strong> {title.toLowerCase()}
              {loading ? <span>Cargando página...</span> : null}
            </p>

            <div className="socios-pagination__controls">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                Anterior
              </button>

              {pageOptions.map((item) =>
                typeof item === "number" ? (
                  <button
                    type="button"
                    key={item}
                    className={item === page ? "is-active" : ""}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => setPage(item)}
                    disabled={loading}
                  >
                    {item}
                  </button>
                ) : (
                  <span
                    className="socios-pagination__ellipsis"
                    key={item}
                    aria-hidden="true"
                  >
                    …
                  </span>
                ),
              )}

              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={loading || totalPages === 0 || page >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </nav>
        ) : null}
      </ModulePage>

      <ModalExportarGlobal
        open={exportModalOpen}
        title={`Exportar ${title.toLowerCase()}`}
        subtitle="Elegí el alcance y descargá la información en Excel o PDF."
        tituloArchivo={title}
        subtituloArchivoActual={`${exportFilterDescription} · Página ${page} de ${Math.max(1, totalPages)}`}
        subtituloArchivoTodos={exportFilterDescription}
        nombreArchivo={isCompany ? "empresas" : "socios"}
        columnas={exportColumns}
        registrosActuales={items}
        obtenerRegistrosTodos={obtenerTodosParaExportar}
        cantidadActual={items.length}
        cantidadTodos={Number(paginacion?.total || items.length)}
        mostrarAlcanceTodos={Number(paginacion?.total || 0) > items.length}
        alcanceActualLabel={totalPages > 1 ? "Exportar esta página" : "Exportar registros visibles"}
        alcanceActualDescription="Descarga los registros visibles con los filtros actuales."
        alcanceTodosLabel={`Exportar todos los ${title.toLowerCase()}`}
        alcanceTodosDescription="Descarga todas las páginas que coinciden con los filtros actuales."
        totalLabelSingular={isCompany ? "empresa disponible" : "socio disponible"}
        totalLabelPlural={isCompany ? "empresas disponibles" : "socios disponibles"}
        onClose={() => setExportModalOpen(false)}
        onSuccess={(message) =>
          setFeedback({ type: "success", message, duration: 4200 })
        }
        onError={(message) =>
          setFeedback({ type: "error", message, duration: 5200 })
        }
      />

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
        closeOnBackdrop={false}
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
        title={
          isCompany ? "Información de la Empresa" : "Información del Socio"
        }
        subtitle={
          itemInfo
            ? `${isCompany ? "CUIT" : "DNI"}: ${isCompany ? itemInfo.cuit || "—" : itemInfo.dni || "—"} · ${itemInfo.denominacion}`
            : historyModal?.item?.denominacion || ""
        }
        onClose={() => setHistoryModal(null)}
        tabs={[
          { value: INFO_TAB_SUMMARY, label: "General", icon: faCircleInfo },
          { value: INFO_TAB_CONTACT, label: "Contacto", icon: faEnvelope },
          {
            value: INFO_TAB_HISTORY,
            label: "Estados",
            icon: faClockRotateLeft,
            badge: info?.historial_estados?.length || null,
          },
          {
            value: INFO_TAB_PAYMENTS,
            label: "Estado de pagos",
            icon: faReceipt,
          },
        ]}
        activeTab={historyTab}
        onTabChange={setHistoryTab}
        loading={historyLoading}
        loadingTitle="Cargando ficha..."
        loadingText="Consultando datos, estados, familias y pagos."
        modalClassName="socios-info-modal"
        closeOnBackdrop={false}
      >
        {historyModal?.error ? (
          <ModuleFeedback type="error" message={historyModal.error} />
        ) : itemInfo ? (
          historyTab === INFO_TAB_SUMMARY ? (
            <div className="socios-info-content">
              <InfoSummary
                items={[
                  {
                    label: "Estado actual",
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
                    label: "Recordatorio WhatsApp",
                    value: itemInfo.enviar_recordatorio
                      ? "HABILITADO"
                      : "DESHABILITADO",
                    icon: faBell,
                    tone: itemInfo.enviar_recordatorio ? "success" : "",
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
                    detail={
                      isCompany
                        ? `CUIT ${itemInfo.cuit || "—"}`
                        : `DNI ${itemInfo.dni || "—"}`
                    }
                  />
                  <InfoRow
                    title="Fecha de alta"
                    detail={formatDate(itemInfo.fecha_alta)}
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

                <InfoSection title="Configuración de cuota" icon={faWallet}>
                  <InfoRow
                    title="Medio habitual"
                    detail={itemInfo.medio_pago || "SIN INFORMAR"}
                  />
                  <InfoRow
                    title="Bot de WhatsApp"
                    detail={
                      itemInfo.enviar_recordatorio
                        ? "RECIBE RECORDATORIOS DE PAGO"
                        : "NO RECIBE RECORDATORIOS"
                    }
                    tone={itemInfo.enviar_recordatorio ? "success" : ""}
                  />
                  {itemInfo.observaciones ? (
                    <InfoRow
                      title="Observaciones"
                      detail={itemInfo.observaciones}
                    />
                  ) : null}
                </InfoSection>
              </div>

              {!isCompany && info.familias?.length ? (
                <InfoSection
                  title="Historial familiar"
                  icon={faHouse}
                  badge={info.familias.length}
                >
                  {info.familias.map((family) => (
                    <InfoRow
                      key={family.id_familia_socio}
                      title={family.familia}
                      detail={`${formatDate(family.fecha_incorporacion)} → ${family.fecha_desvinculacion ? formatDate(family.fecha_desvinculacion) : "ACTUALIDAD"}`}
                      meta={
                        family.parentesco ||
                        (family.es_titular ? "TITULAR" : "")
                      }
                      tone={family.activo ? "success" : ""}
                    />
                  ))}
                </InfoSection>
              ) : null}
            </div>
          ) : historyTab === INFO_TAB_CONTACT ? (
            <div className="socios-info-content">
              <InfoSummary
                items={[
                  {
                    label: "Teléfono",
                    value: itemInfo.telefono || "SIN INFORMAR",
                    icon: faAddressBook,
                  },
                  {
                    label: "Correo",
                    value: itemInfo.email || "SIN INFORMAR",
                    icon: faEnvelope,
                  },
                  {
                    label: "Localidad",
                    value: itemInfo.localidad || "SIN INFORMAR",
                    icon: faHouse,
                  },
                  {
                    label: "Medio habitual",
                    value: itemInfo.medio_pago || "SIN INFORMAR",
                    icon: faWallet,
                  },
                ]}
              />
              <InfoSection title="Datos de contacto" icon={faAddressBook}>
                <InfoRow title="Teléfono" detail={itemInfo.telefono || "—"} />
                <InfoRow
                  title="Correo electrónico"
                  detail={itemInfo.email || "—"}
                />
                <InfoRow
                  title="Domicilio principal"
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
                <InfoRow
                  title="Domicilio alternativo"
                  detail={itemInfo.domicilio_alternativo || "—"}
                />
              </InfoSection>
            </div>
          ) : historyTab === INFO_TAB_HISTORY ? (
            <InfoSection
              title="Historial de altas, bajas y reingresos"
              icon={faClockRotateLeft}
              badge={info.historial_estados?.length || 0}
              className="socios-state-section"
            >
              <StateHistory events={info.historial_estados || []} />
            </InfoSection>
          ) : (
            <PaymentCalendar payments={info.pagos || []} item={itemInfo} />
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
            ? "El registro dejará de estar activo, pero conservará sus pagos, vínculos familiares e historial para permitir un reingreso futuro."
            : "El registro volverá a estar disponible para operaciones nuevas y el reingreso quedará asentado en el historial."
        }
        warning=""
        details={
          stateModal
            ? [
                {
                  label: isCompany ? "Empresa" : "Socio",
                  value: stateModal.denominacion,
                },
                {
                  label: isCompany ? "CUIT" : "DNI",
                  value: isCompany ? stateModal.cuit : stateModal.dni,
                },
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
        modalClassName={
          stateModal?.activo
            ? "socios-deactivation-modal"
            : "socios-reactivation-modal"
        }
      />

      <ModalEliminarGlobal
        open={Boolean(deleteModal)}
        operacion="eliminar"
        row={deleteModal?.item}
        title={`Eliminar definitivamente ${isCompany ? "la empresa" : "al socio"}`}
        message="Confirmá la eliminación definitiva del registro. Esta operación es irreversible."
        details={
          deleteModal?.item
            ? [
                {
                  label: isCompany ? "Empresa" : "Socio",
                  value: deleteModal.item.denominacion,
                },
                {
                  label: isCompany ? "CUIT" : "DNI",
                  value: isCompany
                    ? deleteModal.item.cuit
                    : deleteModal.item.dni,
                },
                {
                  label: "Pagos que se borrarán",
                  value: deleteImpact.pagos ?? "Calculando...",
                },
                {
                  label: "Estados que se borrarán",
                  value: deleteImpact.historial_estados ?? "Calculando...",
                },
                {
                  label: "Vínculos familiares",
                  value: deleteImpact.vinculos_familiares ?? "Calculando...",
                },
              ]
            : []
        }
        extraContent={
          deleteModal?.error ? (
            <p className="socios-delete-confirmation__error">
              {deleteModal.error}
            </p>
          ) : null
        }
        confirmDisabled={
          Boolean(deleteModal?.loading) || Boolean(deleteModal?.error)
        }
        onClose={() => setDeleteModal(null)}
        onConfirm={deletePermanently}
        onToast={(typeFeedback, message, duration) =>
          setFeedback({ type: typeFeedback, message, duration })
        }
        confirmLabel="Eliminar definitivamente"
        loadingLabel="Eliminando..."
        successMessage="El socio y toda su información relacionada fueron eliminados definitivamente."
        errorMessage="No se pudo eliminar definitivamente el socio."
      />
    </>
  );
}
