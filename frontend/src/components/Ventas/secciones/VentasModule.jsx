import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateLeft,
  faBan,
  faCashRegister,
  faCheck,
  faCircleInfo,
  faPen,
  faPlus,
  faReceipt,
  faToggleOff,
  faToggleOn,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import GlobalDivTable from "../../Global/GlobalDivTable";
import { ModulePage } from "../../Global/ModulePage";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/ModuleFeedback";
import { canWrite } from "../../_shared/auth/session";
import { ventasApi } from "../api/ventasApi";
import ProductoVentaModal from "../modales/ProductoVentaModal";
import VentaModal from "../modales/VentaModal";
import {
  toUpperText,
  uppercaseProductText,
  uppercaseSaleText,
} from "../utils/textCase";
import "../Ventas.css";

const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value, digits = 3) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";

const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es-AR");

const emptyProduct = () => ({
  id_producto: "",
  codigo: "",
  nombre: "",
  descripcion: "",
  precio: "",
  controla_stock: false,
  stock_actual: "0",
  stock_minimo: "0",
});

const emptySale = () => ({
  id_venta: "",
  id_configuracion: "",
  fecha: TODAY,
  estado: "CONFIRMADA",
  id_medio_pago: "",
  comprador_tipo: "ANONIMO",
  id_socio: "",
  comprador_nombre: "",
  comprador_documento: "",
  comprador_contacto: "",
  descuento: "0",
  observaciones: "",
  items: [{ id_producto: "", cantidad: "1", precio_unitario: "" }],
});

function Empty({ loading, text }) {
  return (
    <div className="module-empty">
      <FontAwesomeIcon icon={loading ? faCashRegister : faReceipt} />
      <strong>{loading ? "Cargando ventas..." : "No hay registros"}</strong>
      <span>
        {loading ? "Consultando la información de la organización." : text}
      </span>
    </div>
  );
}

function StatusBadge({ state }) {
  const normalizedState = String(state).toUpperCase();
  const tone =
    normalizedState === "CONFIRMADA" || normalizedState === "ACTIVO"
      ? "mov-chip--ok"
      : normalizedState === "ANULADA" || normalizedState === "INACTIVO"
        ? "mov-chip--danger"
        : "mov-chip--neutral";

  return <span className={`mov-chip ${tone}`}>{state}</span>;
}

function InfoTooltip({ id, text }) {
  return (
    <span className="sales-infoTooltip">
      <button
        type="button"
        className="sales-infoTooltip__trigger"
        aria-label="Ver información"
        aria-describedby={id}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
      <span className="sales-infoTooltip__content" id={id} role="tooltip">
        {text}
      </span>
    </span>
  );
}

function SalesSummary({ stats }) {
  return (
    <section className="sales-summary" aria-label="Resumen de ventas">
      <strong>Resumen de ventas</strong>
      <div>
        {stats.map((stat) => (
          <article key={stat.label}>
            <span>{stat.label}</span>
            <small>{stat.detail}</small>
            <b>{stat.value}</b>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function VentasModule() {
  const writable = canWrite();
  const [tab, setTab] = useState("productos");
  const [catalogs, setCatalogs] = useState({
    resumen: {},
    configuraciones: [],
    productos: [],
    medios_pago: [],
    opciones_contables: {
      PROVEEDOR: [],
      CATEGORIA_INGRESO: [],
      CONCEPTO_INGRESO: [],
    },
  });
  const [sales, setSales] = useState([]);
  const [salesSummary, setSalesSummary] = useState({
    registros: 0,
    total: "0.00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [configFilter, setConfigFilter] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [productForm, setProductForm] = useState(null);
  const [productAction, setProductAction] = useState(null);
  const [saleForm, setSaleForm] = useState(null);
  const [saleAction, setSaleAction] = useState(null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partners, setPartners] = useState([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const saleBuyerType = saleForm?.comprador_tipo;

  const showError = useCallback(
    (error) =>
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo completar la operación.",
      }),
    [],
  );
  const showSuccess = useCallback(
    (message) => setFeedback({ type: "success", message }),
    [],
  );

  const loadCatalogs = useCallback(async () => {
    const data = await ventasApi.catalogos();
    setCatalogs({
      resumen: data.resumen || {},
      configuraciones: data.configuraciones || [],
      productos: data.productos || [],
      medios_pago: data.medios_pago || [],
      opciones_contables: data.opciones_contables || {},
    });
  }, []);

  const loadSales = useCallback(async () => {
    const data = await ventasApi.listar({
      buscar: search,
      estado: stateFilter,
      configuracion: configFilter,
      anio: year,
      mes: month,
    });
    setSales(data.items || []);
    setSalesSummary(data.resumen || { registros: 0, total: "0.00" });
  }, [configFilter, month, search, stateFilter, year]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCatalogs(), loadSales()]);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [loadCatalogs, loadSales, showError]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadCatalogs()
      .catch(showError)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadCatalogs, showError]);

  useEffect(() => {
    if (tab !== "ventas") return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      loadSales()
        .catch(showError)
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [tab, loadSales, showError]);

  useEffect(() => {
    if (saleBuyerType !== "SOCIO" || partnerSearch.trim().length < 2) {
      setPartners([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPartnerLoading(true);
      try {
        const data = await ventasApi.buscarSocios(partnerSearch, {
          signal: controller.signal,
        });
        setPartners(data.items || []);
      } catch (error) {
        if (error.name !== "AbortError") showError(error);
      } finally {
        setPartnerLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [partnerSearch, saleBuyerType, showError]);

  const activeConfig = useMemo(
    () =>
      catalogs.configuraciones.find(
        (item) =>
          String(item.id_configuracion) === String(saleForm?.id_configuracion),
      ),
    [catalogs.configuraciones, saleForm?.id_configuracion],
  );

  const saleSubtotal = useMemo(
    () =>
      (saleForm?.items || []).reduce(
        (sum, item) =>
          sum + Number(item.cantidad || 0) * Number(item.precio_unitario || 0),
        0,
      ),
    [saleForm?.items],
  );
  const saleTotal = Math.max(
    0,
    saleSubtotal - Number(saleForm?.descuento || 0),
  );

  const filteredProducts = useMemo(() => {
    const term = normalizeSearch(productSearch.trim());
    if (!term) return catalogs.productos;

    return catalogs.productos.filter((item) =>
      [item.codigo, item.nombre, item.descripcion].some((value) =>
        normalizeSearch(value).includes(term),
      ),
    );
  }, [catalogs.productos, productSearch]);

  const openNewProduct = () => setProductForm(emptyProduct());
  const openNewSale = () => {
    const firstConfig = catalogs.configuraciones.find((item) => item.activo);
    if (!firstConfig) {
      showError(
        new Error(
          "Primero configurá una caja, sede o canal desde Configuración > Ventas.",
        ),
      );
      return;
    }
    const form = emptySale();
    form.id_configuracion = String(firstConfig.id_configuracion);
    setPartnerSearch("");
    setSaleForm(form);
  };

  const editProduct = (item) =>
    setProductForm({
      ...emptyProduct(),
      ...uppercaseProductText(item),
      id_producto: String(item.id_producto),
    });

  const editSale = (item) => {
    setPartnerSearch(toUpperText(item.comprador_nombre_snapshot));
    setSaleForm({
      ...emptySale(),
      ...uppercaseSaleText(item),
      id_venta: String(item.id_venta),
      id_configuracion: String(item.id_configuracion),
      id_medio_pago: String(item.id_medio_pago),
      id_socio: item.id_socio ? String(item.id_socio) : "",
      comprador_nombre:
        item.comprador_tipo === "EXTERNO"
          ? toUpperText(item.comprador_nombre_snapshot)
          : "",
      comprador_documento:
        item.comprador_tipo === "EXTERNO"
          ? toUpperText(item.comprador_documento_snapshot)
          : "",
      comprador_contacto:
        item.comprador_tipo === "EXTERNO"
          ? toUpperText(item.comprador_contacto_snapshot)
          : "",
      items: (item.items || []).map((line) => ({
        id_producto: String(line.id_producto),
        cantidad: String(Number(line.cantidad)),
        precio_unitario: String(line.precio_unitario),
      })),
    });
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await ventasApi.guardarProducto(uppercaseProductText(productForm));
      setProductForm(null);
      await refresh();
      showSuccess("Producto guardado correctamente.");
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const submitSale = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await ventasApi.guardarVenta(uppercaseSaleText(saleForm));
      setSaleForm(null);
      await refresh();
      showSuccess("Venta guardada; stock y contabilidad fueron sincronizados.");
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = async (item) => {
    if (item.activo) {
      setProductAction(item);
      return;
    }

    try {
      await ventasApi.estadoProducto(item.id_producto, true);
      await refresh();
      showSuccess("Producto reactivado.");
    } catch (error) {
      showError(error);
    }
  };

  const confirmProductDeactivation = async () => {
    if (!productAction) return { ok: false };
    await ventasApi.estadoProducto(productAction.id_producto, false);
    await refresh();
    return { mensaje: "Producto desactivado correctamente." };
  };

  const changeSaleState = async (item, target) => {
    const verb = target === "CONFIRMADA" ? "confirmar" : "pasar a pendiente";
    if (!window.confirm(`¿Deseás ${verb} la venta ${item.codigo}?`)) return;
    try {
      await ventasApi.estadoVenta(item.id_venta, target);
      await refresh();
      showSuccess(
        "Estado actualizado; stock y contabilidad fueron sincronizados.",
      );
    } catch (error) {
      showError(error);
    }
  };

  const confirmSaleAction = async () => {
    if (!saleAction?.item) return { ok: false };
    const { type, item } = saleAction;
    if (type === "baja") {
      await ventasApi.estadoVenta(item.id_venta, "ANULADA");
      await refresh();
      return {
        mensaje:
          "Venta dada de baja; stock y contabilidad fueron sincronizados.",
      };
    }

    await ventasApi.eliminarVenta(item.id_venta);
    await refresh();
    return {
      mensaje:
        "Venta eliminada; sus impactos de stock y contabilidad fueron revertidos.",
    };
  };

  const updateSaleItem = (index, field, value) => {
    setSaleForm((current) => {
      const items = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, [field]: value };
        if (field === "id_producto") {
          const product = catalogs.productos.find(
            (entry) => String(entry.id_producto) === String(value),
          );
          next.precio_unitario = product?.precio || "";
        }
        return next;
      });
      return { ...current, items };
    });
  };

  const tabs = [
    { value: "productos", label: "Productos" },
    { value: "ventas", label: "Ventas registradas" },
  ];

  const filters = [
    {
      key: "tabs",
      type: "tabs",
      label: "Sección",
      value: tab,
      options: tabs,
      onChange: setTab,
    },
  ];
  if (tab === "productos") {
    filters.push({
      key: "buscar-producto",
      type: "search",
      label: "Búsqueda",
      value: productSearch,
      placeholder: " ",
      onChange: setProductSearch,
    });
  } else {
    filters.push(
      {
        key: "buscar",
        type: "search",
        label: "Buscar",
        value: search,
        placeholder: " ",
        onChange: setSearch,
      },
      {
        key: "estado",
        type: "select",
        className: "sales-filter--state",
        label: "Estado",
        value: stateFilter,
        placeholder: "Todos los estados",
        options: ["PENDIENTE", "CONFIRMADA", "ANULADA"],
        onChange: setStateFilter,
      },
      {
        key: "config",
        type: "select",
        className: "sales-filter--channel",
        label: "Caja o canal",
        value: configFilter,
        placeholder: "Todas las cajas y canales",
        options: catalogs.configuraciones.map((item) => ({
          value: item.id_configuracion,
          label: item.nombre,
        })),
        onChange: setConfigFilter,
      },
      {
        key: "month",
        type: "select",
        className: "sales-filter--month",
        label: "Mes",
        value: month,
        includeEmptyOption: true,
        placeholder: "Todo el año",
        options: Array.from({ length: 12 }, (_, index) => ({
          value: index + 1,
          label: new Intl.DateTimeFormat("es-AR", { month: "long" })
            .format(new Date(2026, index, 1))
            .toLocaleUpperCase("es-AR"),
        })),
        onChange: setMonth,
      },
      {
        key: "year",
        type: "select",
        className: "sales-filter--year",
        label: "Año",
        value: year,
        includeEmptyOption: false,
        options: Array.from({ length: 7 }, (_, index) => {
          const value = new Date().getFullYear() + 1 - index;
          return { value, label: value };
        }),
        onChange: setYear,
      },
    );
  }

  const stats = [
    {
      label: "Vendido este mes",
      value: money(catalogs.resumen.total_mes),
      detail: `${catalogs.resumen.ventas_mes || 0} ventas confirmadas`,
    },
    {
      label: "Productos activos",
      value: catalogs.resumen.productos_activos || 0,
      detail: `${catalogs.resumen.productos_stock_bajo || 0} con stock bajo`,
    },
    {
      label: "Pendientes",
      value: catalogs.resumen.ventas_pendientes || 0,
      detail: "Sin impacto en stock ni contable",
    },
  ];
  const registeredSalesStats = [
    {
      label: "Total confirmado",
      value: money(salesSummary.total),
      detail: "Ventas confirmadas del período",
    },
    ...stats.slice(1),
  ];

  const primaryLabel =
    tab === "productos" ? "Nuevo producto" : "Registrar venta";
  const primaryAction = tab === "productos" ? openNewProduct : openNewSale;

  return (
    <>
      <ModulePage
        title={
          <span className="sales-titleWithInfo">
            <span>Ventas</span>
            <InfoTooltip
              id="sales-title-info"
              text={
                tab === "productos"
                  ? "Los productos pueden ser artículos con stock o servicios sin control de existencias."
                  : "Elegí el medio de pago al registrar cada venta. Solo las ventas confirmadas descuentan stock y generan un ingreso contable."
              }
            />
          </span>
        }
        description="Productos y ventas registradas de la organización."
        filters={filters}
        tabsInTitle
        headFiltersClassName="sales-head-filters"
        primaryActionLabel={primaryLabel}
        onPrimaryAction={primaryAction}
        canCreate={writable}
        primaryActionClassName={tab === "ventas" ? "sales-create-top" : ""}
      >
        {tab === "productos" ? (
          <div className="sales-sectionBody">
            <div className="sales-tableWrap">
              <GlobalDivTable
                ariaLabel="Listado de productos"
                bodyClassName="entity-table-wrap"
                className="sales-globalTable"
                gridClassName="sales-grid sales-grid--products"
                columns={["Producto", "Precio", "Stock", "Estado", "Acciones"]}
              >
                {loading && !catalogs.productos.length ? (
                  <Empty loading />
                ) : null}
                {!loading && !catalogs.productos.length ? (
                  <Empty text="Agregá productos, artículos, entradas o servicios." />
                ) : null}
                {!loading &&
                catalogs.productos.length &&
                !filteredProducts.length ? (
                  <Empty text="No hay productos que coincidan con la búsqueda." />
                ) : null}
                {filteredProducts.map((item) => (
                  <div
                    className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row sales-grid sales-grid--products ${item.stock_bajo ? "has-alert" : ""} ${item.activo ? "" : "is-inactive"}`.trim()}
                    role="row"
                    key={item.id_producto}
                  >
                    <div className="mov-gridCell entity-main-cell">
                      <strong>{item.nombre}</strong>
                      <small>
                        {item.codigo || "SIN CÓDIGO"}
                        {item.descripcion ? ` · ${item.descripcion}` : ""}
                      </small>
                    </div>
                    <div className="mov-gridCell is-right is-strong">
                      {money(item.precio)}
                    </div>
                    <div className="mov-gridCell is-center">
                      <span className="sales-cellStack">
                        <strong>
                          {item.controla_stock
                            ? number(item.stock_actual)
                            : "SIN CONTROL"}
                        </strong>
                        {item.stock_bajo ? (
                          <small className="sales-warning">
                            Stock mínimo: {number(item.stock_minimo)}
                          </small>
                        ) : null}
                      </span>
                    </div>
                    <div className="mov-gridCell is-center">
                      <StatusBadge
                        state={item.activo ? "ACTIVO" : "INACTIVO"}
                      />
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions">
                      <div className="mov-actionsInline">
                        {writable ? (
                          <button
                            type="button"
                            className="mov-iconBtn"
                            onClick={() => editProduct(item)}
                            title="Editar"
                            aria-label="Editar"
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                        ) : null}
                        {writable ? (
                          <button
                            type="button"
                            className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`.trim()}
                            onClick={() => toggleProduct(item)}
                            title={item.activo ? "Desactivar" : "Reactivar"}
                            aria-label={
                              item.activo ? "Desactivar" : "Reactivar"
                            }
                          >
                            <FontAwesomeIcon
                              icon={item.activo ? faToggleOff : faToggleOn}
                            />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </GlobalDivTable>
            </div>
            <div className="sales-tableFooter">
              <SalesSummary stats={stats} />
            </div>
          </div>
        ) : null}

        {tab === "ventas" ? (
          <div className="sales-sectionBody">
            <div className="sales-tableWrap">
              <GlobalDivTable
                ariaLabel="Listado de ventas registradas"
                bodyClassName="entity-table-wrap"
                className="sales-globalTable"
                gridClassName="sales-grid sales-grid--sales"
                columns={[
                  "Venta",
                  "Comprador",
                  "Productos",
                  "Cobro",
                  "Total",
                  "Estado",
                  "Acciones",
                ]}
              >
                {loading && !sales.length ? <Empty loading /> : null}
                {!loading && !sales.length ? (
                  <Empty text="No hay ventas para los filtros seleccionados." />
                ) : null}
                {sales.map((item) => (
                  <div
                    className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row sales-grid sales-grid--sales"
                    role="row"
                    key={item.id_venta}
                  >
                    <div className="mov-gridCell entity-main-cell">
                      <strong>{item.codigo}</strong>
                      <small>
                        {formatDate(item.fecha)} · {item.configuracion_nombre}
                      </small>
                    </div>
                    <div className="mov-gridCell entity-main-cell">
                      <strong>
                        {item.comprador_nombre_snapshot || "VENTA ANÓNIMA"}
                      </strong>
                      <small>
                        {item.comprador_documento_snapshot ||
                          item.comprador_tipo}
                      </small>
                    </div>
                    <div className="mov-gridCell entity-main-cell">
                      <strong>{item.items.length} ítem(s)</strong>
                      <small>
                        {item.items
                          .map(
                            (line) =>
                              `${number(line.cantidad)} ${line.producto_nombre_snapshot}`,
                          )
                          .join(" · ")}
                      </small>
                    </div>
                    <div className="mov-gridCell entity-main-cell">
                      <strong>{item.medio_pago_nombre}</strong>
                      <small>
                        {item.id_ingreso_contable
                          ? `Ingreso #${item.id_ingreso_contable}`
                          : "Sin asiento contable"}
                      </small>
                    </div>
                    <div className="mov-gridCell is-right is-strong">
                      {money(item.total)}
                    </div>
                    <div className="mov-gridCell is-center">
                      <StatusBadge state={item.estado} />
                    </div>
                    <div className="mov-gridCell mov-gridCell--actions">
                      <div className="mov-actionsInline">
                        {writable ? (
                          <button
                            type="button"
                            className="mov-iconBtn"
                            onClick={() => editSale(item)}
                            title="Editar"
                            aria-label="Editar"
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                        ) : null}
                        {writable && item.estado !== "CONFIRMADA" ? (
                          <button
                            type="button"
                            className="mov-iconBtn"
                            onClick={() => changeSaleState(item, "CONFIRMADA")}
                            title="Confirmar"
                            aria-label="Confirmar"
                          >
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                        ) : null}
                        {writable && item.estado === "CONFIRMADA" ? (
                          <button
                            type="button"
                            className="mov-iconBtn"
                            onClick={() => changeSaleState(item, "PENDIENTE")}
                            title="Pasar a pendiente"
                            aria-label="Pasar a pendiente"
                          >
                            <FontAwesomeIcon icon={faArrowRotateLeft} />
                          </button>
                        ) : null}
                        {writable && item.estado !== "ANULADA" ? (
                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() =>
                              setSaleAction({ type: "baja", item })
                            }
                            title="Dar de baja"
                            aria-label="Dar de baja"
                          >
                            <FontAwesomeIcon icon={faBan} />
                          </button>
                        ) : null}
                        {writable ? (
                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() =>
                              setSaleAction({ type: "eliminar", item })
                            }
                            title="Eliminar"
                            aria-label="Eliminar"
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </GlobalDivTable>
            </div>
            <div className="sales-tableFooter">
              <SalesSummary stats={registeredSalesStats} />
              <div className="sales-lower-actions">
                {writable ? (
                  <button
                    type="button"
                    className="mov-btn mov-btn--primary"
                    onClick={openNewSale}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Registrar venta
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </ModulePage>

      <ProductoVentaModal
        form={productForm}
        setForm={setProductForm}
        saving={saving}
        onSubmit={submitProduct}
      />

      <VentaModal
        form={saleForm}
        setForm={setSaleForm}
        catalogs={catalogs}
        saving={saving}
        onSubmit={submitSale}
        partnerSearch={partnerSearch}
        setPartnerSearch={setPartnerSearch}
        partnerLoading={partnerLoading}
        partners={partners}
        setPartners={setPartners}
        updateSaleItem={updateSaleItem}
        activeConfig={activeConfig}
        subtotal={saleSubtotal}
        total={saleTotal}
      />

      <ModalEliminarGlobal
        open={Boolean(productAction)}
        operacion="baja"
        icon={faToggleOff}
        row={productAction}
        onClose={() => setProductAction(null)}
        onConfirm={confirmProductDeactivation}
        title="Desactivar producto"
        message="El producto dejará de estar disponible para nuevas ventas, pero conservará su información y movimientos anteriores."
        warning="Podrás reactivarlo desde esta misma tabla cuando lo necesites."
        confirmLabel="Desactivar"
        loadingLabel="Desactivando..."
        loadingMessage="Desactivando producto…"
        successMessage="Producto desactivado correctamente."
        errorMessage="No se pudo desactivar el producto."
        details={[
          { label: "Producto", value: productAction?.nombre },
          { label: "Código", value: productAction?.codigo || "SIN CÓDIGO" },
          {
            label: "Stock",
            value: productAction?.controla_stock
              ? number(productAction?.stock_actual)
              : "SIN CONTROL",
          },
          {
            label: "Estado",
            value: productAction?.activo ? "ACTIVO" : "INACTIVO",
          },
        ]}
      />

      <ModalEliminarGlobal
        open={Boolean(saleAction)}
        operacion={saleAction?.type === "baja" ? "baja" : "eliminar"}
        icon={saleAction?.type === "baja" ? faBan : faTrashCan}
        row={saleAction?.item}
        onClose={() => setSaleAction(null)}
        onConfirm={confirmSaleAction}
        title={
          saleAction?.type === "baja" ? "Dar de baja venta" : "Eliminar venta"
        }
        message={
          saleAction?.type === "baja"
            ? "La venta quedará anulada y se revertirán sus impactos de stock y contabilidad."
            : "La venta y sus ítems se eliminarán definitivamente. Sus impactos de stock y contabilidad se revertirán antes de eliminarla."
        }
        warning={
          saleAction?.type === "baja"
            ? "Podrás volver a confirmarla más adelante si fuera necesario."
            : "Esta acción no se puede deshacer. La auditoría conservará el registro de la eliminación."
        }
        confirmLabel={saleAction?.type === "baja" ? "Dar de baja" : "Eliminar"}
        loadingMessage={
          saleAction?.type === "baja"
            ? "Dando de baja la venta…"
            : "Eliminando la venta…"
        }
        successMessage={
          saleAction?.type === "baja"
            ? "Venta dada de baja correctamente."
            : "Venta eliminada correctamente."
        }
        errorMessage={
          saleAction?.type === "baja"
            ? "No se pudo dar de baja la venta."
            : "No se pudo eliminar la venta."
        }
        details={[
          { label: "Venta", value: saleAction?.item?.codigo },
          {
            label: "Comprador",
            value:
              saleAction?.item?.comprador_nombre_snapshot || "VENTA ANÓNIMA",
          },
          { label: "Total", value: money(saleAction?.item?.total) },
          { label: "Estado", value: saleAction?.item?.estado },
        ]}
      />

      <ModuleFeedback
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </>
  );
}
