import React, { useMemo, useState } from "react";
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
import ModuleFeedback from "../Global/ModuleFeedback";
import { FloatingField } from "../Global/Formularios/TabbedForm";
import { canWrite } from "../_shared/auth/session";
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

const emptyForm = () => ({
  id_socio: "",
  anio: String(currentYear),
  mes: String(currentMonth),
  fecha_pago: localToday(),
  monto: "",
  id_medio_pago: "",
});

export default function Cuotas() {
  const writable = canWrite();
  const [tipo, setTipo] = useState("PERSONA");
  const [estado, setEstado] = useState("DEUDORES");
  const [buscar, setBuscar] = useState("");
  const [categoria, setCategoria] = useState("");
  const [anio, setAnio] = useState(String(currentYear));
  const [mes, setMes] = useState(String(currentMonth));
  const [feedback, setFeedback] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);

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

  const applyPartnerDefaults = (partnerId, base = paymentForm) => {
    const partner = partners.find(
      (item) => String(item.id_socio) === String(partnerId),
    );
    setPaymentForm({
      ...base,
      id_socio: String(partnerId || ""),
      monto: partner ? String(partner.monto_sugerido || "") : "",
      id_medio_pago: partner?.id_medio_pago
        ? String(partner.id_medio_pago)
        : String(catalogos.medios_pago?.[0]?.id_medio_pago || ""),
    });
  };

  const openPayment = (row = null) => {
    setFeedback(null);
    const next = {
      ...emptyForm(),
      id_socio: String(row?.id_socio || partners?.[0]?.id_socio || ""),
      anio: String(row?.anio || anio),
      mes: String(row?.mes || mes),
    };
    const partner = partners.find(
      (item) => String(item.id_socio) === String(next.id_socio),
    );
    setPaymentForm({
      ...next,
      monto: String(row?.monto_sugerido || partner?.monto_sugerido || ""),
      id_medio_pago: String(
        row?.id_medio_pago_preferido ||
          partner?.id_medio_pago ||
          catalogos.medios_pago?.[0]?.id_medio_pago ||
          "",
      ),
    });
    setPaymentOpen(true);
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!paymentForm.id_socio) {
      setFeedback({ type: "error", message: `Seleccioná un ${tipo === "EMPRESA" ? "empresa" : "socio"}.` });
      return;
    }
    if (!paymentForm.id_medio_pago) {
      setFeedback({ type: "error", message: "Seleccioná el medio de pago." });
      return;
    }
    if (!paymentForm.fecha_pago) {
      setFeedback({ type: "error", message: "Completá la fecha de pago." });
      return;
    }
    if (!(Number(paymentForm.monto) > 0)) {
      setFeedback({ type: "error", message: "El monto debe ser mayor a cero." });
      return;
    }

    setSaving(true);
    try {
      const response = await cuotasApi.registrarPago({
        id_socio: Number(paymentForm.id_socio),
        anio: Number(paymentForm.anio),
        mes: Number(paymentForm.mes),
        fecha_pago: paymentForm.fecha_pago,
        monto: Number(paymentForm.monto),
        id_medio_pago: Number(paymentForm.id_medio_pago),
      });
      setPaymentOpen(false);
      setAnio(String(paymentForm.anio));
      setMes(String(paymentForm.mes));
      setEstado("PAGADOS");
      setFeedback({ type: "success", message: response.mensaje });
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

  const pageFilters = [
    {
      key: "tipo",
      type: "tabs",
      label: "Tipo",
      ariaLabel: "Secciones de cuotas",
      value: tipo,
      onChange: (value) => {
        setTipo(value);
        setBuscar("");
        setCategoria("");
      },
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
      onChange: setEstado,
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
      onChange: setAnio,
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
      onChange: setMes,
      includeEmptyOption: false,
      options: (catalogos.meses || []).map((item) => ({
        value: item.id_mes,
        label: item.nombre,
      })),
      className: "cuotas-month-filter",
    },
  ];

  const isPaid = estado === "PAGADOS";
  const entityLabel = tipo === "EMPRESA" ? "empresa" : "socio";
  const tableLabel = `Cuotas de ${tipo === "EMPRESA" ? "empresas" : "socios"} ${isPaid ? "pagadas" : "adeudadas"}`;
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
    : [
        tipo === "EMPRESA" ? "Empresa" : "Socio",
        tipo === "EMPRESA" ? "CUIT" : "DNI",
        "Categoría",
        "Período",
        "Importe sugerido",
        "Acciones",
      ];

  return (
    <>
      <ModulePage
        title="Cuotas"
        description="Control mensual de cuotas de socios y empresas."
        filters={pageFilters}
        tabsInTitle
        headFiltersClassName="cuotas-head-filters"
        primaryActionLabel="Registrar pago"
        onPrimaryAction={() => openPayment()}
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
              : "Según la categoría actual",
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

        <GlobalDivTable
          className="cuotas-table"
          bodyClassName="entity-table-wrap"
          gridClassName={isPaid ? "cuotas-grid cuotas-grid--paid" : "cuotas-grid cuotas-grid--debt"}
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

          {items.map((item) => (
            <div
              className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row cuotas-grid ${isPaid ? "cuotas-grid--paid" : "cuotas-grid--debt"}`}
              role="row"
              key={item.id_pago || `${item.id_socio}-${item.anio}-${item.mes}`}
            >
              <div className="mov-gridCell entity-main-cell">
                <strong>{item.denominacion || `ID ${item.id_socio}`}</strong>
                <small>
                  {item.estado_socio === "INACTIVO"
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
                  {Number(item.monto_sugerido || 0) > 0
                    ? money(item.monto_sugerido)
                    : "A DEFINIR"}
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
          ))}
        </GlobalDivTable>
      </ModulePage>

      <CrudModal
        open={paymentOpen}
        title="Registrar pago de cuota"
        subtitle={`Completá el cobro mensual del ${entityLabel}.`}
        onClose={() => !saving && setPaymentOpen(false)}
        onSubmit={submitPayment}
        saving={saving}
        submitLabel="Registrar pago"
        wide
        modalClassName="cuotas-payment-modal"
      >
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
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  anio: event.target.value,
                }))
              }
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
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  mes: event.target.value,
                }))
              }
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
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  fecha_pago: event.target.value,
                }))
              }
              aria-label="Fecha de pago *"
            />
          </FloatingField>

          <FloatingField label="Monto *" active={Boolean(paymentForm.monto)}>
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

        <div className="cuotas-payment-summary">
          <span>
            <FontAwesomeIcon icon={faReceipt} /> Resumen del cobro
          </span>
          <strong>{selectedPartner?.denominacion || "Seleccioná un registro"}</strong>
          <small>
            {selectedPartner?.categoria || "SIN CATEGORÍA"} · Importe a registrar: {money(paymentForm.monto)}
          </small>
        </div>
      </CrudModal>

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
