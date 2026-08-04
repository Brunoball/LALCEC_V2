import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faCalendarDays,
  faCircleCheck,
  faRotateRight,
  faTags,
  faTriangleExclamation,
  faUsers,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { dashboardApi } from "./api/dashboardApi";
import "./Dashboard.css";

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const EMPTY = {
  periodo: {},
  socios: {},
  familias: {},
  categorias: {},
  contable: {},
  estado: {},
  serie: [],
  movimientos_recientes: [],
};

function MetricCard({ icon, title, value, tone = "default" }) {
  return (
    <article className={`admin-dashboard__metric is-${tone}`}>
      <div className="admin-dashboard__metricIcon">
        <FontAwesomeIcon icon={icon} />
      </div>
      <div className="admin-dashboard__metricBody">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ProgressItem({ icon, label, value, detail }) {
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <article className="admin-dashboard__progressItem">
      <div className="admin-dashboard__progressHead">
        <span>
          <FontAwesomeIcon icon={icon} />
          {label}
        </span>
        <strong>{normalized}%</strong>
      </div>
      <div
        className="admin-dashboard__progressTrack"
        aria-label={`${label}: ${normalized}%`}
      >
        <i style={{ width: `${normalized}%` }} />
      </div>
      <small>{detail}</small>
    </article>
  );
}

function Chart({ items }) {
  const maximum = useMemo(
    () =>
      Math.max(
        1,
        ...items.flatMap((item) => [
          Number(item.ingresos || 0),
          Number(item.egresos || 0),
        ]),
      ),
    [items],
  );

  return (
    <div
      className="admin-dashboard__chart"
      role="img"
      aria-label="Ingresos y egresos de los últimos seis meses"
    >
      <div className="admin-dashboard__chartGrid" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="admin-dashboard__chartColumns">
        {items.map((item) => {
          const incomeValue = Number(item.ingresos || 0);
          const expenseValue = Number(item.egresos || 0);
          const incomeHeight =
            incomeValue > 0 ? Math.max(3, (incomeValue / maximum) * 100) : 0;
          const expenseHeight =
            expenseValue > 0 ? Math.max(3, (expenseValue / maximum) * 100) : 0;
          return (
            <div className="admin-dashboard__chartMonth" key={item.periodo}>
              <div className="admin-dashboard__bars">
                <i
                  className="is-income"
                  style={{ height: `${incomeHeight}%` }}
                  title={`Ingresos: ${money(item.ingresos)}`}
                />
                <i
                  className="is-expense"
                  style={{ height: `${expenseHeight}%` }}
                  title={`Egresos: ${money(item.egresos)}`}
                />
              </div>
              <strong>{item.etiqueta}</strong>
              <small>{String(item.anio || "").slice(-2)}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    dashboardApi
      .resumen({ signal: controller.signal })
      .then((response) => setSummary(response.resumen || EMPTY))
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") {
          setError(
            requestError?.message ||
              "No se pudo cargar el panel de administración.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const { socios, contable, estado, periodo } = summary;
  const balance = Number(contable.saldo_mes || 0);
  const complete = Boolean(estado.configuracion_completa);
  const pendingConfig = estado.configuracion_pendientes || [];

  const statusItems = [
    {
      icon: faUsers,
      label: "Socios con familia",
      value: estado.socios_con_familia,
      detail: `${Number(socios.con_familia || 0)} de ${Number(socios.activos || 0)} socios activos`,
    },
    {
      icon: faTags,
      label: "Socios con categoría",
      value: estado.socios_con_categoria,
      detail: `${Number(socios.con_categoria || 0)} socios con al menos una categoría activa`,
    },
    {
      icon: complete ? faCircleCheck : faTriangleExclamation,
      label: "Configuración contable",
      value: estado.configuracion_contable,
      detail: complete
        ? "Listas y medios de pago listos para operar"
        : `${pendingConfig.length} lista${pendingConfig.length === 1 ? "" : "s"} pendiente${pendingConfig.length === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className="admin-dashboard">
      <header className="admin-dashboard__header">
        <div>
          <h1>Panel de gestión</h1>
        </div>
        <div className="admin-dashboard__period">
          <FontAwesomeIcon icon={faCalendarDays} />
          <span>{periodo.mes_nombre || "MES ACTUAL"}</span>
          <strong>{periodo.anio || new Date().getFullYear()}</strong>
        </div>
      </header>

      {error ? (
        <div className="admin-dashboard__error" role="alert">
          <div>
            <strong>No se pudo cargar el dashboard</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <FontAwesomeIcon icon={faRotateRight} /> Reintentar
          </button>
        </div>
      ) : null}

      <div className={`admin-dashboard__body ${loading ? "is-loading" : ""}`}>
        <section className="admin-dashboard__metrics">
          <MetricCard
            icon={faUsers}
            title="Socios activos"
            value={Number(socios.activos || 0)}
          />
          <MetricCard
            icon={faArrowTrendUp}
            title="Ingresos del mes"
            value={money(contable.ingresos_mes)}
            tone="income"
          />
          <MetricCard
            icon={faArrowTrendDown}
            title="Egresos del mes"
            value={money(contable.egresos_mes)}
            tone="expense"
          />
          <MetricCard
            icon={faWallet}
            title="Saldo del mes"
            value={money(contable.saldo_mes)}
            tone={balance < 0 ? "danger" : "balance"}
          />
        </section>

        <div className="admin-dashboard__mainGrid">
          <article className="admin-dashboard__panel admin-dashboard__panel--chart">
            <header className="admin-dashboard__panelHead">
              <div>
                <h2>Movimiento contable</h2>
                <p>Ingresos y egresos de los últimos seis meses.</p>
              </div>
              <div className="admin-dashboard__legend">
                <span>
                  <i className="is-income" /> Ingresos
                </span>
                <span>
                  <i className="is-expense" /> Egresos
                </span>
              </div>
            </header>
            <Chart items={summary.serie || []} />
          </article>

          <aside className="admin-dashboard__panel admin-dashboard__panel--status">
            <header className="admin-dashboard__panelHead admin-dashboard__panelHead--status">
              <div>
                <h2>Estado de la administración</h2>
                <p>Controles rápidos sobre la información principal.</p>
              </div>
              <span
                className={`admin-dashboard__statusChip ${complete ? "is-complete" : "is-pending"}`}
              >
                <FontAwesomeIcon
                  icon={complete ? faCircleCheck : faTriangleExclamation}
                />
                {complete ? "Contable listo" : "Configuración pendiente"}
              </span>
            </header>
            <div className="admin-dashboard__progressList">
              {statusItems.map((item) => (
                <ProgressItem key={item.label} {...item} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
