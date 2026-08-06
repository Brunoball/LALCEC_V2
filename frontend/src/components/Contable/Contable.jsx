import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartPie,
  faCircleInfo,
  faEye,
  faFileInvoiceDollar,
  faMoneyBillTransfer,
  faPaperclip,
  faPen,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import {
  ModulePage,
  useCompactModuleActions,
} from "../Global/ModulePage";
import GlobalDivTable from "../Global/GlobalDivTable";
import CrudModal from "../Global/Modales/CrudModal";
import ModalEliminarGlobal from "../Global/Modales/ModalEliminarGlobal";
import ModalExportarGlobal from "../Global/Modales/ModalExportarGlobal";
import BotonExportarGlobal from "../Global/Botones/BotonExportarGlobal";
import ModuleFeedback from "../Global/ModuleFeedback";
import SummaryCards from "../Global/SummaryCards";
import {
  EntityFormPanel,
  EntityTabs,
  FloatingField,
} from "../Global/Formularios/TabbedForm";
import { canWrite } from "../_shared/auth/session";
import { contableApi } from "./api/contableApi";
import "./Contable.css";

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
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

const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

const upper = (value) => String(value ?? "").toLocaleUpperCase("es-AR");

const emptyCatalogs = {
  opciones: {
    PROVEEDOR: [],
    CATEGORIA_INGRESO: [],
    CONCEPTO_INGRESO: [],
    CATEGORIA_EGRESO: [],
    CONCEPTO_EGRESO: [],
  },
  medios_pago: [],
  categorias_socios: [],
  anios: [CURRENT_YEAR],
};

const emptyIncomeForm = () => ({
  id_ingreso: "",
  fecha: localDate(),
  id_medio_pago: "",
  id_proveedor: "",
  id_categoria: "",
  id_concepto: "",
  importe: "",
  detalle: "",
});

const emptyExpenseForm = () => ({
  id_egreso: "",
  fecha: localDate(),
  id_medio_pago: "",
  id_proveedor: "",
  id_categoria: "",
  id_concepto: "",
  numero_comprobante: "",
  importe: "",
  detalle: "",
  archivo: null,
  archivo_nombre: "",
  eliminar_archivo: false,
});

function OptionSelect({
  label,
  value,
  options,
  optionType,
  onChange,
  onRequestCreate,
  required = true,
}) {
  return (
    <FloatingField label={label} active>
      <select
        value={value}
        required={required}
        onChange={(event) => {
          if (event.target.value === "__ADD__") {
            onRequestCreate(optionType, label, onChange);
            return;
          }
          onChange(event.target.value);
        }}
      >
        <option value="">SELECCIONE...</option>
        <option value="__ADD__">＋ AGREGAR NUEVA OPCIÓN</option>
        {(options || []).map((option) => (
          <option key={option.id_opcion} value={option.id_opcion}>
            {option.nombre}
          </option>
        ))}
      </select>
    </FloatingField>
  );
}

function EmptyState({ message = "No hay registros para mostrar." }) {
  return (
    <div className="module-empty">
      <FontAwesomeIcon icon={faMoneyBillTransfer} />
      <strong>Sin movimientos para mostrar</strong>
      <span>{message}</span>
    </div>
  );
}

function SummaryView({ summary, loading, mode }) {
  const totals = summary?.totales || {};
  const selectedMonth = (summary?.meses || []).find(
    (item) => Number(item.mes) === Number(summary?.mes_seleccionado),
  );
  const visibleTotals = mode === "monthly" ? selectedMonth || {} : totals;
  const income = Number(visibleTotals.ingresos || 0);
  const expenses = Number(visibleTotals.egresos || 0);
  const result = Number(visibleTotals.resultado || income - expenses);
  const partnerIncome = Number(visibleTotals.ingresos_socios || 0);
  const otherIncome = Number(visibleTotals.otros_ingresos || 0);
  const sum = income + expenses;
  const incomeDegrees = sum > 0 ? (income / sum) * 360 : 0;
  const detail = summary?.detalle_mes || {};

  return (
    <section className={`ct-summary ct-summary--${mode}`}>
      {loading ? (
        <div className="module-empty">
          <FontAwesomeIcon icon={faMoneyBillTransfer} />
          <strong>Cargando información contable...</strong>
          <span>Consultando los movimientos del período seleccionado.</span>
        </div>
      ) : null}

      {!loading && mode === "annual" ? (
        <div className="ct-summary__annual">
          <article className="ct-panel ct-chart-panel">
            <header>
              <FontAwesomeIcon icon={faChartPie} /> Visualización anual
            </header>
            <div className="ct-donut-wrap">
              <div
                className="ct-donut"
                style={{
                  background: `conic-gradient(var(--balto-action) 0deg ${incomeDegrees}deg, var(--balto-midnight) ${incomeDegrees}deg 360deg)`,
                }}
              >
                <div>
                  <strong>{money(income - expenses)}</strong>
                  <span>Resultado</span>
                </div>
              </div>
              <div className="ct-legend">
                <span>
                  <i className="income" /> Ingresos <b>{money(income)}</b>
                </span>
                <span>
                  <i className="expense" /> Egresos <b>{money(expenses)}</b>
                </span>
              </div>
            </div>
          </article>

          <article className="ct-panel ct-month-table-panel">
            <header>
              <FontAwesomeIcon icon={faFileInvoiceDollar} /> Resumen anual
            </header>
            <div
              className="ct-annual-table"
              role="table"
              aria-label="Resumen anual por mes"
            >
              <div
                className="mov-gridTable mov-gridTable--head ct-annual-table__head ct-annual-grid"
                role="row"
              >
                {["Mes", "Ingresos", "Egresos", "Resultado"].map((column) => (
                  <div
                    className="mov-gridCell--head"
                    role="columnheader"
                    key={column}
                  >
                    {column}
                  </div>
                ))}
              </div>
              <div className="ct-annual-table__body" role="rowgroup">
                {(summary?.meses || []).map((item) => (
                  <div
                    className="mov-gridTable mov-gridTable--row ct-annual-grid"
                    role="row"
                    key={item.mes}
                  >
                    <div className="mov-gridCell is-strong" role="cell">
                      {item.nombre}
                    </div>
                    <div className="mov-gridCell is-right" role="cell">
                      {money(item.ingresos)}
                    </div>
                    <div className="mov-gridCell is-right" role="cell">
                      {money(item.egresos)}
                    </div>
                    <div
                      className={`mov-gridCell is-right ${Number(item.resultado) >= 0 ? "ct-positive" : "ct-negative"}`}
                      role="cell"
                    >
                      {money(item.resultado)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {!loading && mode === "monthly" ? (
        <div className="ct-summary__monthly">
          <div className="ct-breakdowns">
            <Breakdown
              title="Categorías de ingresos"
              items={detail.categorias_ingresos}
            />
            <Breakdown
              title="Categorías de egresos"
              items={detail.categorias_egresos}
            />
            <Breakdown title="Medios de cobro" items={detail.medios} />
          </div>
        </div>
      ) : null}

      {!loading ? (
        <SummaryCards
          title="Resumen del período"
          ariaLabel="Totales del período"
          variant="footer"
          className={`ct-summaryCards ${result >= 0 ? "is-positive" : "is-negative"}`}
          items={[
            {
              key: "income",
              label: "Ingresos",
              detail: `Cuotas ${money(partnerIncome)} · Otros ${money(otherIncome)}`,
              value: money(income),
            },
            {
              key: "expenses",
              label: "Egresos",
              detail: "Gastos registrados manualmente",
              value: money(expenses),
            },
            {
              key: "result",
              label: "Resultado",
              detail:
                mode === "monthly"
                  ? selectedMonth?.nombre || "Mes seleccionado"
                  : `Año ${summary?.anio || ""}`,
              value: money(result),
            },
          ]}
        />
      ) : null}
    </section>
  );
}

function Breakdown({ title, items = [] }) {
  return (
    <article className="ct-panel ct-breakdown">
      <header>{title}</header>
      <div>
        {items.length ? (
          items.map((item) => (
            <p key={item.nombre}>
              <span>{item.nombre}</span>
              <b>{money(item.total)}</b>
            </p>
          ))
        ) : (
          <p className="ct-breakdown__empty">Sin movimientos en el mes.</p>
        )}
      </div>
    </article>
  );
}

export default function ContableModule({ view = "summary" }) {
  const compactActions = useCompactModuleActions();
  const writable = canWrite();

  const [catalogs, setCatalogs] = useState(emptyCatalogs);
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(CURRENT_MONTH));
  const [summaryMode, setSummaryMode] = useState("annual");
  const [incomeTab, setIncomeTab] = useState("partners");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [mean, setMean] = useState("");
  const [data, setData] = useState({ items: [], resumen: {} });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm());
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseFormTab, setExpenseFormTab] = useState("movement");
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());
  const [saving, setSaving] = useState(false);
  const [optionModal, setOptionModal] = useState(null);
  const [optionName, setOptionName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const requestId = useRef(0);
  const expenseFileInputRef = useRef(null);

  const loadCatalogs = useCallback(async () => {
    const response = await contableApi.catalogos();
    setCatalogs({
      ...emptyCatalogs,
      ...response,
      opciones: { ...emptyCatalogs.opciones, ...(response.opciones || {}) },
    });
    return response;
  }, []);

  useEffect(() => {
    loadCatalogs().catch((error) =>
      setFeedback({ type: "error", message: error.message }),
    );
  }, [loadCatalogs]);

  useEffect(() => {
    setCategory("");
    setMean("");
    setSearch("");
    // Evita mostrar datos de la pestaña anterior mientras se carga la nueva.
    // También garantiza que las filas de Socios siempre se rendericen con su clave propia.
    setData({ items: [], resumen: {} });
  }, [view, incomeTab]);

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      if (view === "summary") {
        const response = await contableApi.resumen({ anio: year, mes: month });
        if (requestId.current === currentRequest)
          setSummary(response.resumen || null);
      } else {
        const filters = {
          anio: year,
          mes: month,
          buscar: search,
          categoria: category,
          medio: mean,
        };
        let response;
        if (view === "income" && incomeTab === "partners")
          response = await contableApi.ingresosSocios(filters);
        else if (view === "income")
          response = await contableApi.ingresos(filters);
        else response = await contableApi.egresos(filters);
        if (requestId.current === currentRequest)
          setData({
            items: response.items || [],
            resumen: response.resumen || {},
          });
      }
    } catch (error) {
      if (requestId.current === currentRequest)
        setFeedback({ type: "error", message: error.message });
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [view, incomeTab, year, month, search, category, mean]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [loadData, search]);

  const requestOption = (type, label, onCreated) => {
    setOptionName("");
    setOptionModal({ type, label, onCreated });
  };

  const saveOption = async (event) => {
    event.preventDefault();
    if (!optionModal) return;
    setSaving(true);
    try {
      const response = await contableApi.guardarOpcion({
        tipo: optionModal.type,
        nombre: optionName,
      });
      await loadCatalogs();
      optionModal.onCreated(String(response.item.id_opcion));
      setOptionModal(null);
      setFeedback({ type: "success", message: response.mensaje });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openIncome = (item = null) => {
    setIncomeForm(
      item
        ? {
            id_ingreso: String(item.id_ingreso),
            fecha: item.fecha,
            id_medio_pago: String(item.id_medio_pago),
            id_proveedor: item.id_proveedor ? String(item.id_proveedor) : "",
            id_categoria: item.id_categoria ? String(item.id_categoria) : "",
            id_concepto: item.id_concepto ? String(item.id_concepto) : "",
            importe: String(item.importe),
            detalle: item.detalle || "",
          }
        : emptyIncomeForm(),
    );
    setIncomeOpen(true);
  };

  const saveIncome = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await contableApi.guardarIngreso(incomeForm);
      setIncomeOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await Promise.all([loadData(), loadCatalogs()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openExpense = (item = null) => {
    setExpenseForm(
      item
        ? {
            id_egreso: String(item.id_egreso),
            fecha: item.fecha,
            id_medio_pago: String(item.id_medio_pago),
            id_proveedor: item.id_proveedor ? String(item.id_proveedor) : "",
            id_categoria: item.id_categoria ? String(item.id_categoria) : "",
            id_concepto: item.id_concepto ? String(item.id_concepto) : "",
            numero_comprobante: item.numero_comprobante || "",
            importe: String(item.importe),
            detalle: item.detalle || "",
            archivo: null,
            archivo_nombre: item.archivo_nombre || "",
            eliminar_archivo: false,
          }
        : emptyExpenseForm(),
    );
    setExpenseFormTab("movement");
    setExpenseOpen(true);
  };

  const clearExpenseFileInput = () => {
    if (expenseFileInputRef.current) {
      expenseFileInputRef.current.value = "";
    }
  };

  const chooseFile = (file) => {
    if (!file) return;
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowed.includes(file.type)) {
      setFeedback({
        type: "error",
        message: "Solo se permiten PDF, JPG, PNG, GIF o WEBP.",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({
        type: "error",
        message: "El archivo no puede superar los 10 MB.",
      });
      return;
    }
    setExpenseForm((current) => ({
      ...current,
      archivo: file,
      archivo_nombre: file.name,
      eliminar_archivo: false,
    }));
  };

  const saveExpense = async (event) => {
    event.preventDefault();
    if (
      !expenseForm.fecha ||
      !expenseForm.id_medio_pago ||
      !expenseForm.id_proveedor ||
      !expenseForm.id_categoria ||
      !expenseForm.id_concepto ||
      Number(expenseForm.importe) <= 0
    ) {
      setExpenseFormTab("movement");
      setFeedback({
        type: "error",
        message: "Completá los datos obligatorios del egreso.",
      });
      return;
    }
    setSaving(true);
    const formData = new FormData();
    Object.entries(expenseForm).forEach(([key, value]) => {
      if (key === "archivo") return;
      formData.append(
        key,
        typeof value === "boolean" ? (value ? "1" : "0") : (value ?? ""),
      );
    });
    if (expenseForm.archivo) formData.append("archivo", expenseForm.archivo);
    try {
      const response = await contableApi.guardarEgreso(formData);
      setExpenseOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await Promise.all([loadData(), loadCatalogs()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return { ok: false };
    const response =
      deleteTarget.type === "income"
        ? await contableApi.eliminarIngreso(deleteTarget.item.id_ingreso)
        : await contableApi.eliminarEgreso(deleteTarget.item.id_egreso);
    await loadData();
    setDeleteTarget(null);
    return response;
  };

  const viewFile = async (item) => {
    const popup = window.open("", "_blank");
    if (popup) {
      popup.document.title = "Comprobante";
      popup.document.body.innerHTML =
        '<p style="font-family:Arial,sans-serif;padding:24px">Cargando comprobante...</p>';
    }

    try {
      const blob = await contableApi.archivoEgreso(item.id_egreso);
      const url = URL.createObjectURL(blob);
      const isImage = /^image\//i.test(String(blob.type || ""));
      const preview = isImage
        ? `<img src="${url}" alt="Comprobante" style="display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain" />`
        : `<iframe title="Vista previa del comprobante" src="${url}" style="width:100%;height:100vh;border:0" allow="fullscreen"></iframe>`;

      if (popup && !popup.closed) {
        popup.document.open();
        popup.document.write(`<!doctype html>
          <html lang="es">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1" />
              <title>Comprobante</title>
              <style>html,body{width:100%;height:100%;margin:0;background:#f5f5f5;overflow:auto}</style>
            </head>
            <body>${preview}</body>
          </html>`);
        popup.document.close();
        popup.focus?.();
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (error) {
      popup?.close();
      setFeedback({ type: "error", message: error.message });
    }
  };

  const categoryOptions = useMemo(() => {
    if (view === "income" && incomeTab === "partners")
      return catalogs.categorias_socios || [];
    if (view === "income") return catalogs.opciones.CATEGORIA_INGRESO || [];
    return catalogs.opciones.CATEGORIA_EGRESO || [];
  }, [catalogs, view, incomeTab]);

  const exportConfig = useMemo(() => {
    const items = data.items || [];

    if (view === "income" && incomeTab === "partners") {
      return {
        title: "Exportar ingresos de socios",
        fileTitle: "Ingresos de socios",
        fileName: `ingresos_socios_${year}_${month}`,
        columns: [
          { label: "Fecha de cobro", value: (item) => formatDate(item.fecha) },
          { label: "Socio", key: "socio" },
          { label: "DNI", key: "dni" },
          { label: "Categoría", key: "categoria" },
          { label: "Período pagado", key: "periodo" },
          { label: "Medio", key: "medio" },
          { label: "Monto", key: "monto" },
          {
            label: "Tipo de importe",
            value: (item) => item.monto_estimado ? "ESTIMADO" : "REGISTRADO",
          },
        ],
        records: items,
      };
    }

    if (view === "income") {
      return {
        title: "Exportar otros ingresos",
        fileTitle: "Otros ingresos",
        fileName: `otros_ingresos_${year}_${month}`,
        columns: [
          { label: "Fecha", value: (item) => formatDate(item.fecha) },
          { label: "Proveedor / Persona", key: "proveedor" },
          { label: "Categoría", key: "categoria" },
          { label: "Concepto", key: "concepto" },
          { label: "Medio", key: "medio" },
          { label: "Detalle", value: (item) => item.detalle || "" },
          { label: "Importe", key: "importe" },
        ],
        records: items,
      };
    }

    return {
      title: "Exportar egresos",
      fileTitle: "Egresos",
      fileName: `egresos_${year}_${month}`,
      columns: [
        { label: "Proveedor", key: "proveedor" },
        { label: "Categoría", key: "categoria" },
        { label: "Fecha", value: (item) => formatDate(item.fecha) },
        {
          label: "N.º comprobante",
          value: (item) => item.numero_comprobante || "",
        },
        { label: "Concepto", key: "concepto" },
        { label: "Medio", key: "medio" },
        { label: "Detalle", value: (item) => item.detalle || "" },
        { label: "Importe", key: "importe" },
      ],
      records: items,
    };
  }, [data.items, incomeTab, month, view, year]);

  const summaryCategories = data.resumen?.categorias || [];
  const periodFilters = [
    {
      key: "anio",
      label: "Año",
      type: "select",
      className: "contable-filter--year",
      value: year,
      onChange: setYear,
      includeEmptyOption: false,
      options: (catalogs.anios || [CURRENT_YEAR]).map((item) => ({
        value: String(item),
        label: String(item),
      })),
    },
    {
      key: "mes",
      label: "Mes",
      type: "select",
      className: "contable-filter--month",
      value: month,
      onChange: setMonth,
      includeEmptyOption: false,
      options: MONTHS.map((name, index) => ({
        value: String(index + 1),
        label: name,
      })),
    },
  ];
  const detailFilters = [
    {
      key: "buscar",
      label: "Búsqueda",
      type: "search",
      placeholder: " ",
      value: search,
      onChange: setSearch,
    },
    ...periodFilters,
    {
      key: "categoria",
      label: "Categoría",
      type: "select",
      className: "contable-filter--category",
      placeholder: "Todas",
      value: category,
      onChange: setCategory,
      options: categoryOptions.map((item) => ({
        value: item.id_categoria ?? item.id_opcion,
        label: item.nombre,
      })),
    },
    {
      key: "medio",
      label: "Medio de pago",
      type: "select",
      className: "contable-filter--payment",
      placeholder: "Todos",
      value: mean,
      onChange: setMean,
      options: catalogs.medios_pago.map((item) => ({
        value: item.id_medio_pago,
        label: item.nombre,
      })),
    },
  ];
  const pageFilters =
    view === "summary"
      ? [
          {
            key: "modo",
            label: "Vista del resumen",
            type: "tabs",
            value: summaryMode,
            onChange: setSummaryMode,
            options: [
              { value: "annual", label: "Anual" },
              { value: "monthly", label: "Mensual" },
            ],
          },
          ...periodFilters,
        ]
      : view === "income"
        ? [
            {
              key: "tipo-ingreso",
              label: "Tipo de ingreso",
              type: "tabs",
              value: incomeTab,
              onChange: setIncomeTab,
              options: [
                { value: "partners", label: "Socios" },
                { value: "manual", label: "Otros ingresos" },
              ],
            },
            ...detailFilters,
          ]
        : detailFilters;
  const canCreateMovement =
    writable &&
    ((view === "income" && incomeTab === "manual") || view === "expense");
  const openMovement =
    view === "income"
      ? () => openIncome()
      : view === "expense"
        ? () => openExpense()
        : undefined;
  const tableColumns =
    view === "income" && incomeTab === "partners"
      ? [
          "Socio",
          "Fecha de cobro",
          "Período pagado",
          "Medio",
          { label: "Monto", align: "right" },
        ]
      : view === "income"
        ? [
            "Persona / Proveedor",
            "Fecha",
            "Medio",
            "Descripción / concepto",
            { label: "Importe", align: "right" },
            ...(writable ? ["Acciones"] : []),
          ]
        : [
            "Proveedor",
            "Fecha",
            "N.º comprobante",
            "Descripción",
            "Medio",
            { label: "Monto", align: "right" },
            "Acciones",
          ];
  const tableGridClassName =
    view === "income" && incomeTab === "partners"
      ? "contable-grid contable-grid--partners"
      : view === "income"
        ? `contable-grid ${writable ? "contable-grid--income" : "contable-grid--income-readonly"}`
        : "contable-grid contable-grid--expense";
  const selectedSummaryMonth = (summary?.meses || []).find(
    (item) => Number(item.mes) === Number(summary?.mes_seleccionado),
  );
  const summaryVisibleTotals =
    summaryMode === "monthly" ? selectedSummaryMonth || {} : summary?.totales || {};
  const summaryEstimatedPayments = Number(
    summaryVisibleTotals.pagos_estimados || 0,
  );
  const summaryEstimateMessage = `${summaryEstimatedPayments} cobro${
    summaryEstimatedPayments === 1
      ? " histórico tiene"
      : "s históricos tienen"
  } el importe estimado según la cuota de su categoría porque la base anterior no guardó el monto exacto.`;

  return (
    <>
      <ModulePage
        title={
          view === "summary" ? (
            <span className="ct-page-title">
              <span>Resumen contable</span>
              {!loading && summaryEstimatedPayments > 0 ? (
                <span className="ct-estimate-help">
                  <button
                    className="ct-estimate-help__button"
                    type="button"
                    aria-label={summaryEstimateMessage}
                    aria-describedby="ct-estimate-tooltip"
                  >
                    <FontAwesomeIcon icon={faCircleInfo} />
                  </button>
                  <span
                    className="ct-estimate-tooltip"
                    id="ct-estimate-tooltip"
                    role="tooltip"
                  >
                    {summaryEstimateMessage}
                  </span>
                </span>
              ) : null}
            </span>
          ) : view === "income" ? (
            "Ingresos"
          ) : (
            "Egresos"
          )
        }
        description={
          view === "expense" ? "Administración de gastos" : undefined
        }
        filters={pageFilters}
        tabsInTitle={view === "summary" || view === "income"}
        headFiltersClassName="contable-head-filters"
        primaryActionLabel={
          view === "income" ? "Registrar ingreso" : "Registrar egreso"
        }
        onPrimaryAction={openMovement}
        canCreate={canCreateMovement}
        primaryActionClassName={canCreateMovement ? "contable-create-top" : ""}
        headerActions={
          view !== "summary" && !compactActions ? (
            <BotonExportarGlobal
              className="contable-export-top"
              onClick={() => setExportOpen(true)}
              disabled={!data.items?.length}
            />
          ) : null
        }
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message}
          onClose={() => setFeedback(null)}
        />

        {view === "summary" ? (
          <SummaryView summary={summary} loading={loading} mode={summaryMode} />
        ) : (
          <div className="contable-table">
            <GlobalDivTable
              className="contable-table__data"
              bodyClassName="entity-table-wrap"
              gridClassName={tableGridClassName}
              columns={tableColumns}
              loading={loading}
              loadingLabel="Cargando movimientos contables..."
              skeletonActionColumn={
                view === "income"
                  ? incomeTab === "manual" && writable
                  : true
              }
              ariaLabel={
                view === "income" ? "Listado de ingresos" : "Listado de egresos"
              }
            >
              {view === "income" && incomeTab === "partners" ? (
                <>
                  {!data.items?.length ? (
                    <EmptyState message="No hubo cobros de socios en el mes seleccionado." />
                  ) : null}
                  {data.items?.map((item, index) => (
                    <div
                      className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row contable-grid contable-grid--partners"
                      role="row"
                      key={
                        item.clave ||
                        `${item.origen || "COBRO"}-${item.id_registro || index}`
                      }
                    >
                      <div className="mov-gridCell entity-main-cell">
                        <strong>{item.socio}</strong>
                        <small>
                          Categoría: {item.categoria || "Sin categoría"}
                          {item.dni ? ` · ${item.dni}` : ""}
                        </small>
                      </div>
                      <div className="mov-gridCell is-center">
                        {formatDate(item.fecha)}
                      </div>
                      <div className="mov-gridCell is-center">
                        {item.periodo}
                      </div>
                      <div className="mov-gridCell is-center">{item.medio}</div>
                      <div className="mov-gridCell is-right is-strong contable-money-cell">
                        <strong>{money(item.monto)}</strong>
                        {item.monto_estimado ? (
                          <small className="contable-estimated">
                            Importe histórico estimado
                          </small>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {view === "income" && incomeTab === "manual" ? (
                <>
                  {!data.items?.length ? (
                    <EmptyState message="No hay otros ingresos registrados en el mes." />
                  ) : null}
                  {data.items?.map((item) => (
                    <div
                      className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row contable-grid ${writable ? "contable-grid--income" : "contable-grid--income-readonly"}`}
                      role="row"
                      key={item.id_ingreso}
                    >
                      <div className="mov-gridCell entity-main-cell">
                        <strong>{item.proveedor}</strong>
                        <small>Categoría: {item.categoria || "Sin categoría"}</small>
                      </div>
                      <div className="mov-gridCell is-center">
                        {formatDate(item.fecha)}
                      </div>
                      <div className="mov-gridCell is-center">{item.medio}</div>
                      <div className="mov-gridCell entity-main-cell">
                        <strong>{item.concepto}</strong>
                        {item.detalle ? <small>{item.detalle}</small> : null}
                      </div>
                      <div className="mov-gridCell is-right is-strong contable-money-cell">
                        {money(item.importe)}
                      </div>
                      {writable ? (
                        <div className="mov-gridCell mov-gridCell--actions">
                          <div className="mov-actionsInline">
                            <button
                              className="mov-iconBtn"
                              type="button"
                              onClick={() => openIncome(item)}
                              title="Editar"
                            >
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                            <button
                              className="mov-iconBtn mov-iconBtn--danger"
                              type="button"
                              onClick={() =>
                                setDeleteTarget({ type: "income", item })
                              }
                              title="Anular"
                            >
                              <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : null}

              {view === "expense" ? (
                <>
                  {!data.items?.length ? (
                    <EmptyState message="No hay egresos registrados en el mes." />
                  ) : null}
                  {data.items?.map((item) => (
                    <div
                      className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row contable-grid contable-grid--expense"
                      role="row"
                      key={item.id_egreso}
                    >
                      <div className="mov-gridCell entity-main-cell">
                        <strong>{item.proveedor}</strong>
                        <small>Categoría: {item.categoria || "Sin categoría"}</small>
                      </div>
                      <div className="mov-gridCell is-center">
                        {formatDate(item.fecha)}
                      </div>
                      <div className="mov-gridCell is-center">
                        {item.numero_comprobante || "—"}
                      </div>
                      <div className="mov-gridCell entity-main-cell">
                        <strong>{item.concepto}</strong>
                        {item.detalle ? <small>{item.detalle}</small> : null}
                      </div>
                      <div className="mov-gridCell is-center">{item.medio}</div>
                      <div className="mov-gridCell is-right is-strong contable-money-cell">
                        {money(item.importe)}
                      </div>
                      <div className="mov-gridCell mov-gridCell--actions">
                        <div className="mov-actionsInline">
                          <button
                            className="mov-iconBtn"
                            type="button"
                            onClick={() => viewFile(item)}
                            disabled={!item.tiene_archivo}
                            title={
                              item.tiene_archivo
                                ? "Ver comprobante"
                                : "Sin comprobante"
                            }
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          {writable ? (
                            <>
                              <button
                                className="mov-iconBtn"
                                type="button"
                                onClick={() => openExpense(item)}
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faPen} />
                              </button>
                              <button
                                className="mov-iconBtn mov-iconBtn--danger"
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({ type: "expense", item })
                                }
                                title="Anular"
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </GlobalDivTable>

            <div className="contable-table-footer">
              {summaryCategories.length ? (
                <section
                  className="contable-category-summary"
                  aria-label="Resumen por categoría"
                >
                  <strong>Resumen por categoría</strong>
                  <div>
                    {summaryCategories.map((item) => (
                      <article key={item.nombre}>
                        <span>{item.nombre}</span>
                        <small>
                          {item.registros !== undefined
                            ? `${item.registros} registros`
                            : ""}
                        </small>
                        <b>{money(item.total)}</b>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <div
                className={`contable-lower-actions ${view === "expense" || (view === "income" && incomeTab === "manual") ? "contable-lower-actions--right" : ""}`.trim()}
              >
                {compactActions ? (
                  <BotonExportarGlobal
                    className="mov-btn--compact"
                    onClick={() => setExportOpen(true)}
                    disabled={!data.items?.length}
                  />
                ) : null}
                {canCreateMovement ? (
                  <button
                    type="button"
                    className="mov-btn mov-btn--primary"
                    onClick={openMovement}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    {view === "income"
                      ? "Registrar ingreso"
                      : "Registrar egreso"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </ModulePage>

      <CrudModal
        open={incomeOpen}
        title={incomeForm.id_ingreso ? "Editar ingreso" : "Registrar ingreso"}
        subtitle="Ingreso ajeno a cuotas o inscripciones de socios."
        onClose={() => setIncomeOpen(false)}
        onSubmit={saveIncome}
        saving={saving}
        submitLabel="Guardar ingreso"
        modalClassName="contable-modal"
        closeOnBackdrop={false}
        wide
      >
        <div className="entity-form contable-modal__form">
          <EntityFormPanel
            standalone
            eyebrow="Movimiento contable"
            title="Datos del ingreso"
            icon={faArrowTrendUp}
            tag="Campos obligatorios"
            bodyClassName="entity-form__grid"
          >
            <FloatingField label="Fecha *" active>
              <input
                type="date"
                required
                value={incomeForm.fecha}
                onChange={(event) =>
                  setIncomeForm((current) => ({
                    ...current,
                    fecha: event.target.value,
                  }))
                }
              />
            </FloatingField>
            <FloatingField label="Medio de pago *" active>
              <select
                required
                value={incomeForm.id_medio_pago}
                onChange={(event) =>
                  setIncomeForm((current) => ({
                    ...current,
                    id_medio_pago: event.target.value,
                  }))
                }
              >
                <option value="">SELECCIONE...</option>
                {catalogs.medios_pago.map((item) => (
                  <option key={item.id_medio_pago} value={item.id_medio_pago}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </FloatingField>
            <OptionSelect
              label="Persona / proveedor *"
              value={incomeForm.id_proveedor}
              options={catalogs.opciones.PROVEEDOR}
              optionType="PROVEEDOR"
              onChange={(value) =>
                setIncomeForm((current) => ({
                  ...current,
                  id_proveedor: value,
                }))
              }
              onRequestCreate={requestOption}
            />
            <OptionSelect
              label="Categoría *"
              value={incomeForm.id_categoria}
              options={catalogs.opciones.CATEGORIA_INGRESO}
              optionType="CATEGORIA_INGRESO"
              onChange={(value) =>
                setIncomeForm((current) => ({
                  ...current,
                  id_categoria: value,
                }))
              }
              onRequestCreate={requestOption}
            />
            <OptionSelect
              label="Descripción / concepto *"
              value={incomeForm.id_concepto}
              options={catalogs.opciones.CONCEPTO_INGRESO}
              optionType="CONCEPTO_INGRESO"
              onChange={(value) =>
                setIncomeForm((current) => ({ ...current, id_concepto: value }))
              }
              onRequestCreate={requestOption}
            />
            <FloatingField
              label="Importe (ARS) *"
              active={Boolean(incomeForm.importe)}
            >
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={incomeForm.importe}
                placeholder=" "
                onChange={(event) =>
                  setIncomeForm((current) => ({
                    ...current,
                    importe: event.target.value,
                  }))
                }
              />
            </FloatingField>
            <FloatingField
              label="Detalle opcional"
              active={Boolean(incomeForm.detalle)}
              textarea
              wide
            >
              <textarea
                rows="3"
                maxLength="500"
                value={incomeForm.detalle}
                placeholder=" "
                onChange={(event) =>
                  setIncomeForm((current) => ({
                    ...current,
                    detalle: upper(event.target.value),
                  }))
                }
              />
            </FloatingField>
          </EntityFormPanel>
        </div>
      </CrudModal>

      <CrudModal
        open={expenseOpen}
        title={expenseForm.id_egreso ? "Editar egreso" : "Registrar egreso"}
        subtitle="Registrá el gasto y adjuntá su comprobante cuando corresponda."
        onClose={() => setExpenseOpen(false)}
        onSubmit={saveExpense}
        saving={saving}
        submitLabel="Guardar egreso"
        modalClassName="contable-modal contable-modal--expense"
        closeOnBackdrop={false}
        wide
      >
        <div className="entity-form contable-modal__form">
          <EntityTabs
            tabs={[
              {
                value: "movement",
                label: "Datos del egreso",
                icon: faFileInvoiceDollar,
              },
              {
                value: "receipt",
                label: "Comprobante",
                icon: faPaperclip,
                badge: expenseForm.archivo_nombre ? 1 : null,
              },
            ]}
            value={expenseFormTab}
            onChange={setExpenseFormTab}
            idPrefix="contable-expense-tab"
            ariaLabel="Secciones del egreso"
          />

          {expenseFormTab === "movement" ? (
            <EntityFormPanel
              tabValue="movement"
              idPrefix="contable-expense-tab"
              eyebrow="Movimiento contable"
              title="Datos del egreso"
              icon={faArrowTrendDown}
              tag="Campos obligatorios"
              bodyClassName="entity-form__grid"
            >
              <FloatingField label="Fecha *" active>
                <input
                  type="date"
                  required
                  value={expenseForm.fecha}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      fecha: event.target.value,
                    }))
                  }
                />
              </FloatingField>
              <FloatingField label="Medio de pago *" active>
                <select
                  required
                  value={expenseForm.id_medio_pago}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      id_medio_pago: event.target.value,
                    }))
                  }
                >
                  <option value="">SELECCIONE...</option>
                  {catalogs.medios_pago.map((item) => (
                    <option key={item.id_medio_pago} value={item.id_medio_pago}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </FloatingField>
              <OptionSelect
                label="Categoría *"
                value={expenseForm.id_categoria}
                options={catalogs.opciones.CATEGORIA_EGRESO}
                optionType="CATEGORIA_EGRESO"
                onChange={(value) =>
                  setExpenseForm((current) => ({
                    ...current,
                    id_categoria: value,
                  }))
                }
                onRequestCreate={requestOption}
              />
              <FloatingField
                label="N.º de comprobante"
                active={Boolean(expenseForm.numero_comprobante)}
              >
                <input
                  maxLength="120"
                  value={expenseForm.numero_comprobante}
                  placeholder=" "
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      numero_comprobante: upper(event.target.value),
                    }))
                  }
                />
              </FloatingField>
              <OptionSelect
                label="Proveedor *"
                value={expenseForm.id_proveedor}
                options={catalogs.opciones.PROVEEDOR}
                optionType="PROVEEDOR"
                onChange={(value) =>
                  setExpenseForm((current) => ({
                    ...current,
                    id_proveedor: value,
                  }))
                }
                onRequestCreate={requestOption}
              />
              <OptionSelect
                label="Descripción / concepto *"
                value={expenseForm.id_concepto}
                options={catalogs.opciones.CONCEPTO_EGRESO}
                optionType="CONCEPTO_EGRESO"
                onChange={(value) =>
                  setExpenseForm((current) => ({
                    ...current,
                    id_concepto: value,
                  }))
                }
                onRequestCreate={requestOption}
              />
              <FloatingField
                label="Importe (ARS) *"
                active={Boolean(expenseForm.importe)}
                wide
              >
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={expenseForm.importe}
                  placeholder=" "
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      importe: event.target.value,
                    }))
                  }
                />
              </FloatingField>
              <FloatingField
                label="Detalle opcional"
                active={Boolean(expenseForm.detalle)}
                textarea
                wide
              >
                <textarea
                  rows="3"
                  maxLength="500"
                  value={expenseForm.detalle}
                  placeholder=" "
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      detalle: upper(event.target.value),
                    }))
                  }
                />
              </FloatingField>
            </EntityFormPanel>
          ) : (
            <EntityFormPanel
              tabValue="receipt"
              idPrefix="contable-expense-tab"
              eyebrow="Respaldo documental"
              title="Comprobante del egreso"
              icon={faPaperclip}
              tag="Opcional · máximo 10 MB"
              hint="Podés adjuntar PDF, JPG, PNG, GIF o WEBP. El archivo quedará asociado al movimiento."
            >
              <div
                className="contable-upload"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseFile(event.dataTransfer.files?.[0]);
                }}
              >
                <span className="contable-upload__icon">
                  <FontAwesomeIcon icon={faPaperclip} />
                </span>
                <strong>
                  {expenseForm.archivo_nombre ||
                    "Adjuntar comprobante"}
                </strong>
                <span>Arrastrá una imagen o PDF, o elegí un archivo.</span>
                <label className="mov-btn mov-btn--ghost">
                  Elegir archivo
                  <input
                    ref={expenseFileInputRef}
                    type="file"
                    hidden
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={(event) => chooseFile(event.target.files?.[0])}
                  />
                </label>
                {expenseForm.archivo_nombre ? (
                  <button
                    type="button"
                    className="mov-btn mov-btn--danger"
                    onClick={() => {
                      clearExpenseFileInput();
                      setExpenseForm((current) => ({
                        ...current,
                        archivo: null,
                        archivo_nombre: "",
                        eliminar_archivo: true,
                      }));
                    }}
                  >
                    Quitar comprobante
                  </button>
                ) : null}
              </div>
            </EntityFormPanel>
          )}
        </div>
      </CrudModal>

      <CrudModal
        open={Boolean(optionModal)}
        title={`Agregar ${optionModal?.label || "opción"}`}
        subtitle="La nueva opción quedará disponible inmediatamente en este selector."
        onClose={() => setOptionModal(null)}
        onSubmit={saveOption}
        saving={saving}
        submitLabel="Agregar opción"
        modalClassName="contable-option-modal"
        closeOnBackdrop={false}
      >
        <FloatingField label="Nombre *" active={Boolean(optionName)}>
          <input
            autoFocus
            required
            maxLength="160"
            value={optionName}
            onChange={(event) => setOptionName(upper(event.target.value))}
            placeholder=" "
          />
        </FloatingField>
      </CrudModal>


      <ModalExportarGlobal
        open={exportOpen}
        title={exportConfig.title}
        tituloArchivo={exportConfig.fileTitle}
        subtituloArchivoActual={`${MONTHS[Number(month) - 1] || ""} ${year}`}
        nombreArchivo={exportConfig.fileName}
        columnas={exportConfig.columns}
        registrosActuales={exportConfig.records}
        cantidadActual={exportConfig.records.length}
        mostrarAlcanceTodos={false}
        alcanceActualLabel="Exportar registros filtrados"
        alcanceActualDescription="Descarga todos los movimientos que coinciden con los filtros actuales."
        onClose={() => setExportOpen(false)}
        onSuccess={(message) => setFeedback({ type: "success", message })}
        onError={(message) => setFeedback({ type: "error", message })}
      />
      <ModalEliminarGlobal
        open={Boolean(deleteTarget)}
        operacion="advertencia"
        tone="danger"
        icon={faTrashCan}
        row={deleteTarget?.item}
        title={
          deleteTarget?.type === "income" ? "Eliminar ingreso" : "Eliminar egreso"
        }
        message="El movimiento se eliminará definitivamente de Contabilidad. La acción quedará registrada en auditoría."
        warning="Esta acción no modifica cuotas ni cobros de socios."
        confirmLabel="Eliminar movimiento"
        successMessage="El movimiento se eliminó correctamente."
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        details={
          deleteTarget
            ? [
                { label: "Fecha", value: formatDate(deleteTarget.item.fecha) },
                { label: "Concepto", value: deleteTarget.item.concepto },
                { label: "Importe", value: money(deleteTarget.item.importe) },
              ]
            : []
        }
      />
    </>
  );
}
