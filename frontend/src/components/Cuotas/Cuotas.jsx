import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faDollarSign,
  faPrint,
  faReceipt,
  faTimes,
  faUserGroup,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../Global/ModulePage";
import GlobalDivTable from "../Global/GlobalDivTable";
import SummaryCards from "../Global/SummaryCards";
import CrudModal from "../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModalComprobantePago from "../Global/Modales/ModalComprobantePago";
import ModuleFeedback from "../Global/ModuleFeedback";
import Toast from "../Global/Toast";
import { FloatingField } from "../Global/Formularios/TabbedForm";
import { canWrite } from "../_shared/auth/session";
import {
  downloadPaymentReceiptPdf,
  openPaymentReceipt,
} from "../_shared/utils/comprobantePago";
import { cuotasApi } from "./api/cuotasApi";
import { useCuotas } from "./hooks/useCuotas";
import "./Cuotas.css";
import "./modales/CuotasModal.css";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;
const PAGE_SIZE = 100;

const DEFAULT_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
].map((nombre, index) => ({ id_mes: index + 1, nombre }));

function PaymentYearChip({ value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="cuotas-year-chip" ref={containerRef}>
      <button
        type="button"
        className={open ? "is-open" : ""}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Año ${value}`}
      >
        <FontAwesomeIcon icon={faCalendarDays} />
        <span>{value}</span>
        <i aria-hidden="true" />
      </button>

      {open ? (
        <div className="cuotas-year-chip__menu" role="listbox">
          {options.map((year) => {
            const selected = String(year) === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? "is-selected" : ""}
                key={year}
                onClick={() => {
                  onChange(String(year));
                  setOpen(false);
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const paginationItems = (currentPage, totalPages) => {
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
};

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

const isTruthyFlag = (value) =>
  value === true ||
  value === 1 ||
  ["1", "SI", "SÍ", "TRUE", "PAGADO"].includes(
    String(value || "")
      .trim()
      .toUpperCase(),
  );

const isPaidPrincipal = (principal) =>
  Boolean(principal?.id_pago) ||
  isTruthyFlag(principal?.pagado) ||
  isTruthyFlag(principal?.ya_pagado) ||
  String(principal?.estado || "").toUpperCase() === "PAGADO";

const isUnavailablePrincipal = (principal) =>
  !principal ||
  principal.puede_pagar === false ||
  principal.puede_pagar === 0 ||
  principal.puede_pagar === "0" ||
  principal.disponible === false;

const selectionKey = (item) =>
  `${item.id_socio}-${item.anio || currentYear}-${item.mes || currentMonth}`;

const emptyForm = () => ({
  id_socio: "",
  anio: String(currentYear),
  mes: String(currentMonth),
  meses: [],
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
  const [anio, setAnio] = useState(String(currentYear));
  const [mes, setMes] = useState(String(currentMonth));
  const [pagina, setPagina] = useState(1);
  const [feedback, setFeedback] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState("single");
  const [paymentForm, setPaymentForm] = useState(emptyForm());
  const [paymentContext, setPaymentContext] = useState(null);
  const [paymentPeriods, setPaymentPeriods] = useState({});
  const [contextLoading, setContextLoading] = useState(false);
  const [familyExpanded, setFamilyExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState({});
  const [receipt, setReceipt] = useState(null);

  const filtros = useMemo(
    () => ({ tipo, estado, buscar, anio, mes, pagina, por_pagina: PAGE_SIZE }),
    [tipo, estado, buscar, anio, mes, pagina],
  );
  const { items, resumen, catalogos, paginacion, loading, error, cargar } =
    useCuotas(filtros);
  const usaPaginacionRemota = Boolean(
    paginacion &&
      (paginacion.total != null ||
        paginacion.total_paginas != null ||
        paginacion.pagina != null),
  );
  const totalRegistros = usaPaginacionRemota
    ? Number(paginacion.total || 0)
    : items.length;
  const paginaRemota = Number(paginacion?.pagina || pagina);
  const porPaginaRemota = Number(paginacion?.por_pagina || PAGE_SIZE);
  const totalPaginas = usaPaginacionRemota
    ? Number(
        paginacion.total_paginas || Math.ceil(totalRegistros / porPaginaRemota),
      )
    : Math.ceil(items.length / PAGE_SIZE);
  const opcionesPagina = useMemo(
    () => paginationItems(pagina, totalPaginas),
    [pagina, totalPaginas],
  );
  const itemsPagina = useMemo(() => {
    if (usaPaginacionRemota) return items;
    const inicio = (pagina - 1) * PAGE_SIZE;
    return items.slice(inicio, inicio + PAGE_SIZE);
  }, [items, pagina, usaPaginacionRemota]);
  const registroDesde = usaPaginacionRemota
    ? Number(
        paginacion.desde ||
          (totalRegistros ? (paginaRemota - 1) * porPaginaRemota + 1 : 0),
      )
    : totalRegistros
      ? (pagina - 1) * PAGE_SIZE + 1
      : 0;
  const registroHasta = usaPaginacionRemota
    ? Number(
        paginacion.hasta ||
          Math.min(paginaRemota * porPaginaRemota, totalRegistros),
      )
    : Math.min(pagina * PAGE_SIZE, totalRegistros);

  useEffect(() => {
    setPagina(1);
  }, [tipo, estado, buscar, anio, mes]);

  useEffect(() => {
    if (loading || pagina <= 1) return;
    if (totalPaginas === 0 || pagina > totalPaginas) {
      setPagina(Math.max(1, totalPaginas));
    }
  }, [loading, pagina, totalPaginas]);

  const partners = tipo === "EMPRESA" ? catalogos.empresas : catalogos.socios;
  const selectedPartner = partners.find(
    (partner) => String(partner.id_socio) === String(paymentForm.id_socio),
  );
  const monthOptions = catalogos.meses?.length
    ? catalogos.meses
    : DEFAULT_MONTHS;
  const paymentYearOptions = Array.from(
    new Set(
      [...(catalogos.anios || []), currentYear, paymentForm.anio]
        .filter(Boolean)
        .map(String),
    ),
  )
    .filter(Boolean)
    .sort((left, right) => Number(right) - Number(left));
  const selectedMonthIds = (paymentForm.meses || [])
    .map(String)
    .sort((left, right) => Number(left) - Number(right));
  const availableMonthIds = monthOptions
    .map((item) => String(item.id_mes))
    .filter((monthId) => {
      const period = paymentPeriods[monthId];
      return period && !period.paid && !period.unavailable;
    });
  const allAvailableMonthsSelected =
    availableMonthIds.length > 0 &&
    availableMonthIds.every((monthId) => selectedMonthIds.includes(monthId));
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
      : selectedMonthIds.length > 1
        ? selectedMonthIds.reduce((total, monthId) => {
            const principalForMonth =
              paymentPeriods[monthId]?.context?.principal;
            return (
              total +
              Number(
                principalForMonth?.monto_sugerido ||
                  principalForMonth?.monto_base ||
                  selectedPartner?.monto_sugerido ||
                  0,
              )
            );
          }, 0)
        : paymentForm.aplicar_familia && family
          ? Number(family.monto_total || 0)
          : selectedMonthIds.length === 1
            ? Number(paymentForm.monto || 0)
            : 0;

  const clearMultipleSelection = () => {
    setSelectedPayments({});
    setMultiMode(false);
  };

  const cancelMultipleSelection = () => {
    if (saving) return;
    if (paymentMode === "multiple") setPaymentOpen(false);
    clearMultipleSelection();
  };

  const closePayment = () => {
    if (saving) return;
    contextRequestId.current += 1;
    setContextLoading(false);
    setPaymentOpen(false);
    if (paymentMode === "multiple") clearMultipleSelection();
  };

  const loadPaymentPeriods = async (
    partnerId,
    year,
    paymentDate,
    { selectedMonths = [], activeMonth = "", defaultFamily = false } = {},
  ) => {
    if (!partnerId || !year || !paymentDate) {
      setPaymentContext(null);
      setPaymentPeriods({});
      return null;
    }

    const requestId = ++contextRequestId.current;
    setContextLoading(true);
    setPaymentPeriods({});

    try {
      const periods = await Promise.all(
        monthOptions.map(async (monthItem) => {
          const monthId = String(monthItem.id_mes);
          try {
            const context = await cuotasApi.contextoPago({
              id_socio: partnerId,
              anio: year,
              mes: monthId,
              fecha_pago: paymentDate,
            });
            return {
              monthId,
              context,
              paid: isPaidPrincipal(context?.principal),
              unavailable: isUnavailablePrincipal(context?.principal),
            };
          } catch {
            return { monthId, context: null, paid: false, unavailable: true };
          }
        }),
      );
      if (requestId !== contextRequestId.current) return null;

      const periodMap = Object.fromEntries(
        periods.map((period) => [period.monthId, period]),
      );
      const validSelection = selectedMonths
        .map(String)
        .filter(
          (monthId) =>
            periodMap[monthId] &&
            !periodMap[monthId].paid &&
            !periodMap[monthId].unavailable,
        )
        .sort((left, right) => Number(left) - Number(right));
      const resolvedActiveMonth = validSelection.includes(String(activeMonth))
        ? String(activeMonth)
        : validSelection[0] || "";
      const activeContext = periodMap[resolvedActiveMonth]?.context || null;
      const hasFamilyToPay = Boolean(
        validSelection.length === 1 &&
        activeContext?.familia &&
        Number(activeContext.familia.cantidad_pendientes || 0) > 1,
      );

      setPaymentPeriods(periodMap);
      setPaymentContext(activeContext);
      setPaymentForm((current) => ({
        ...current,
        mes: resolvedActiveMonth || current.mes,
        meses: validSelection,
        monto: String(activeContext?.principal?.monto_sugerido || ""),
        aplicar_familia: defaultFamily
          ? hasFamilyToPay
          : current.aplicar_familia && hasFamilyToPay,
      }));
      return periodMap;
    } catch (err) {
      if (requestId === contextRequestId.current) {
        setPaymentContext(null);
        setPaymentPeriods({});
        setFeedback({
          type: "error",
          message: err.message || "No se pudieron consultar los períodos.",
        });
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
      meses: base.meses || [],
      monto: partner ? String(partner.monto_sugerido || "") : "",
      id_medio_pago: partner?.id_medio_pago
        ? String(partner.id_medio_pago)
        : String(catalogos.medios_pago?.[0]?.id_medio_pago || ""),
      aplicar_familia: false,
    };
    setPaymentForm(next);
    setFamilyExpanded(false);
    loadPaymentPeriods(next.id_socio, next.anio, next.fecha_pago, {
      selectedMonths: next.meses,
      activeMonth: next.mes,
      defaultFamily: next.meses.length === 1,
    });
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
      meses: [String(row?.mes || mes)],
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
    loadPaymentPeriods(resolved.id_socio, resolved.anio, resolved.fecha_pago, {
      selectedMonths: resolved.meses,
      activeMonth: resolved.mes,
      defaultFamily: true,
    });
  };

  const openMultiplePayment = () => {
    if (!selectedCount) {
      setFeedback({
        type: "error",
        message:
          "Seleccioná al menos una cuota para registrar el pago múltiple.",
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
    setMultiMode(false);
  };

  const printPaymentRow = (item) => {
    const amount = Number(
      isPaid ? item.monto || 0 : item.monto_sugerido || item.monto_base || 0,
    );

    openPaymentReceipt(
      {
        operacion: {
          codigo_operacion:
            item.codigo_operacion ||
            item.numero_comprobante ||
            (item.id_pago ? `PAGO-${item.id_pago}` : ""),
          estado: isPaid ? "PAGADO" : "PENDIENTE",
          fecha_pago: isPaid ? item.fecha_pago : localToday(),
          socios_label: item.denominacion || `ID ${item.id_socio}`,
          modalidad_label: isPaid ? "Pago de cuotas" : "Cuota pendiente",
          medio_pago: isPaid ? item.medio_pago || "—" : "PENDIENTE",
          monto_base: Number(item.monto_base || amount),
          monto: amount,
        },
        lineas: [
          {
            id: item.id_pago || selectionKey(item),
            socio: item.denominacion || `ID ${item.id_socio}`,
            categoria: item.categoria || "SIN CATEGORÍA",
            periodo: item.periodo,
            monto_base: Number(item.monto_base || amount),
            porcentaje_descuento_familiar: Number(
              item.porcentaje_descuento_familiar || 0,
            ),
            monto: amount,
          },
        ],
      },
      { openPrintDialog: true },
    );
  };

  const applyMonthSelection = (months, activeMonth, defaultFamily = true) => {
    const normalizedMonths = months
      .map(String)
      .filter((monthId) => {
        const period = paymentPeriods[monthId];
        return period && !period.paid && !period.unavailable;
      })
      .sort((left, right) => Number(left) - Number(right));
    const resolvedActiveMonth = normalizedMonths.includes(String(activeMonth))
      ? String(activeMonth)
      : normalizedMonths[0] || "";
    const activeContext = paymentPeriods[resolvedActiveMonth]?.context || null;
    const hasFamilyToPay = Boolean(
      normalizedMonths.length === 1 &&
      activeContext?.familia &&
      Number(activeContext.familia.cantidad_pendientes || 0) > 1,
    );

    setPaymentContext(activeContext);
    setFamilyExpanded(false);
    setPaymentForm((current) => ({
      ...current,
      mes: resolvedActiveMonth || current.mes,
      meses: normalizedMonths,
      monto: String(activeContext?.principal?.monto_sugerido || ""),
      aplicar_familia: defaultFamily
        ? hasFamilyToPay
        : current.aplicar_familia && hasFamilyToPay,
    }));
  };

  const togglePaymentMonth = (monthId) => {
    const normalizedMonth = String(monthId);
    const period = paymentPeriods[normalizedMonth];
    if (!period || period.paid || period.unavailable) return;

    const selected = selectedMonthIds.includes(normalizedMonth);
    const nextMonths = selected
      ? selectedMonthIds.filter((value) => value !== normalizedMonth)
      : [...selectedMonthIds, normalizedMonth];
    applyMonthSelection(
      nextMonths,
      selected ? nextMonths[0] : normalizedMonth,
      true,
    );
  };

  const toggleAllPaymentMonths = () => {
    applyMonthSelection(
      allAvailableMonthsSelected ? [] : availableMonthIds,
      allAvailableMonthsSelected ? "" : availableMonthIds[0],
      false,
    );
  };

  const updatePaymentYear = (value) => {
    const next = {
      ...paymentForm,
      anio: String(value),
      meses: [],
      aplicar_familia: false,
    };
    setPaymentForm(next);
    setPaymentContext(null);
    setFamilyExpanded(false);
    loadPaymentPeriods(next.id_socio, next.anio, next.fecha_pago, {
      selectedMonths: [],
    });
  };

  const updatePaymentDate = (value) => {
    const next = { ...paymentForm, fecha_pago: value };
    setPaymentForm(next);
    setFamilyExpanded(false);
    loadPaymentPeriods(next.id_socio, next.anio, next.fecha_pago, {
      selectedMonths: next.meses,
      activeMonth: next.mes,
      defaultFamily: next.meses.length === 1,
    });
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
      if (!selectedMonthIds.length) {
        setFeedback({
          type: "error",
          message: "Seleccioná al menos un mes para registrar el pago.",
        });
        return;
      }
      if (
        selectedMonthIds.length === 1 &&
        !paymentForm.aplicar_familia &&
        !(Number(paymentForm.monto) > 0)
      ) {
        setFeedback({
          type: "error",
          message: "El monto debe ser mayor a cero.",
        });
        return;
      }
      if (selectedMonthIds.length > 1 && !(paymentTotal > 0)) {
        setFeedback({
          type: "error",
          message: "Los meses seleccionados no tienen un monto válido.",
        });
        return;
      }
    } else if (
      !paymentForm.pagos.length ||
      paymentForm.pagos.some((payment) => !(Number(payment.monto) > 0))
    ) {
      setFeedback({
        type: "error",
        message:
          "Todos los pagos seleccionados deben tener un monto mayor a cero.",
      });
      return;
    }

    setSaving(true);
    try {
      const response =
        paymentMode === "multiple" || selectedMonthIds.length > 1
          ? await cuotasApi.registrarPagos({
              fecha_pago: paymentForm.fecha_pago,
              id_medio_pago: Number(paymentForm.id_medio_pago),
              pagos:
                paymentMode === "multiple"
                  ? paymentForm.pagos.map((payment) => ({
                      id_socio: Number(payment.id_socio),
                      anio: Number(payment.anio),
                      mes: Number(payment.mes),
                      monto: Number(payment.monto),
                    }))
                  : selectedMonthIds.map((monthId) => {
                      const periodPrincipal =
                        paymentPeriods[monthId]?.context?.principal;
                      return {
                        id_socio: Number(paymentForm.id_socio),
                        anio: Number(paymentForm.anio),
                        mes: Number(monthId),
                        monto: Number(
                          periodPrincipal?.monto_sugerido ||
                            periodPrincipal?.monto_base ||
                            selectedPartner?.monto_sugerido ||
                            0,
                        ),
                      };
                    }),
            })
          : await cuotasApi.registrarPago({
              id_socio: Number(paymentForm.id_socio),
              anio: Number(paymentForm.anio),
              mes: Number(selectedMonthIds[0]),
              fecha_pago: paymentForm.fecha_pago,
              monto: Number(paymentForm.monto),
              id_medio_pago: Number(paymentForm.id_medio_pago),
              aplicar_familia: Boolean(paymentForm.aplicar_familia),
            });

      setPaymentOpen(false);
      setReceipt(response.comprobante || null);
      setAnio(String(paymentForm.anio || anio));
      setMes(String(selectedMonthIds[0] || paymentForm.mes || mes));
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

  const selectRow = (event, item) => {
    if (!multiMode || isPaid || !writable) return;
    if (!(event.target instanceof Element)) return;

    const interactiveElement = event.target.closest(
      'button, input, select, textarea, a, label, [role="button"]',
    );
    if (interactiveElement) return;

    toggleSelection(item);
  };

  const selectRowWithKeyboard = (event, item) => {
    if (!multiMode || isPaid || !writable) return;
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    toggleSelection(item);
  };

  const setTypeFilter = (value) => {
    setTipo(value);
    setBuscar("");
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
      placeholder: "",
      value: buscar,
      onChange: setBuscar,
      className: "cuotas-search-filter",
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
      ? ["Selec.", ...baseDebtColumns.slice(0, -1)]
      : baseDebtColumns;

  const debtGridClass = multiMode
    ? "cuotas-grid cuotas-grid--debt cuotas-grid--selecting"
    : "cuotas-grid cuotas-grid--debt";
  const debtRowClass = multiMode
    ? "cuotas-grid--debt cuotas-grid--selecting"
    : "cuotas-grid--debt";
  const toggleMultipleMode = () => {
    if (multiMode) clearMultipleSelection();
    else setMultiMode(true);
  };

  return (
    <>
      <ModulePage
        className="cuotas-page"
        title="Cuotas"
        description="Control mensual de cuotas de socios y empresas."
        filters={pageFilters}
        tabsInTitle
        headLeftClassName="cuotas-header-row"
        headFiltersContainerClassName="cuotas-head-filters"
        secondaryActions={
          !isPaid && writable
            ? [
                {
                  key: "multiple-selection",
                  label: multiMode
                    ? "Cancelar selección"
                    : "Selección múltiple",
                  icon: faUserGroup,
                  onClick: toggleMultipleMode,
                  className: multiMode ? "mov-btn--danger" : "mov-btn--ghost",
                },
              ]
            : []
        }
        canCreate={false}
        refreshing={loading}
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
          <Toast
            tipo="info"
            persistente
            cerrarConEscape={false}
            cerrarConInteraccion={false}
            cierreDeshabilitado={saving}
            onClose={cancelMultipleSelection}
            className="cuotas-selection-toast"
            ariaLabelCerrar="Cancelar selección múltiple"
            mensaje={
              <div className="cuotas-selection-toast__copy">
                <strong>
                  {selectedCount} cuota{selectedCount === 1 ? "" : "s"}{" "}
                  seleccionada{selectedCount === 1 ? "" : "s"}
                </strong>
                <span>
                  Hacé clic en cualquier parte de una fila para seleccionarla.
                </span>
              </div>
            }
            acciones={
              <>
                <button
                  type="button"
                  className="mov-btn mov-btn--ghost"
                  onClick={() => setSelectedPayments({})}
                  disabled={!selectedCount || saving}
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  className="mov-btn mov-btn--primary"
                  onClick={openMultiplePayment}
                  disabled={!selectedCount || saving}
                >
                  Continuar ({selectedCount})
                </button>
              </>
            }
          />
        ) : null}

        <GlobalDivTable
          className={`cuotas-table ${totalRegistros ? "has-bottom-pagination" : ""}`.trim()}
          bodyClassName="entity-table-wrap"
          gridClassName={
            isPaid ? "cuotas-grid cuotas-grid--paid" : debtGridClass
          }
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

          {itemsPagina.map((item) => {
            const selected = Boolean(selectedPayments[selectionKey(item)]);
            return (
              <div
                className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-grid ${isPaid ? "cuotas-grid--paid" : debtRowClass} ${selected ? "is-selected" : ""}`}
                role="row"
                key={
                  item.id_pago || `${item.id_socio}-${item.anio}-${item.mes}`
                }
                onClick={(event) => selectRow(event, item)}
                onKeyDown={(event) => selectRowWithKeyboard(event, item)}
                tabIndex={!isPaid && multiMode && writable ? 0 : undefined}
                aria-selected={!isPaid && multiMode ? selected : undefined}
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
                <div className="mov-gridCell is-strong is-center">
                  {item.documento || "—"}
                </div>
                <div className="mov-gridCell is-center">
                  <span
                    className={`cuotas-category-chip ${item.categoria ? "" : "is-empty"}`}
                  >
                    {item.categoria || "SIN CATEGORÍA"}
                  </span>
                </div>
                <div className="mov-gridCell is-strong is-center">
                  {item.periodo}
                </div>
                {isPaid ? (
                  <>
                    <div className="mov-gridCell">
                      {formatDate(item.fecha_pago)}
                    </div>
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
                {!multiMode ? (
                  <div className="mov-gridCell mov-gridCell--actions">
                    <div className="mov-actionsInline">
                      <button
                        type="button"
                        className="mov-iconBtn"
                        title="Imprimir comprobante"
                        aria-label={`Imprimir comprobante de ${item.denominacion}`}
                        onClick={() => printPaymentRow(item)}
                      >
                        <FontAwesomeIcon icon={faPrint} />
                      </button>
                      {isPaid ? (
                        <button
                          type="button"
                          className="mov-iconBtn mov-iconBtn--danger"
                          title="Eliminar pago"
                          aria-label={`Eliminar pago de ${item.denominacion}`}
                          onClick={() => setDeleteRow(item)}
                          disabled={!writable}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mov-iconBtn"
                          title="Registrar pago"
                          aria-label={`Registrar pago de ${item.denominacion}`}
                          onClick={() => openPayment(item)}
                          disabled={!writable}
                        >
                          <FontAwesomeIcon icon={faDollarSign} />
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </GlobalDivTable>

        <div className="cuotas-table-footer">
          <SummaryCards
            title="Resumen del período"
            ariaLabel="Resumen de cuotas del período"
            variant="footer"
            items={[
              {
                key: "estado",
                label: isPaid ? "Pagados" : "Deudores",
                value: Number(resumen.total || 0),
                detail: `${mes}/${anio} · ${tipo === "EMPRESA" ? "empresas" : "socios"}`,
              },
            ]}
          />

          {totalRegistros ? (
            <nav
              className="cuotas-pagination"
              aria-label="Paginación de cuotas"
            >
              <p className="cuotas-pagination__summary">
                Mostrando <strong>{registroDesde}</strong>–
                <strong>{registroHasta}</strong> de{" "}
                <strong>{totalRegistros}</strong> registros
                {loading ? <span>Cargando página...</span> : null}
              </p>

              <div className="cuotas-pagination__controls">
                <button
                  type="button"
                  onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
                  disabled={loading || pagina <= 1}
                >
                  Anterior
                </button>

                {opcionesPagina.map((item) =>
                  typeof item === "number" ? (
                    <button
                      type="button"
                      key={item}
                      className={item === pagina ? "is-active" : ""}
                      aria-current={item === pagina ? "page" : undefined}
                      onClick={() => setPagina(item)}
                      disabled={loading}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      className="cuotas-pagination__ellipsis"
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
                    setPagina((actual) => Math.min(totalPaginas, actual + 1))
                  }
                  disabled={loading || pagina >= totalPaginas}
                >
                  Siguiente
                </button>
              </div>
            </nav>
          ) : null}

          {writable && !isPaid ? (
            <div
              className="cuotas-lower-actions"
              aria-label="Acciones de cuotas"
            >
              <button
                type="button"
                className={`mov-btn cuotas-lower-action ${multiMode ? "mov-btn--danger" : "mov-btn--ghost"}`}
                onClick={toggleMultipleMode}
              >
                <FontAwesomeIcon icon={faUserGroup} />
                {multiMode ? "Cancelar selección" : "Selección múltiple"}
              </button>
            </div>
          ) : null}
        </div>
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
        onClose={closePayment}
        onSubmit={submitPayment}
        saving={saving}
        submitLabel={
          paymentMode === "multiple"
            ? `Registrar ${paymentForm.pagos.length} pagos`
            : selectedMonthIds.length > 1
              ? `Registrar ${selectedMonthIds.length} cuotas`
              : paymentForm.aplicar_familia && family
                ? `Registrar pago familiar (${familyPendingMembers.length})`
                : "Registrar pago"
        }
        submitDisabled={
          contextLoading ||
          (paymentMode === "single" && !selectedMonthIds.length) ||
          !(paymentTotal > 0)
        }
        wide
        footerStart={
          <div className="cuotas-payment-footer-total">
            <span>Total a pagar</span>
            <strong>{money(paymentTotal)}</strong>
            <small>
              {paymentMode === "multiple"
                ? `${paymentForm.pagos.length} cuotas seleccionadas`
                : `${selectedMonthIds.length} ${selectedMonthIds.length === 1 ? "mes seleccionado" : "meses seleccionados"}`}
            </small>
          </div>
        }
        modalClassName="cuotas-payment-modal cuotas-modal--payment"
      >
        {paymentMode === "single" ? (
          <>
            <section
              className="cuotas-payment-person"
              aria-label={`Información del ${entityLabel}`}
            >
              <div className="cuotas-payment-person__identity">
                <span>{tipo === "EMPRESA" ? "Empresa" : "Socio"}</span>
                <strong title={selectedPartner?.denominacion || ""}>
                  {selectedPartner?.denominacion || "Sin socio seleccionado"}
                </strong>
                <small>
                  {selectedPartner?.documento
                    ? `DNI/CUIT ${selectedPartner.documento}`
                    : "Documento no informado"}
                </small>
              </div>

              <div className="cuotas-payment-person__details">
                <div>
                  <span>Categoría</span>
                  <strong>
                    {principal?.categoria ||
                      selectedPartner?.categoria ||
                      "SIN CATEGORÍA"}
                  </strong>
                </div>
                <div>
                  <span>Cuota sugerida</span>
                  <strong>
                    {money(
                      principal?.monto_sugerido ||
                        selectedPartner?.monto_sugerido ||
                        0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Selección</span>
                  <strong>
                    {selectedMonthIds.length || "Ningún mes"}
                    {selectedMonthIds.length
                      ? ` ${selectedMonthIds.length === 1 ? "mes" : "meses"}`
                      : ""}
                  </strong>
                </div>
              </div>
            </section>

            <section
              className="cuotas-period-group cuotas-period-selector"
              aria-label="Meses a pagar"
            >
              <header>
                <div>
                  <span>Meses disponibles</span>
                  <small>
                    Elegí uno o varios períodos para incluirlos en el cobro.
                  </small>
                </div>
                <div className="cuotas-period-selector__actions">
                  <PaymentYearChip
                    value={paymentForm.anio}
                    options={paymentYearOptions}
                    onChange={updatePaymentYear}
                    disabled={contextLoading || !paymentForm.id_socio}
                  />
                  <button
                    type="button"
                    className="cuotas-select-all"
                    onClick={toggleAllPaymentMonths}
                    disabled={contextLoading || !availableMonthIds.length}
                  >
                    {allAvailableMonthsSelected
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </button>
                </div>
              </header>

              <div
                className={`cuotas-month-grid ${contextLoading ? "is-loading" : ""}`}
                aria-busy={contextLoading}
              >
                {monthOptions.map((item) => {
                  const monthId = String(item.id_mes);
                  const period = paymentPeriods[monthId];
                  const selected = selectedMonthIds.includes(monthId);
                  const paid = Boolean(period?.paid);
                  const unavailable = Boolean(period?.unavailable);
                  const disabled = contextLoading || paid || unavailable;
                  const principalForMonth = period?.context?.principal;

                  return (
                    <button
                      type="button"
                      key={`${paymentForm.anio}-${monthId}`}
                      className={`${selected ? "is-selected" : ""} ${disabled && !contextLoading ? "is-disabled" : ""}`.trim()}
                      onClick={() => togglePaymentMonth(monthId)}
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${item.nombre} ${paymentForm.anio}: ${paid ? "pagado" : unavailable ? "no disponible" : selected ? "seleccionado" : "disponible"}`}
                    >
                      <strong>{item.nombre}</strong>
                      <span>
                        {contextLoading
                          ? "Consultando…"
                          : paid
                            ? "Pagado"
                            : unavailable
                              ? "No disponible"
                              : selected
                                ? "Seleccionado"
                                : money(
                                    principalForMonth?.monto_sugerido ||
                                      principalForMonth?.monto_base ||
                                      selectedPartner?.monto_sugerido ||
                                      0,
                                  )}
                      </span>
                      <small>{paymentForm.anio}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="entity-form__grid cuotas-payment-grid cuotas-payment-data--compact">
              <FloatingField
                label="Fecha de pago *"
                active={Boolean(paymentForm.fecha_pago)}
              >
                <input
                  type="date"
                  value={paymentForm.fecha_pago}
                  onChange={(event) => updatePaymentDate(event.target.value)}
                  aria-label="Fecha de pago *"
                />
              </FloatingField>

              {selectedMonthIds.length <= 1 &&
              !(paymentForm.aplicar_familia && family) ? (
                <FloatingField
                  label="Monto *"
                  active={Boolean(paymentForm.monto)}
                >
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentForm.monto}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        monto: event.target.value,
                      }))
                    }
                    aria-label="Monto *"
                    placeholder="0,00"
                  />
                </FloatingField>
              ) : null}

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
              <div className="cuotas-context-loading">
                Consultando estado de los meses, grupo familiar y descuento…
              </div>
            ) : family ? (
              <section
                className="cuotas-family-card"
                aria-label="Grupo familiar del socio"
              >
                <div className="cuotas-family-card__head">
                  <div>
                    <span>Grupo familiar detectado</span>
                    <strong>{family.nombre}</strong>
                    <small>
                      {family.cantidad_integrantes} integrantes · Descuento
                      vigente:{" "}
                      {Number(family.porcentaje_descuento || 0).toFixed(2)}%
                    </small>
                  </div>
                  <button
                    type="button"
                    className="mov-btn mov-btn--ghost"
                    onClick={() => setFamilyExpanded((current) => !current)}
                  >
                    {familyExpanded
                      ? "Ocultar integrantes"
                      : "Ver quiénes forman parte"}
                  </button>
                </div>

                <label className="cuotas-family-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(paymentForm.aplicar_familia)}
                    disabled={
                      familyPendingMembers.length < 2 ||
                      selectedMonthIds.length !== 1
                    }
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
                      {selectedMonthIds.length > 1
                        ? "Para cobrar varios meses, las cuotas se registran únicamente para el socio seleccionado."
                        : `Está seleccionado por defecto. Al desmarcarlo, se registra únicamente la cuota de ${
                            principal?.denominacion ||
                            selectedPartner?.denominacion ||
                            "este socio"
                          }.`}
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
                            {member.documento || "SIN DNI"} ·{" "}
                            {member.categoria || "SIN CATEGORÍA"}
                          </span>
                        </div>
                        <div>
                          {member.puede_pagar ? (
                            <>
                              <strong>{money(member.monto_sugerido)}</strong>
                              <small>Base {money(member.monto_base)}</small>
                            </>
                          ) : (
                            <strong>
                              {member.pagado ? "YA PAGADO" : "NO DISPONIBLE"}
                            </strong>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : tipo === "PERSONA" &&
              paymentForm.id_socio &&
              selectedMonthIds.length === 1 ? (
              <div className="cuotas-no-family">
                <FontAwesomeIcon icon={faUserGroup} />
                <span>
                  Este socio no pertenece a un grupo familiar activo. El pago se
                  registrará únicamente para su cuota.
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="entity-form__grid cuotas-payment-grid cuotas-payment-grid--multiple">
              <FloatingField
                label="Fecha de pago *"
                active={Boolean(paymentForm.fecha_pago)}
              >
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

            <section
              className="cuotas-batch-list"
              aria-label="Pagos seleccionados"
            >
              <header>
                <div>
                  <span>Selección múltiple</span>
                  <strong>
                    {paymentForm.pagos.length} cuotas listas para registrar
                  </strong>
                </div>
                <strong>{money(paymentTotal)}</strong>
              </header>
              <div>
                {paymentForm.pagos.map((payment, index) => (
                  <article
                    key={`${payment.id_socio}-${payment.anio}-${payment.mes}`}
                  >
                    <div>
                      <strong>{payment.denominacion}</strong>
                      <span>
                        {payment.documento || "—"} ·{" "}
                        {payment.categoria || "SIN CATEGORÍA"} · {payment.mes}/
                        {payment.anio}
                      </span>
                      {payment.familia ? (
                        <small>
                          {payment.familia} ·{" "}
                          {Number(
                            payment.porcentaje_descuento_familiar || 0,
                          ).toFixed(2)}
                          % de descuento
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
                        onChange={(event) =>
                          updateBatchAmount(index, event.target.value)
                        }
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
          {
            label: tipo === "EMPRESA" ? "Empresa" : "Socio",
            value: deleteRow?.denominacion,
          },
          { label: "Período", value: deleteRow?.periodo },
          { label: "Importe", value: money(deleteRow?.monto) },
          { label: "Medio", value: deleteRow?.medio_pago || "—" },
        ]}
      />
    </>
  );
}
