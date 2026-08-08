import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCalendarDays,
  faChartColumn,
  faCircleCheck,
  faClock,
  faComments,
  faCreditCard,
  faDollarSign,
  faMessage,
  faMoneyBillTransfer,
  faSpinner,
  faTriangleExclamation,
  faUserPlus,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { botPanelGet } from "../api/botApi";
import { useModalEscapeStack } from "./useModalEscapeStack";
import "./ReportesBotModal.css";

const MONTHS = [
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
];

const formatNumber = (value) =>
  new Intl.NumberFormat("es-AR").format(Number(value || 0));

const formatMoneyArs = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(value));
};

const formatUsd = (value, digits = 4) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `US$ ${Number(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const periodLabel = (value) => {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return value || "";
  return `${MONTHS[month - 1]} ${year}`;
};

const normalizePeriod = (year, month) =>
  `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;

const MetricCard = ({ icon, label, value, detail, tone = "normal" }) => (
  <div className={`wp-report-card is-${tone}`}>
    <div className="wp-report-card-icon" aria-hidden="true">
      <FontAwesomeIcon icon={icon} />
    </div>
    <div className="wp-report-card-body">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  </div>
);

const DetailRow = ({ label, value, hint, strong = false }) => (
  <div className={`wp-report-detail-row ${strong ? "is-strong" : ""}`}>
    <div>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
    <b>{value}</b>
  </div>
);

const ReportesBotModal = ({ open, onClose }) => {
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(() =>
    normalizePeriod(now.getFullYear(), now.getMonth() + 1)
  );
  const [tab, setTab] = useState("resumen");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useModalEscapeStack(open, onClose);

  const fetchReport = useCallback(async (targetPeriod) => {
    const [anio, mes] = String(targetPeriod || "").split("-").map(Number);
    if (!anio || !mes) return;

    setLoading(true);
    setError("");
    try {
      const response = await botPanelGet("panel_reportes", { anio, mes });
      setData(response);
    } catch (e) {
      setError("No se pudo cargar el reporte. Intentá nuevamente en unos momentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab("resumen");
    fetchReport(period);
  }, [open, period, fetchReport]);


  const periodOptions = useMemo(() => {
    const current = normalizePeriod(now.getFullYear(), now.getMonth() + 1);
    const raw = Array.isArray(data?.periodos_disponibles)
      ? data.periodos_disponibles
      : [];
    return [...new Set([current, period, ...raw].filter(Boolean))].sort().reverse();
  }, [data, now, period]);

  if (!open) return null;

  const resumen = data?.resumen || {};
  const actividad = data?.actividad || {};
  const pagos = data?.pagos || {};
  const recordatorios = data?.recordatorios || {};
  const costos = data?.costos || {};
  const tracking = !!recordatorios.seguimiento_entrega_disponible;
  const historicalReconciled = !!recordatorios.historico_conciliado_meta;
  const hasDeliveryData = tracking || historicalReconciled;
  const taxConfigured = !!costos.impuesto_configurado;
  const taxUsesRealAmount = !!costos.impuesto_importe_real;
  const rateDia01 = Number(recordatorios?.plantillas?.dia_01?.tarifa_usd || 0);
  const rateDia15 = Number(recordatorios?.plantillas?.dia_15?.tarifa_usd || 0);
  const sameRate = Math.abs(rateDia01 - rateDia15) < 0.0000001;

  const costModeLabel = (() => {
    switch (costos.modo_calculo) {
      case "confirmado_por_entrega":
        return "Costo confirmado por entrega";
      case "estimado_con_pendientes":
        return "Estimación con entregas pendientes";
      case "historico_conciliado_meta":
        return "Conciliado con WhatsApp Manager";
      default:
        return "Estimación histórica";
    }
  })();

  return (
    <div className="wp-report-backdrop" role="dialog" aria-modal="true" aria-label="Reportes del bot">
      <div className="wp-report-modal">
        <header className="wp-report-head">
          <div className="wp-report-head-title">
            <span className="wp-report-head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faChartColumn} />
            </span>
            <div>
              <span className="wp-report-eyebrow">WhatsApp · Bot</span>
              <h2>Reportes del Bot</h2>
              <p>Actividad, contactos, pagos y costos mensuales de WhatsApp.</p>
            </div>
          </div>

          <div className="wp-report-head-actions">
            <label className="wp-report-period">
              <FontAwesomeIcon icon={faCalendarDays} />
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                aria-label="Período del reporte"
                disabled={loading}
              >
                {periodOptions.map((item) => (
                  <option key={item} value={item}>{periodLabel(item)}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="wp-report-close"
              onClick={onClose}
              aria-label="Cerrar reportes"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </header>

        <nav className="wp-report-tabs" aria-label="Secciones del reporte">
          {[
            ["resumen", "Resumen"],
            ["actividad", "Actividad"],
            ["pagos", "Pagos"],
            ["costos", "Costos WhatsApp"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={tab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="wp-report-body">
          {error ? (
            <div className="wp-report-error">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <div>
                <b>No se pudo cargar el reporte</b>
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="wp-report-loading">
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>Cargando métricas del bot…</span>
            </div>
          ) : null}

          {!error && data && tab === "resumen" ? (
            <div className="wp-report-section">
              <div className="wp-report-section-title">
                <div>
                  <h3>Resumen de {periodLabel(data?.periodo?.clave || period)}</h3>
                  <p>Los indicadores principales para entender el uso real del bot durante el mes.</p>
                </div>
              </div>

              <div className="wp-report-grid">
                <MetricCard
                  icon={faUsers}
                  label="Contactos acumulados"
                  value={formatNumber(resumen.contactos_total_fin_mes)}
                  detail="Total existente al cierre del período"
                />
                <MetricCard
                  icon={faUserPlus}
                  label="Contactos nuevos"
                  value={formatNumber(resumen.contactos_nuevos)}
                  detail="Se agregaron durante el mes"
                  tone="good"
                />
                <MetricCard
                  icon={faArrowTrendUp}
                  label="Contactos con actividad"
                  value={formatNumber(resumen.contactos_con_actividad)}
                  detail="Tuvieron al menos un mensaje"
                />
                <MetricCard
                  icon={faMessage}
                  label="Mensajes recibidos"
                  value={formatNumber(resumen.mensajes_recibidos)}
                  detail={`${formatNumber(resumen.personas_que_escribieron)} personas escribieron`}
                />
                <MetricCard
                  icon={faComments}
                  label="Mensajes enviados por el bot"
                  value={formatNumber(resumen.mensajes_enviados_bot)}
                  detail="Incluye respuestas y recordatorios enviados"
                />
                <MetricCard
                  icon={faMoneyBillTransfer}
                  label="Socios que pagaron por el bot"
                  value={formatNumber(resumen.socios_pagaron_bot)}
                  detail="Pagos gestionados desde WhatsApp"
                  tone="good"
                />
              </div>

              <div className="wp-report-summary-strip">
                <div>
                  <span>{hasDeliveryData ? "Recordatorios cobrables" : "Recordatorios enviados"}</span>
                  <b>{formatNumber(hasDeliveryData ? recordatorios.entregados : recordatorios.aceptados)}</b>
                  <small>
                    {historicalReconciled
                      ? `Entregados y cobrados: ${formatNumber(recordatorios.entregados)} · Enviados: ${formatNumber(recordatorios.aceptados)}`
                      : `Día 1: ${formatNumber(recordatorios.dia_01)} · Día 15: ${formatNumber(recordatorios.dia_15)}`}
                  </small>
                </div>
                <div>
                  <span>Gasto WhatsApp de recordatorios</span>
                  <b>{formatUsd(costos.costo_mostrado_usd)}</b>
                  <small>{costModeLabel}</small>
                </div>
                <div>
                  <span>Conversión de referencia</span>
                  <b>{formatMoneyArs(costos.total_ars)}</b>
                  <small>{taxConfigured ? `Incluye percepción ARCA del ${Number(costos.impuesto_pct || 0).toLocaleString("es-AR")}%` : "Percepción no disponible"}</small>
                </div>
              </div>
            </div>
          ) : null}

          {!error && data && tab === "actividad" ? (
            <div className="wp-report-section">
              <div className="wp-report-section-title">
                <div>
                  <h3>Actividad del bot</h3>
                  <p>Volumen de conversación y atención registrada durante el período.</p>
                </div>
              </div>

              <div className="wp-report-grid is-activity">
                <MetricCard icon={faComments} label="Mensajes totales" value={formatNumber(actividad.mensajes_total)} />
                <MetricCard icon={faMessage} label="Recibidos" value={formatNumber(actividad.mensajes_recibidos)} tone="good" />
                <MetricCard icon={faChartColumn} label="Enviados por el bot" value={formatNumber(actividad.mensajes_enviados_bot)} />
                <MetricCard icon={faUsers} label="Personas que escribieron" value={formatNumber(actividad.personas_que_escribieron)} />
                <MetricCard icon={faTriangleExclamation} label="Mensajes de prioridad alta" value={formatNumber(actividad.prioridad_alta)} tone="warn" />
                <MetricCard icon={faCircleCheck} label="Consultas atendidas" value={`${formatNumber(actividad.consultas_atendidas)} / ${formatNumber(actividad.consultas)}`} tone="good" />
              </div>

              <div className="wp-report-panel">
                <h4>Lectura rápida</h4>
                <DetailRow label="Contactos con alguna actividad" value={formatNumber(actividad.contactos_con_actividad)} />
                <DetailRow label="Personas que iniciaron interacción" value={formatNumber(actividad.personas_que_escribieron)} />
                <DetailRow label="Consultas que pidieron atención" value={formatNumber(actividad.consultas)} />
                <DetailRow label="Consultas marcadas como atendidas" value={formatNumber(actividad.consultas_atendidas)} />
              </div>
            </div>
          ) : null}

          {!error && data && tab === "pagos" ? (
            <div className="wp-report-section">
              <div className="wp-report-section-title">
                <div>
                  <h3>Pagos gestionados por el bot</h3>
                  <p>Resumen de los pagos gestionados desde WhatsApp durante el período.</p>
                </div>
              </div>

              <div className="wp-report-grid is-payments">
                <MetricCard
                  icon={faUsers}
                  label="Socios que pagaron"
                  value={formatNumber(pagos.socios_pagaron)}
                  detail={`${formatNumber(pagos.operaciones)} pagos registrados`}
                  tone="good"
                />
                <MetricCard
                  icon={faCreditCard}
                  label="Cuotas registradas"
                  value={formatNumber(pagos.cuotas_registradas)}
                  detail="Cuotas abonadas durante el período"
                />
                <MetricCard
                  icon={faMoneyBillTransfer}
                  label="Monto gestionado"
                  value={formatMoneyArs(pagos.monto_total)}
                  detail="Total abonado mediante WhatsApp"
                  tone="good"
                />
              </div>

              {Array.isArray(pagos.detalle) && pagos.detalle.length ? (
                <div className="wp-report-payment-history">
                  <div className="wp-report-payment-history-head">
                    <div>
                      <h4>Detalle de pagos del mes</h4>
                      <span>Persona, fecha, períodos abonados y monto.</span>
                    </div>
                    <b>{formatNumber(pagos.detalle.length)}</b>
                  </div>

                  <div className="wp-report-payment-list">
                    {pagos.detalle.map((pago, index) => {
                      const periods = Array.isArray(pago.periodos) ? pago.periodos : [];

                      return (
                        <div className="wp-report-payment-item" key={`${pago.fecha || "pago"}-${index}`}>
                          <div className="wp-report-payment-main">
                            <div className="wp-report-payment-person">
                              <strong>{pago.socio || "Socio"}</strong>
                              <span>{formatDateTime(pago.fecha)}</span>
                            </div>
                            <div className="wp-report-payment-periods">
                              {periods.map((item) => <span key={item}>{item}</span>)}
                            </div>
                          </div>

                          <div className="wp-report-payment-side">
                            <strong>{formatMoneyArs(pago.monto)}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="wp-report-info-box">
                  <FontAwesomeIcon icon={faCircleCheck} />
                  <div>
                    <b>Sin pagos gestionados por el bot en este período</b>
                    <span>No se registraron pagos gestionados desde WhatsApp durante este período.</span>
                  </div>
                </div>
              )}

              <div className="wp-report-info-box">
                <FontAwesomeIcon icon={faCircleCheck} />
                <div>
                  <b>Información enfocada en pagos del bot</b>
                  <span>El reporte muestra únicamente pagos que fueron gestionados o confirmados a través de WhatsApp.</span>
                </div>
              </div>
            </div>
          ) : null}

          {!error && data && tab === "costos" ? (
            <div className="wp-report-section">
              <div className="wp-report-section-title is-cost">
                <div>
                  <h3>Costos de recordatorios por WhatsApp</h3>
                  <p>Detalle del día 1 y día 15, con cálculo mensual y control de entrega.</p>
                </div>
                <span className={`wp-report-status ${tracking || historicalReconciled ? "is-good" : "is-warn"}`}>
                  <FontAwesomeIcon icon={tracking || historicalReconciled ? faCircleCheck : faClock} />
                  {tracking
                    ? "Datos de entrega disponibles"
                    : historicalReconciled
                      ? "Mes conciliado con Meta"
                      : "Mes estimado"}
                </span>
              </div>

              <div className="wp-report-reminder-grid">
                <div className="wp-report-reminder-card">
                  <div className="wp-report-reminder-top">
                    <span>Día 1</span>
                    <b>{formatNumber(recordatorios.dia_01)}</b>
                  </div>
                  <strong>Recordatorio general</strong>
                  <div className="wp-report-reminder-price">
                    {formatUsd(rateDia01, 4)} <span>por mensaje</span>
                  </div>
                </div>

                <div className="wp-report-reminder-card">
                  <div className="wp-report-reminder-top">
                    <span>Día 15</span>
                    <b>{formatNumber(recordatorios.dia_15)}</b>
                  </div>
                  <strong>Cuota pendiente</strong>
                  <div className="wp-report-reminder-price">
                    {formatUsd(rateDia15, 4)} <span>por mensaje</span>
                  </div>
                </div>
              </div>

              <div className="wp-report-panel is-cost-breakdown">
                <h4>Envíos del período</h4>
                <DetailRow
                  label="Recordatorios enviados"
                  value={formatNumber(recordatorios.aceptados)}
                  hint="Cantidad de recordatorios enviados durante el período"
                />
                <DetailRow
                  label="Entregados y cobrados"
                  value={hasDeliveryData ? formatNumber(recordatorios.entregados) : "Sin dato histórico"}
                  hint={historicalReconciled
                    ? "Dato verificado con las estadísticas de WhatsApp"
                    : "Solo los mensajes entregados generan costo"}
                />
                <DetailRow
                  label="Leídos"
                  value={tracking ? formatNumber(recordatorios.leidos) : "Sin dato histórico"}
                />
                <DetailRow
                  label="Fallidos"
                  value={tracking ? formatNumber(recordatorios.fallidos) : "Sin dato histórico"}
                />
                {tracking && Number(recordatorios.pendientes_estado || 0) > 0 ? (
                  <DetailRow
                    label="Pendientes de entrega"
                    value={formatNumber(recordatorios.pendientes_estado)}
                    hint="Enviados y todavía sin confirmación de entrega"
                  />
                ) : null}
                {historicalReconciled && Number(recordatorios.historico_no_cobrados || 0) > 0 ? (
                  <DetailRow
                    label="Enviados sin entrega ni cargo"
                    value={formatNumber(recordatorios.historico_no_cobrados)}
                    hint="Mensajes enviados que no generaron cargo porque no fueron entregados"
                  />
                ) : null}
              </div>

              <div className="wp-report-cost-formula">
                <div className="wp-report-cost-main">
                  <span>Costo de recordatorios</span>
                  <strong>
                    {sameRate
                      ? `${formatNumber(costos.mensajes_para_calculo)} mensajes cobrables × ${formatUsd(rateDia01, 4)}`
                      : "Tarifa según plantilla"}
                  </strong>
                  <b>= {formatUsd(costos.costo_mostrado_usd)}</b>
                  <small>{costModeLabel}</small>
                </div>

                {historicalReconciled ? (
                  <div className="wp-report-cost-secondary">
                    <span>Costo según tarifa</span>
                    <b>{formatUsd(costos.costo_por_tarifa_usd, 4)}</b>
                    <small>Referencia calculada según la tarifa por mensaje</small>
                  </div>
                ) : tracking && costos.costo_confirmado_usd !== null ? (
                  <div className="wp-report-cost-secondary">
                    <span>Costo de mensajes entregados</span>
                    <b>{formatUsd(costos.costo_confirmado_usd)}</b>
                  </div>
                ) : null}
              </div>

              <div className="wp-report-panel is-ars">
                <h4>Conversión a pesos</h4>
                <DetailRow
                  label={costos?.tipo_cambio?.es_historico ? "Cotización histórica USD → ARS" : "Cotización USD → ARS de referencia"}
                  value={costos?.tipo_cambio?.valor ? `$ ${Number(costos.tipo_cambio.valor).toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "No disponible"}
                  hint={costos?.tipo_cambio?.es_historico ? "Cotización utilizada para este período" : "Cotización de referencia vigente"}
                />
                <DetailRow
                  label="Costo base estimado"
                  value={formatMoneyArs(costos.base_ars)}
                />
                <DetailRow
                  label="Percepción ARCA"
                  value={taxConfigured ? `${Number(costos.impuesto_pct || 0).toLocaleString("es-AR")}% · ${formatMoneyArs(costos.impuesto_ars)}` : "No disponible"}
                  hint={taxUsesRealAmount
                    ? `Importe real del resumen bancario. El 30% fue aplicado sobre una base de ${formatMoneyArs(costos.base_percepcion_ars)}, que puede diferir de la conversión usada para el cargo de Meta.`
                    : taxConfigured
                      ? "Percepción estimada a cuenta de Ganancias/Bienes Personales según RG 5617."
                      : "No hay información de percepción disponible para este período."}
                />
                <DetailRow
                  label={taxUsesRealAmount ? "Total real debitado en pesos" : taxConfigured ? "Costo final estimado en pesos" : "Referencia en pesos, sin percepción"}
                  value={formatMoneyArs(costos.total_ars)}
                  strong
                />
              </div>

              <div className="wp-report-meta-note">
                <FontAwesomeIcon icon={faDollarSign} />
                <div>
                  <b>Tarifa de referencia Argentina</b>
                  <span>
                    Marketing Argentina: {formatUsd(costos.tarifa_marketing_usd, 4)} por mensaje entregado. La percepción ARCA del {Number(costos.impuesto_pct || 0).toLocaleString("es-AR")}% se muestra por separado para que el costo mensual sea claro.
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ReportesBotModal;
