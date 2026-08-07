import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
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
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModalExportarGlobal from "../Global/Modales/ModalExportarGlobal";
import ModalComprobantePago from "../Global/Modales/ModalComprobantePago";
import ModuleFeedback from "../Global/ModuleFeedback";
import BotonExportarGlobal from "../Global/Botones/BotonExportarGlobal";
import Toast from "../Global/Toast";
import { canWrite } from "../_shared/auth/session";
import {
  downloadPaymentReceiptPdf,
  openPaymentReceipt,
} from "../_shared/utils/comprobantePago";
import { cuotasApi } from "./api/cuotasApi";
import { useCuotas } from "./hooks/useCuotas";
import ModalPagoCuota from "./modales/ModalPagoCuota";
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
const PAGE_SIZE = 100;

const CUOTAS_EXPORT_COLUMNS = [
  { key: "denominacion", label: "Socio / Empresa" },
  { key: "documento", label: "DNI / CUIT" },
  { key: "categoria", label: "Categoría" },
  { key: "periodo", label: "Período" },
  { key: "fecha_pago", label: "Fecha de pago" },
  { key: "medio_pago", label: "Medio de pago" },
  {
    key: "importe_exportacion",
    label: "Importe",
    align: "right",
  },
];

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

const enrichPaymentReceipt = (source, context = {}) => {
  if (!source || typeof source !== "object") return source || null;

  const operation =
    source.operacion && typeof source.operacion === "object"
      ? source.operacion
      : source;
  const sourceLines = Array.isArray(source.lineas)
    ? source.lineas
    : Array.isArray(operation.lineas)
      ? operation.lineas
      : [];
  const fallbackLines = Array.isArray(context.lineas) ? context.lineas : [];
  const lineas = (sourceLines.length ? sourceLines : fallbackLines).map(
    (line, index) => ({
      ...(fallbackLines[index] || {}),
      ...line,
      domicilio:
        line.domicilio ||
        line.domicilio_2 ||
        fallbackLines[index]?.domicilio ||
        context.domicilio ||
        "",
      cobrador:
        line.cobrador ||
        fallbackLines[index]?.cobrador ||
        context.cobrador ||
        "",
      medio_pago:
        line.medio_pago ||
        fallbackLines[index]?.medio_pago ||
        context.medio ||
        "",
    }),
  );

  return {
    ...source,
    organizacion:
      source.organizacion || operation.organizacion || "LALCEC San Francisco",
    operacion: {
      ...operation,
      socios_label: operation.socios_label || context.socios || "—",
      domicilio:
        operation.domicilio ||
        operation.domicilio_2 ||
        context.domicilio ||
        "",
      cobrador: operation.cobrador || context.cobrador || "",
      medio_pago: operation.medio_pago || context.medio || "—",
      tipo_entidad: operation.tipo_entidad || context.tipoEntidad || "",
      lineas,
    },
    lineas,
  };
};

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
  const [exportModalOpen, setExportModalOpen] = useState(false);

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
  const isPaid = estado === "PAGADOS";
  const exportRecords = useCallback(
    (records) =>
      (records || []).map((item) => ({
        ...item,
        fecha_pago: isPaid ? formatDate(item.fecha_pago) : "—",
        medio_pago: isPaid ? item.medio_pago || "—" : "PENDIENTE",
        importe_exportacion: money(
          isPaid
            ? item.monto || 0
            : item.monto_sugerido || item.monto_base || 0,
        ),
      })),
    [isPaid],
  );

  const obtenerTodosParaExportar = useCallback(async () => {
    const primeraRespuesta = await cuotasApi.listar({
      ...filtros,
      pagina: 1,
      por_pagina: PAGE_SIZE,
    });
    const registros = [...(primeraRespuesta.items || [])];
    const total = Number(
      primeraRespuesta.paginacion?.total || registros.length,
    );
    const paginas = Number(
      primeraRespuesta.paginacion?.total_paginas ||
        Math.max(1, Math.ceil(total / PAGE_SIZE)),
    );

    for (let paginaActual = 2; paginaActual <= paginas; paginaActual += 1) {
      const respuesta = await cuotasApi.listar({
        ...filtros,
        pagina: paginaActual,
        por_pagina: PAGE_SIZE,
      });
      registros.push(...(respuesta.items || []));
    }

    return exportRecords(registros);
  }, [exportRecords, filtros]);

  const exportFilterDescription = [
    tipo === "EMPRESA" ? "Empresas" : "Socios",
    isPaid ? "Pagados" : "Adeudados",
    `Período: ${mes}/${anio}`,
    buscar ? `Búsqueda: ${buscar}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
  const entityLabel = tipo === "EMPRESA" ? "empresa" : "socio";
  const family = paymentContext?.familia || null;
  const principal = paymentContext?.principal || null;
  const familyPendingMembers = (family?.integrantes || []).filter(
    (member) => member.puede_pagar,
  );
  const activePaymentPeriod = paymentPeriods[String(paymentForm.mes)] || null;
  const paymentPeriodAmount = Number(
    activePaymentPeriod?.context?.principal?.monto_sugerido ||
      activePaymentPeriod?.context?.principal?.monto_base ||
      principal?.monto_sugerido ||
      principal?.monto_base ||
      selectedPartner?.monto_sugerido ||
      0,
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
      id_medio_pago: "",
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
      id_medio_pago: "",
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
      id_medio_pago: "",
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
        domicilio: item.domicilio || item.domicilio_2 || item.direccion || "",
        cobrador: item.cobrador || "",
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
    const receiptPartner =
      partners.find(
        (partner) => String(partner.id_socio) === String(item.id_socio),
      ) || item;
    const domicilio =
      receiptPartner.domicilio_2 ||
      receiptPartner.domicilio ||
      receiptPartner.direccion ||
      "";
    const cobrador = receiptPartner.cobrador || item.cobrador || "";

    openPaymentReceipt(
      enrichPaymentReceipt(
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
        {
          socios: item.denominacion || `ID ${item.id_socio}`,
          domicilio,
          cobrador,
          medio: isPaid ? item.medio_pago || "—" : "PENDIENTE",
          tipoEntidad: tipo,
        },
      ),
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

      const selectedMedium = (catalogos.medios_pago || []).find(
        (item) =>
          String(item.id_medio_pago) === String(paymentForm.id_medio_pago),
      );
      const fallbackLines =
        paymentMode === "multiple"
          ? paymentForm.pagos.map((payment) => ({
              socio: payment.denominacion || `ID ${payment.id_socio}`,
              categoria: payment.categoria || "SIN CATEGORÍA",
              periodo: `${
                monthOptions.find(
                  (monthItem) =>
                    String(monthItem.id_mes) === String(payment.mes),
                )?.nombre || payment.mes
              } ${payment.anio}`,
              monto_base: Number(payment.monto_base || payment.monto || 0),
              porcentaje_descuento_familiar: Number(
                payment.porcentaje_descuento_familiar || 0,
              ),
              monto: Number(payment.monto || 0),
              domicilio: payment.domicilio || "",
              cobrador: payment.cobrador || "",
              medio_pago: selectedMedium?.nombre || "—",
            }))
          : selectedMonthIds.map((monthId) => {
              const periodPrincipal =
                paymentPeriods[monthId]?.context?.principal || principal || {};
              return {
                socio:
                  selectedPartner?.denominacion ||
                  periodPrincipal.denominacion ||
                  `ID ${paymentForm.id_socio}`,
                categoria:
                  periodPrincipal.categoria ||
                  selectedPartner?.categoria ||
                  "SIN CATEGORÍA",
                periodo: `${
                  monthOptions.find(
                    (monthItem) =>
                      String(monthItem.id_mes) === String(monthId),
                  )?.nombre || monthId
                } ${paymentForm.anio}`,
                monto_base: Number(
                  periodPrincipal.monto_base ||
                    selectedPartner?.monto_base ||
                    periodPrincipal.monto_sugerido ||
                    paymentForm.monto ||
                    0,
                ),
                porcentaje_descuento_familiar: Number(
                  periodPrincipal.porcentaje_descuento_familiar ||
                    selectedPartner?.porcentaje_descuento_familiar ||
                    0,
                ),
                monto: Number(
                  periodPrincipal.monto_sugerido ||
                    periodPrincipal.monto_base ||
                    paymentForm.monto ||
                    0,
                ),
                domicilio:
                  selectedPartner?.domicilio_2 ||
                  selectedPartner?.domicilio ||
                  selectedPartner?.direccion ||
                  "",
                cobrador:
                  periodPrincipal.cobrador || selectedPartner?.cobrador || "",
                medio_pago: selectedMedium?.nombre || "—",
              };
            });
      const receiptPeople =
        paymentMode === "multiple"
          ? paymentForm.pagos
              .map((payment) => payment.denominacion)
              .filter(Boolean)
              .join(" · ")
          : selectedPartner?.denominacion || "";

      setPaymentOpen(false);
      setReceipt(
        enrichPaymentReceipt(response.comprobante || null, {
          socios: receiptPeople,
          domicilio:
            selectedPartner?.domicilio_2 ||
            selectedPartner?.domicilio ||
            selectedPartner?.direccion ||
            "",
          cobrador: principal?.cobrador || selectedPartner?.cobrador || "",
          medio: selectedMedium?.nombre || "—",
          tipoEntidad: tipo,
          lineas: fallbackLines,
        }),
      );
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
    "Categoría",
    "Período",
    "Importe sugerido",
    "Acciones",
  ];
  const columns = isPaid
    ? [
        tipo === "EMPRESA" ? "Empresa" : "Socio",
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
        headerActions={
          <BotonExportarGlobal
            label="Exportar"
            onClick={() => setExportModalOpen(true)}
            disabled={loading || itemsPagina.length === 0}
            title="Exportar cuotas en Excel o PDF"
          />
        }
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
                  <strong>{item.denominacion || "SIN DENOMINACIÓN"}</strong>
                  <small>
                    {tipo === "EMPRESA"
                      ? item.documento
                        ? `CUIT ${item.documento}`
                        : null
                      : [
                          item.documento ? `DNI ${item.documento}` : null,
                          item.familia || null,
                          item.estado_socio === "INACTIVO"
                            ? "REGISTRO DADO DE BAJA"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </small>
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
            title=""
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

          <div
            className="cuotas-lower-actions"
            aria-label="Acciones de cuotas"
          >
            <BotonExportarGlobal
              label="Exportar"
              className="cuotas-lower-action mov-btn--compact"
              onClick={() => setExportModalOpen(true)}
              disabled={loading || itemsPagina.length === 0}
              title="Exportar cuotas en Excel o PDF"
            />

            {writable && !isPaid ? (
              <button
                type="button"
                className={`mov-btn cuotas-lower-action ${multiMode ? "mov-btn--danger" : "mov-btn--ghost"}`}
                onClick={toggleMultipleMode}
              >
                <FontAwesomeIcon icon={faUserGroup} />
                {multiMode ? "Cancelar selección" : "Selección múltiple"}
              </button>
            ) : null}
          </div>
        </div>
      </ModulePage>

      <ModalExportarGlobal
        open={exportModalOpen}
        title="Exportar cuotas"
        subtitle="Elegí el alcance y descargá la información en Excel o PDF."
        tituloArchivo="Cuotas"
        subtituloArchivoActual={`${exportFilterDescription} · Página ${pagina} de ${Math.max(1, totalPaginas)}`}
        subtituloArchivoTodos={exportFilterDescription}
        nombreArchivo={`cuotas-${isPaid ? "pagadas" : "adeudadas"}`}
        columnas={CUOTAS_EXPORT_COLUMNS}
        registrosActuales={exportRecords(itemsPagina)}
        obtenerRegistrosTodos={obtenerTodosParaExportar}
        cantidadActual={itemsPagina.length}
        cantidadTodos={totalRegistros}
        mostrarAlcanceTodos={totalRegistros > itemsPagina.length}
        alcanceActualLabel={totalPaginas > 1 ? "Exportar esta página" : "Exportar registros visibles"}
        alcanceActualDescription="Descarga las cuotas visibles con los filtros actuales."
        alcanceTodosLabel="Exportar todas las cuotas filtradas"
        alcanceTodosDescription="Descarga todas las páginas que coinciden con los filtros actuales."
        totalLabelSingular="cuota disponible"
        totalLabelPlural="cuotas disponibles"
        onClose={() => setExportModalOpen(false)}
        onSuccess={(message) =>
          setFeedback({ type: "success", message, duration: 4200 })
        }
        onError={(message) =>
          setFeedback({ type: "error", message, duration: 5200 })
        }
      />

      <ModalPagoCuota
        paymentOpen={paymentOpen}
        paymentMode={paymentMode}
        tipo={tipo}
        paymentForm={paymentForm}
        entityLabel={entityLabel}
        closePayment={closePayment}
        submitPayment={submitPayment}
        saving={saving}
        selectedMonthIds={selectedMonthIds}
        family={family}
        familyPendingMembers={familyPendingMembers}
        contextLoading={contextLoading}
        paymentTotal={paymentTotal}
        money={money}
        selectedPartner={selectedPartner}
        principal={principal}
        familyExpanded={familyExpanded}
        setFamilyExpanded={setFamilyExpanded}
        setPaymentForm={setPaymentForm}
        updatePaymentDate={updatePaymentDate}
        paymentYearOptions={paymentYearOptions}
        updatePaymentYear={updatePaymentYear}
        paymentPeriodAmount={paymentPeriodAmount}
        availableMonthIds={availableMonthIds}
        allAvailableMonthsSelected={allAvailableMonthsSelected}
        toggleAllPaymentMonths={toggleAllPaymentMonths}
        monthOptions={monthOptions}
        paymentPeriods={paymentPeriods}
        togglePaymentMonth={togglePaymentMonth}
        catalogos={catalogos}
        updateBatchAmount={updateBatchAmount}
      />

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
