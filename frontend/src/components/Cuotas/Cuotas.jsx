import React, { useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faCalendarCheck,
  faCircleExclamation,
  faDollarSign,
  faReceipt,
  faTrashCan,
  faUserGroup,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/ModulePage";
import GlobalDivTable from "../Global/GlobalDivTable";
import CrudModal from "../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModalComprobantePago from "../Global/Modales/ModalComprobantePago";
import ModuleFeedback from "../Global/ModuleFeedback";
import { FloatingField } from "../Global/Formularios/TabbedForm";
import { canWrite } from "../_shared/auth/session";
import {
  downloadPaymentReceiptPdf,
  openPaymentReceipt,
} from "../_shared/utils/comprobantePago";
import { cuotasApi } from "./api/cuotasApi";
import { useCuotas } from "./hooks/useCuotas";
import "./Cuotas.css";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";

const selectionKey = (item) =>
  `${item.id_socio}-${item.anio || currentYear}-${item.mes || currentMonth}`;

const emptyForm = () => ({
  id_socio: "",
  anio: String(currentYear),
  mes: String(currentMonth),
  fecha_pago: localToday(),
  monto: "",
  id_medio_pago: "",
  aplicar_familia: false,
  pagos: [],
});

export default function Cuotas() {
  const writable = canWrite();
  const contextRequestId = useRef(0);
  const [tipo, setTipo] = useState("PERSONA");
  const [estado, setEstado] = useState("DEUDORES");
  const [buscar, setBuscar] = useState("");
  const [categoria, setCategoria] = useState("");
  const [anio, setAnio] = useState(String(currentYear));
  const [mes, setMes] = useState(String(currentMonth));
  const [feedback, setFeedback] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState("single");
  const [paymentForm, setPaymentForm] = useState(emptyForm());
  const [paymentContext, setPaymentContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [familyExpanded, setFamilyExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState({});
  const [receipt, setReceipt] = useState(null);

  const filtros = useMemo(
    () => ({ tipo, estado, buscar, categoria, anio, mes }),
    [tipo, estado, buscar, categoria, anio, mes],
  );
  const { items, resumen, catalogos, loading, error, cargar } =
    useCuotas(filtros);

  const partners = tipo === "EMPRESA" ? catalogos.empresas : catalogos.socios;
  const selectedPartner = partners.find(
    (partner) => String(partner.id_socio) === String(paymentForm.id_socio),
  );
  const selectedItems = Object.values(selectedPayments);
  const selectedCount = selectedItems.length;
  const isPaid = estado === "PAGADOS";
  const entityLabel = tipo === "EMPRESA" ? "empresa" : "socio";
  const family = paymentContext?.familia || null;
  const principal = paymentContext?.principal || null;
  const familyPendingMembers = (family?.integrantes || []).filter(
    (member) => member.puede_pagar,
  );
  const paymentTotal =
    paymentMode === "multiple"
      ? paymentForm.pagos.reduce(
          (total, payment) => total + Number(payment.monto || 0),
          0,
        )
      : paymentForm.aplicar_familia && family
        ? Number(family.monto_total || 0)
        : Number(paymentForm.monto || 0);

  const clearMultipleSelection = () => {
    setSelectedPayments({});
    setMultiMode(false);
  };

  const loadPaymentContext = async (
    partnerId,
    year,
    month,
    paymentDate,
    { defaultFamily = false } = {},
  ) => {
    if (!partnerId || !year || !month || !paymentDate) {
      setPaymentContext(null);
      return null;
    }

    const requestId = ++contextRequestId.current;
    setContextLoading(true);
    try {
      const response = await cuotasApi.contextoPago({
        id_socio: partnerId,
        anio: year,
        mes: month,
        fecha_pago: paymentDate,
      });
      if (requestId !== contextRequestId.current) return null;

      setPaymentContext(response);
      const hasFamilyToPay = Boolean(
        response.familia && Number(response.familia.cantidad_pendientes || 0) > 1,
      );
      setPaymentForm((current) => ({
        ...current,
        monto: String(response.principal?.monto_sugerido || ""),
        aplicar_familia: defaultFamily ? hasFamilyToPay : current.aplicar_familia && hasFamilyToPay,
      }));
      return response;
    } catch (err) {
      if (requestId === contextRequestId.current) {
        setPaymentContext(null);
        setFeedback({ type: "error", message: err.message });
      }
      return null;
    } finally {
      if (requestId === contextRequestId.current) setContextLoading(false);
    }
  };

  const applyPartnerDefaults = (partnerId, base = paymentForm) => {
    const partner = partners.find(
      (item) => String(item.id_socio) === String(partnerId),
    );
    const next = {
      ...base,
      id_socio: String(partnerId || ""),
      monto: partner ? String(partner.monto_sugerido || "") : "",
      id_medio_pago: partner?.id_medio_pago
        ? String(partner.id_medio_pago)
        : String(catalogos.medios_pago?.[0]?.id_medio_pago || ""),
      aplicar_familia: false,
    };
    setPaymentForm(next);
    setFamilyExpanded(false);
    loadPaymentContext(
      next.id_socio,
      next.anio,
      next.mes,
      next.fecha_pago,
      { defaultFamily: true },
    );
  };

  const openPayment = (row = null) => {
    setFeedback(null);
    setPaymentMode("single");
    setPaymentContext(null);
    setFamilyExpanded(false);
    const next = {
      ...emptyForm(),
      id_socio: String(row?.id_socio || partners?.[0]?.id_socio || ""),
      anio: String(row?.anio || anio),
      mes: String(row?.mes || mes),
    };
    const partner = partners.find(
      (item) => String(item.id_socio) === String(next.id_socio),
    );
    const resolved = {
      ...next,
      monto: String(row?.monto_sugerido || partner?.monto_sugerido || ""),
      id_medio_pago: String(
        row?.id_medio_pago_preferido ||
          partner?.id_medio_pago ||
          catalogos.medios_pago?.[0]?.id_medio_pago ||
          "",
      ),
    };
    setPaymentForm(resolved);
    setPaymentOpen(true);
    loadPaymentContext(
      resolved.id_socio,
      resolved.anio,
      resolved.mes,
      resolved.fecha_pago,
      { defaultFamily: true },
    );
  };

  const openMultiplePayment = () => {
    if (!selectedCount) {
      setFeedback({
        type: "error",
        message: "Seleccioná al menos una cuota para registrar el pago múltiple.",
      });
      return;
    }
    setFeedback(null);
    setPaymentMode("multiple");
    setPaymentContext(null);
    setPaymentForm({
      ...emptyForm(),
      anio,
      mes,
      id_medio_pago: String(
        selectedItems[0]?.id_medio_pago_preferido ||
          catalogos.medios_pago?.[0]?.id_medio_pago ||
          "",
      ),
      pagos: selectedItems.map((item) => ({
        id_socio: item.id_socio,
        anio: item.anio,
        mes: item.mes,
        denominacion: item.denominacion,
        documento: item.documento,
        categoria: item.categoria,
        familia: item.familia,
        porcentaje_descuento_familiar: item.porcentaje_descuento_familiar,
        monto_base: item.monto_base,
        monto: String(item.monto_sugerido || ""),
      })),
    });
    setPaymentOpen(true);
  };

  const updateSinglePeriod = (field, value) => {
    const next = { ...paymentForm, [field]: value, aplicar_familia: false };
    setPaymentForm(next);
    setFamilyExpanded(false);
    loadPaymentContext(
      next.id_socio,
      next.anio,
      next.mes,
      next.fecha_pago,
      { defaultFamily: true },
    );
  };

  const updateBatchAmount = (index, value) => {
    setPaymentForm((current) => ({
      ...current,
      pagos: current.pagos.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, monto: value } : payment,
      ),
    }));
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!paymentForm.id_medio_pago) {
      setFeedback({ type: "error", message: "Seleccioná el medio de pago." });
      return;
    }
    if (!paymentForm.fecha_pago) {
      setFeedback({ type: "error", message: "Completá la fecha de pago." });
      return;
    }

    if (paymentMode === "single") {
      if (!paymentForm.id_socio) {
        setFeedback({
          type: "error",
          message: `Seleccioná un ${tipo === "EMPRESA" ? "empresa" : "socio"}.`,
        });
        return;
      }
      if (!paymentForm.aplicar_familia && !(Number(paymentForm.monto) > 0)) {
        setFeedback({ type: "error", message: "El monto debe ser mayor a cero." });
        return;
      }
    } else if (
      !paymentForm.pagos.length ||
      paymentForm.pagos.some((payment) => !(Number(payment.monto) > 0))
    ) {
      setFeedback({
        type: "error",
        message: "Todos los pagos seleccionados deben tener un monto mayor a cero.",
      });
      return;
    }

    setSaving(true);
    try {
      const response =
        paymentMode === "multiple"
          ? await cuotasApi.registrarPagos({
              fecha_pago: paymentForm.fecha_pago,
              id_medio_pago: Number(paymentForm.id_medio_pago),
              pagos: paymentForm.pagos.map((payment) => ({
                id_socio: Number(payment.id_socio),
                anio: Number(payment.anio),
                mes: Number(payment.mes),
                monto: Number(payment.monto),
              })),
            })
          : await cuotasApi.registrarPago({
              id_socio: Number(paymentForm.id_socio),
              anio: Number(paymentForm.anio),
              mes: Number(paymentForm.mes),
              fecha_pago: paymentForm.fecha_pago,
              monto: Number(paymentForm.monto),
              id_medio_pago: Number(paymentForm.id_medio_pago),
              aplicar_familia: Boolean(paymentForm.aplicar_familia),
            });

      setPaymentOpen(false);
      setReceipt(response.comprobante || null);
      setAnio(String(paymentForm.anio || anio));
      setMes(String(paymentForm.mes || mes));
      setEstado("PAGADOS");
      setFeedback(null);
      clearMultipleSelection();
      await cargar();
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = async () => {
    const response = await cuotasApi.eliminarPago(deleteRow.id_pago);
    setDeleteRow(null);
    setEstado("DEUDORES");
    setFeedback({ type: "success", message: response.mensaje });
    await cargar();
    return response;
  };

  const toggleSelection = (item) => {
    const key = selectionKey(item);
    setSelectedPayments((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
  };

  const setTypeFilter = (value) => {
    setTipo(value);
    setBuscar("");
    setCategoria("");
    clearMultipleSelection();
  };

  const setYearFilter = (value) => {
    setAnio(value);
    clearMultipleSelection();
  };

  const setMonthFilter = (value) => {
    setMes(value);
    clearMultipleSelection();
  };

  const pageFilters = [
    {
      key: "tipo",
      type: "tabs",
      label: "Tipo",
      ariaLabel: "Secciones de cuotas",
      value: tipo,
      onChange: setTypeFilter,
      options: [
        { value: "PERSONA", label: "Socios" },
        { value: "EMPRESA", label: "Empresas" },
      ],
    },
    {
      key: "estado",
      type: "tabs",
      label: "Estado",
      ariaLabel: "Estado de las cuotas",
      value: estado,
      onChange: (value) => {
        setEstado(value);
        if (value === "PAGADOS") clearMultipleSelection();
      },
      options: [
        { value: "DEUDORES", label: "Deudores" },
        { value: "PAGADOS", label: "Pagados" },
      ],
    },
    {
      key: "buscar",
      type: "search",
      label: "Búsqueda",
      placeholder:
        tipo === "EMPRESA"
          ? "Buscar empresa o CUIT..."
          : "Buscar socio o DNI...",
      value: buscar,
      onChange: setBuscar,
      className: "cuotas-search-filter",
    },
    {
      key: "categoria",
      type: "select",
      label: "Categoría",
      placeholder: "Todas",
      value: categoria,
      onChange: setCategoria,
      options: (catalogos.categorias || []).map((item) => ({
        value: item.id_categoria,
        label: `${item.nombre}${item.activo ? "" : " (BAJA)"}`,
      })),
      className: "cuotas-category-filter",
    },
    {
      key: "anio",
      type: "select",
      label: "Año",
      value: anio,
      onChange: setYearFilter,
      includeEmptyOption: false,
      options: (catalogos.anios?.length ? catalogos.anios : [currentYear]).map(
        (value) => ({ value, label: value }),
      ),
      className: "cuotas-year-filter",
    },
    {
      key: "mes",
      type: "select",
      label: "Mes",
      value: mes,
      onChange: setMonthFilter,
      includeEmptyOption: false,
      options: (catalogos.meses || []).map((item) => ({
        value: item.id_mes,
        label: item.nombre,
      })),
      className: "cuotas-month-filter",
    },
  ];

  const tableLabel = `Cuotas de ${tipo === "EMPRESA" ? "empresas" : "socios"} ${isPaid ? "pagadas" : "adeudadas"}`;
  const baseDebtColumns = [
    tipo === "EMPRESA" ? "Empresa" : "Socio",
    tipo === "EMPRESA" ? "CUIT" : "DNI",
    "Categoría",
    "Período",
    "Importe sugerido",
    "Acciones",
  ];
  const columns = isPaid
    ? [
        tipo === "EMPRESA" ? "Empresa" : "Socio",
        tipo === "EMPRESA" ? "CUIT" : "DNI",
        "Categoría",
        "Período",
        "Fecha de pago",
        "Medio",
        "Importe",
        "Acciones",
      ]
    : multiMode
      ? ["Seleccionar", ...baseDebtColumns]
      : baseDebtColumns;

  const debtGridClass = multiMode
    ? "cuotas-grid cuotas-grid--debt cuotas-grid--selecting"
    : "cuotas-grid cuotas-grid--debt";
  const debtRowClass = multiMode
    ? "cuotas-grid--debt cuotas-grid--selecting"
    : "cuotas-grid--debt";

  return (
    <>
      <ModulePage
        title="Cuotas"
        description="Control mensual de cuotas de socios y empresas."
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="cuotas-head-filters"
        primaryActionLabel={
          multiMode ? `Pagar seleccionados (${selectedCount})` : "Registrar pago"
        }
        onPrimaryAction={
          multiMode ? (selectedCount ? openMultiplePayment : undefined) : () => openPayment()
        }
        secondaryActions={
          !isPaid && writable
            ? [
                {
                  key: "multiple-selection",
                  label: multiMode ? "Cancelar selección" : "Selección múltiple",
                  icon: faUserGroup,
                  onClick: () => {
                    if (multiMode) clearMultipleSelection();
                    else setMultiMode(true);
                  },
                  className: multiMode ? "mov-btn--danger" : "mov-btn--ghost",
                },
              ]
            : []
        }
        canCreate={writable}
        refreshing={loading}
        stats={[
          {
            label: isPaid ? "Pagados" : "Deudores",
            value: Number(resumen.total || 0),
            detail: `${mes}/${anio} · ${tipo === "EMPRESA" ? "empresas" : "socios"}`,
            icon: isPaid ? faCalendarCheck : faCircleExclamation,
          },
          {
            label: isPaid ? "Total cobrado" : "Total esperado",
            value: money(resumen.importe),
            detail: isPaid
              ? "Importes registrados en el período"
              : "Incluye descuentos familiares vigentes",
            icon: faDollarSign,
          },
          {
            label: "Con categoría",
            value: Number(resumen.con_categoria || 0),
            detail: `${Number(resumen.sin_categoria || 0)} sin categoría asignada`,
            icon: tipo === "EMPRESA" ? faBuilding : faUserGroup,
          },
        ]}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Registrar y eliminar pagos está deshabilitado."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />

        {multiMode ? (
          <div className="cuotas-selection-bar" role="status">
            <div>
              <FontAwesomeIcon icon={faUserGroup} />
              <strong>{selectedCount} cuota{selectedCount === 1 ? "" : "s"} seleccionada{selectedCount === 1 ? "" : "s"}</strong>
              <span>Podés seguir buscando y marcando registros sin perder la selección.</span>
            </div>
            {selectedCount ? (
              <button
                type="button"
                className="mov-btn mov-btn--ghost"
                onClick={() => setSelectedPayments({})}
              >
                Limpiar selección
              </button>
            ) : null}
          </div>
        ) : null}

        <GlobalDivTable
          className="cuotas-table"
          bodyClassName="entity-table-wrap"
          gridClassName={isPaid ? "cuotas-grid cuotas-grid--paid" : debtGridClass}
          ariaLabel={tableLabel}
          loading={loading}
          loadingLabel="Cargando cuotas..."
          skeletonRows={8}
          columns={columns}
        >
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <FontAwesomeIcon icon={isPaid ? faReceipt : faWallet} />
              <strong>
                {isPaid ? "No hay pagos registrados" : "No hay deudores"}
              </strong>
              <span>
                {isPaid
                  ? "No existen pagos para el mes, año y filtros seleccionados."
                  : "Todos los registros del período están pagados o todavía no debían cuota."}
              </span>
            </div>
          ) : null}

          {items.map((item) => {
            const selected = Boolean(selectedPayments[selectionKey(item)]);
            return (
              <div
                className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-grid ${isPaid ? "cuotas-grid--paid" : debtRowClass} ${selected ? "is-selected" : ""}`}
                role="row"
                key={item.id_pago || `${item.id_socio}-${item.anio}-${item.mes}`}
              >
                {!isPaid && multiMode ? (
                  <div className="mov-gridCell cuotas-select-cell">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelection(item)}
                      aria-label={`Seleccionar cuota de ${item.denominacion}`}
                    />
                  </div>
                ) : null}
                <div className="mov-gridCell entity-main-cell">
                  <strong>{item.denominacion || `ID ${item.id_socio}`}</strong>
                  <small>
                    {item.familia
                      ? `${item.familia} · ${Number(item.porcentaje_descuento_familiar || 0).toFixed(2)}% DESC.`
                      : item.estado_socio === "INACTIVO"
                        ? "REGISTRO DADO DE BAJA"
                        : `ID ${item.id_socio}`}
                  </small>
                </div>
                <div className="mov-gridCell is-strong">
                  {item.documento || "—"}
                </div>
                <div className="mov-gridCell">
                  <span className={`cuotas-category-chip ${item.categoria ? "" : "is-empty"}`}>
                    {item.categoria || "SIN CATEGORÍA"}
                  </span>
                </div>
                <div className="mov-gridCell is-strong">{item.periodo}</div>
                {isPaid ? (
                  <>
                    <div className="mov-gridCell">{formatDate(item.fecha_pago)}</div>
                    <div className="mov-gridCell">{item.medio_pago || "—"}</div>
                    <div className="mov-gridCell cuotas-money-cell">
                      {money(item.monto)}
                    </div>
                  </>
                ) : (
                  <div className="mov-gridCell cuotas-money-cell">
                    {Number(item.monto_sugerido || 0) > 0 ? (
                      <>
                        {money(item.monto_sugerido)}
                        {Number(item.porcentaje_descuento_familiar || 0) > 0 ? (
                          <small className="cuotas-discount-note">
                            Base {money(item.monto_base)}
                          </small>
                        ) : null}
                      </>
                    ) : (
                      "A DEFINIR"
                    )}
                  </div>
                )}
                <div className="mov-gridCell mov-gridCell--actions">
                  <div className="mov-actionsInline">
                    {isPaid ? (
                      <button
                        type="button"
                        className="mov-iconBtn mov-iconBtn--danger"
                        title="Eliminar pago"
                        aria-label={`Eliminar pago de ${item.denominacion}`}
                        onClick={() => setDeleteRow(item)}
                        disabled={!writable}
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>
                    ) : multiMode ? (
                      <button
                        type="button"
                        className={`mov-btn cuotas-pay-button ${selected ? "mov-btn--danger" : "mov-btn--ghost"}`}
                        onClick={() => toggleSelection(item)}
                        disabled={!writable}
                      >
                        {selected ? "Quitar" : "Seleccionar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mov-btn mov-btn--primary cuotas-pay-button"
                        onClick={() => openPayment(item)}
                        disabled={!writable}
                      >
                        <FontAwesomeIcon icon={faDollarSign} />
                        Registrar pago
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </GlobalDivTable>
      </ModulePage>

      <CrudModal
        open={paymentOpen}
        title={
          paymentMode === "multiple"
            ? "Registrar pagos seleccionados"
            : "Registrar pago de cuota"
        }
        subtitle={
          paymentMode === "multiple"
            ? `Se registrarán ${paymentForm.pagos.length} cuotas en una sola operación.`
            : `Completá el cobro mensual del ${entityLabel}.`
        }
        onClose={() => !saving && setPaymentOpen(false)}
        onSubmit={submitPayment}
        saving={saving}
        submitLabel={
          paymentMode === "multiple"
            ? `Registrar ${paymentForm.pagos.length} pagos`
            : paymentForm.aplicar_familia && family
              ? `Registrar pago familiar (${familyPendingMembers.length})`
              : "Registrar pago"
        }
        submitDisabled={contextLoading || !(paymentTotal > 0)}
        wide
        modalClassName="cuotas-payment-modal"
      >
        {paymentMode === "single" ? (
          <>
            <div className="entity-form__grid cuotas-payment-grid">
              <FloatingField
                label={tipo === "EMPRESA" ? "Empresa *" : "Socio *"}
                active={Boolean(paymentForm.id_socio)}
                wide
              >
                <select
                  value={paymentForm.id_socio}
                  onChange={(event) => applyPartnerDefaults(event.target.value)}
                  aria-label={tipo === "EMPRESA" ? "Empresa *" : "Socio *"}
                >
                  <option value="">Seleccionar...</option>
                  {partners.map((partner) => (
                    <option key={partner.id_socio} value={partner.id_socio}>
                      {partner.denominacion}
                      {partner.documento ? ` · ${partner.documento}` : ""}
                    </option>
                  ))}
                </select>
              </FloatingField>

              <FloatingField label="Año *" active={Boolean(paymentForm.anio)}>
                <select
                  value={paymentForm.anio}
                  onChange={(event) => updateSinglePeriod("anio", event.target.value)}
                  aria-label="Año *"
                >
                  {(catalogos.anios || []).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FloatingField>

              <FloatingField label="Mes *" active={Boolean(paymentForm.mes)}>
                <select
                  value={paymentForm.mes}
                  onChange={(event) => updateSinglePeriod("mes", event.target.value)}
                  aria-label="Mes *"
                >
                  {(catalogos.meses || []).map((item) => (
                    <option key={item.id_mes} value={item.id_mes}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </FloatingField>

              <FloatingField label="Fecha de pago *" active={Boolean(paymentForm.fecha_pago)}>
                <input
                  type="date"
                  value={paymentForm.fecha_pago}
                  onChange={(event) => updateSinglePeriod("fecha_pago", event.target.value)}
                  aria-label="Fecha de pago *"
                />
              </FloatingField>

              <FloatingField
                label={paymentForm.aplicar_familia && family ? "Monto total *" : "Monto *"}
                active={Boolean(paymentForm.monto)}
              >
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={
                    paymentForm.aplicar_familia && family
                      ? family.monto_total
                      : paymentForm.monto
                  }
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      monto: event.target.value,
                    }))
                  }
                  readOnly={Boolean(paymentForm.aplicar_familia && family)}
                  aria-label={paymentForm.aplicar_familia && family ? "Monto total *" : "Monto *"}
                  placeholder="0,00"
                />
              </FloatingField>

              <FloatingField
                label="Medio de pago *"
                active={Boolean(paymentForm.id_medio_pago)}
              >
                <select
                  value={paymentForm.id_medio_pago}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      id_medio_pago: event.target.value,
                    }))
                  }
                  aria-label="Medio de pago *"
                >
                  <option value="">Seleccionar...</option>
                  {(catalogos.medios_pago || []).map((item) => (
                    <option key={item.id_medio_pago} value={item.id_medio_pago}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </FloatingField>
            </div>

            {contextLoading ? (
              <div className="cuotas-context-loading">Consultando grupo familiar y descuento…</div>
            ) : family ? (
              <section className="cuotas-family-card" aria-label="Grupo familiar del socio">
                <div className="cuotas-family-card__head">
                  <div>
                    <span>Grupo familiar detectado</span>
                    <strong>{family.nombre}</strong>
                    <small>
                      {family.cantidad_integrantes} integrantes · Descuento vigente: {Number(family.porcentaje_descuento || 0).toFixed(2)}%
                    </small>
                  </div>
                  <button
                    type="button"
                    className="mov-btn mov-btn--ghost"
                    onClick={() => setFamilyExpanded((current) => !current)}
                  >
                    {familyExpanded ? "Ocultar integrantes" : "Ver quiénes forman parte"}
                  </button>
                </div>

                <label className="cuotas-family-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(paymentForm.aplicar_familia)}
                    disabled={familyPendingMembers.length < 2}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        aplicar_familia: event.target.checked,
                      }))
                    }
                    aria-label="Aplicar pago a todo el grupo familiar"
                  />
                  <span>
                    <strong>Aplicar pago a todo el grupo familiar</strong>
                    <small>
                      Está seleccionado por defecto. Al desmarcarlo, se registra únicamente la cuota de {principal?.denominacion || selectedPartner?.denominacion || "este socio"}.
                    </small>
                  </span>
                </label>

                {familyExpanded ? (
                  <div className="cuotas-family-members">
                    {family.integrantes.map((member) => (
                      <article
                        key={member.id_socio}
                        className={member.puede_pagar ? "" : "is-unavailable"}
                      >
                        <div>
                          <strong>{member.denominacion}</strong>
                          <span>
                            {member.documento || "SIN DNI"} · {member.categoria || "SIN CATEGORÍA"}
                          </span>
                        </div>
                        <div>
                          {member.puede_pagar ? (
                            <>
                              <strong>{money(member.monto_sugerido)}</strong>
                              <small>Base {money(member.monto_base)}</small>
                            </>
                          ) : (
                            <strong>{member.pagado ? "YA PAGADO" : "NO DISPONIBLE"}</strong>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : tipo === "PERSONA" && paymentForm.id_socio ? (
              <div className="cuotas-no-family">
                <FontAwesomeIcon icon={faUserGroup} />
                <span>Este socio no pertenece a un grupo familiar activo. El pago se registrará únicamente para su cuota.</span>
              </div>
            ) : null}

            <div className="cuotas-payment-summary">
              <span>
                <FontAwesomeIcon icon={faReceipt} /> Resumen del cobro
              </span>
              <strong>{principal?.denominacion || selectedPartner?.denominacion || "Seleccioná un registro"}</strong>
              <small>
                {paymentForm.aplicar_familia && family
                  ? `${familyPendingMembers.length} cuotas pendientes del grupo · Total a registrar: ${money(paymentTotal)}`
                  : `${principal?.categoria || selectedPartner?.categoria || "SIN CATEGORÍA"} · Importe a registrar: ${money(paymentTotal)}`}
              </small>
            </div>
          </>
        ) : (
          <>
            <div className="entity-form__grid cuotas-payment-grid cuotas-payment-grid--multiple">
              <FloatingField label="Fecha de pago *" active={Boolean(paymentForm.fecha_pago)}>
                <input
                  type="date"
                  value={paymentForm.fecha_pago}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      fecha_pago: event.target.value,
                    }))
                  }
                  aria-label="Fecha de pago *"
                />
              </FloatingField>
              <FloatingField
                label="Medio de pago *"
                active={Boolean(paymentForm.id_medio_pago)}
              >
                <select
                  value={paymentForm.id_medio_pago}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      id_medio_pago: event.target.value,
                    }))
                  }
                  aria-label="Medio de pago *"
                >
                  <option value="">Seleccionar...</option>
                  {(catalogos.medios_pago || []).map((item) => (
                    <option key={item.id_medio_pago} value={item.id_medio_pago}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </FloatingField>
            </div>

            <section className="cuotas-batch-list" aria-label="Pagos seleccionados">
              <header>
                <div>
                  <span>Selección múltiple</span>
                  <strong>{paymentForm.pagos.length} cuotas listas para registrar</strong>
                </div>
                <strong>{money(paymentTotal)}</strong>
              </header>
              <div>
                {paymentForm.pagos.map((payment, index) => (
                  <article key={`${payment.id_socio}-${payment.anio}-${payment.mes}`}>
                    <div>
                      <strong>{payment.denominacion}</strong>
                      <span>
                        {payment.documento || "—"} · {payment.categoria || "SIN CATEGORÍA"} · {payment.mes}/{payment.anio}
                      </span>
                      {payment.familia ? (
                        <small>
                          {payment.familia} · {Number(payment.porcentaje_descuento_familiar || 0).toFixed(2)}% de descuento
                        </small>
                      ) : null}
                    </div>
                    <label>
                      <span>Monto</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={payment.monto}
                        onChange={(event) => updateBatchAmount(index, event.target.value)}
                        aria-label={`Monto de ${payment.denominacion}`}
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </CrudModal>

      <ModalComprobantePago
        open={Boolean(receipt)}
        comprobante={receipt}
        onClose={() => setReceipt(null)}
        onPrint={() => openPaymentReceipt(receipt, { openPrintDialog: true })}
        onExportPdf={() => downloadPaymentReceiptPdf(receipt)}
      />

      <ModalEliminarGlobal
        open={Boolean(deleteRow)}
        operacion="eliminar"
        row={deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={deletePayment}
        title="Eliminar pago registrado"
        message="¿Seguro que querés eliminar este pago?"
        warning="La cuota volverá a aparecer en Deudores para el mismo mes y año."
        confirmLabel="Eliminar pago"
        loadingMessage="Eliminando pago…"
        successMessage="Pago eliminado correctamente."
        errorMessage="No se pudo eliminar el pago."
        details={[
          { label: tipo === "EMPRESA" ? "Empresa" : "Socio", value: deleteRow?.denominacion },
          { label: "Período", value: deleteRow?.periodo },
          { label: "Importe", value: money(deleteRow?.monto) },
          { label: "Medio", value: deleteRow?.medio_pago || "—" },
        ]}
      />
    </>
  );
}
