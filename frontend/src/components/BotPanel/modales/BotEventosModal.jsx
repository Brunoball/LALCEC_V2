import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircle,
  faRobot,
  faSpinner,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  fmtFechaEvento,
  fmtMoneyARS,
  isImageComprobante,
  isPdfComprobante,
  pickComprobanteInfo,
} from "../utils/botPanelUtils";
import { useModalEscapeStack } from "./useModalEscapeStack";
import "./BotEventosModal.css";

const BotEventosModal = ({
  open,
  onClose,
  eventos,
  resumen,
  loading,
  error,
  onRefresh,
  onMarkOne,
  onDeleteOne,
  onOpenChat,
  onAprobarComprobante,
  onRechazarComprobante,
}) => {
  useModalEscapeStack(open, onClose);

  if (!open) return null;

  const pendientes = Number(resumen?.pendientes || 0);
  const hasEventos = Array.isArray(eventos) && eventos.length > 0;

  return (
    <div className="wp-events-backdrop" role="dialog" aria-modal="true">
      <div className="wp-events-panel">
        <div className="wp-events-head">
          <div className="wp-events-head-main">
            <div className="wp-events-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faRobot} />
            </div>

            <div className="wp-events-heading-copy">
              <div className="wp-events-eyebrow">Actividad del sistema</div>
              <div className="wp-events-title">
                Alertas del bot
                <span className={`wp-events-status ${pendientes > 0 ? "is-hot" : "is-ok"}`}>
                  <FontAwesomeIcon icon={pendientes > 0 ? faTriangleExclamation : faCircle} />
                  {pendientes > 0 ? "Requiere revisión" : "Todo al día"}
                </span>
              </div>
              <div className="wp-events-sub">
                {pendientes > 0
                  ? `${pendientes} evento${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"}`
                  : "No hay eventos pendientes"}
              </div>
            </div>
          </div>

          <button type="button" className="wp-events-close" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="wp-events-actions">
          <div className="wp-events-actions-copy">
            <b>Centro de seguimiento</b>
            <span>Revisá errores, advertencias y comprobantes pendientes.</span>
          </div>
          <button type="button" className="wp-events-btn" onClick={onRefresh} disabled={loading}>
            {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
            Actualizar
          </button>
        </div>

        <div className="wp-events-summary">
          <div className="wp-events-stat wp-events-stat--danger"><span>Errores pendientes</span><b>{Number(resumen?.errores_pendientes || 0)}</b></div>
          <div className="wp-events-stat wp-events-stat--warning"><span>Advertencias</span><b>{Number(resumen?.warnings_pendientes || 0)}</b></div>
          <div className="wp-events-stat wp-events-stat--info"><span>Últimos 7 días</span><b>{Number(resumen?.total_ultimos_7_dias || 0)}</b></div>
        </div>

        {error ? (
          <div className="wp-events-error">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {error}
          </div>
        ) : null}

        <div className="wp-events-list">
          {loading && !hasEventos ? (
            <div className="wp-events-empty">
              <FontAwesomeIcon icon={faSpinner} spin /> Cargando alertas…
            </div>
          ) : null}

          {!loading && !hasEventos ? (
            <div className="wp-events-empty">
              Todo limpio. Si el bot falla al generar un link, enviar WhatsApp, procesar un webhook o subir un archivo, va a aparecer acá.
            </div>
          ) : null}

          {hasEventos ? eventos.map((ev) => {
            const pendiente = ev.estado === "pendiente";
            const tipo = String(ev.tipo || "error");
            const ctx = ev.contexto && typeof ev.contexto === "object" ? ev.contexto : {};
            const idComprobante = Number(ctx?.id_comprobante || 0);
            const esComprobanteVenta = String(ev.modulo || "") === "ventas_comprobante" && idComprobante > 0;
            const comp = esComprobanteVenta ? pickComprobanteInfo(ev) : null;
            const compArchivoUrl = comp?.archivoUrl || "";
            const compEsImagen = isImageComprobante(compArchivoUrl, comp?.mediaTipo);
            const compEsPdf = isPdfComprobante(compArchivoUrl, comp?.mediaTipo);
            const compPersona = comp?.nombre || "Persona sin nombre detectado";
            const compDni = comp?.dni || "sin DNI";
            const compMonto = fmtMoneyARS(comp?.monto);
            const compCantidad = Number(comp?.cantidad || 0) > 0 ? `${Number(comp?.cantidad)} entrada${Number(comp?.cantidad) === 1 ? "" : "s"}` : "Cantidad a revisar";
            const compVenta = [comp?.campania, comp?.producto].filter(Boolean).join(" · ");

            return (
              <div key={ev.id_evento} className={`wp-event-card wp-event-card--${tipo} ${pendiente ? "is-pending" : "is-reviewed"}`}>
                <div className="wp-event-top">
                  <span className="wp-event-badge">{tipo}</span>
                                    <span className="wp-event-date">{fmtFechaEvento(ev.creado_en)}</span>
                </div>

                <div className="wp-event-title">{ev.titulo || "Evento del bot"}</div>

                {esComprobanteVenta ? (
                  <div className="wp-event-comprobante">
                    {compArchivoUrl ? (
                      <a
                        className="wp-event-comprobante-preview"
                        href={compArchivoUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir comprobante recibido"
                      >
                        {compEsImagen ? (
                          <img src={compArchivoUrl} alt={`Comprobante ${idComprobante}`} loading="lazy" />
                        ) : (
                          <span className="wp-event-comprobante-file">{compEsPdf ? "PDF" : "Archivo"}</span>
                        )}
                      </a>
                    ) : (
                      <div className="wp-event-comprobante-preview is-empty">Sin archivo</div>
                    )}

                    <div className="wp-event-comprobante-info">
                      <div className="wp-event-comprobante-title">Comprobante #{idComprobante}</div>
                      <div className="wp-event-comprobante-person">
                        <b>{compPersona}</b>
                        <span>DNI: {compDni}</span>
                      </div>

                      {compVenta ? <div className="wp-event-comprobante-desc">{compVenta}</div> : null}

                      <div className="wp-event-comprobante-chips">
                        <span>{compMonto}</span>
                        <span>{compCantidad}</span>
                        {comp?.precioUnitario ? <span>Precio: {fmtMoneyARS(comp.precioUnitario, "-")}</span> : null}
                      </div>

                      {comp?.motivoRevision ? (
                        <div className="wp-event-comprobante-warning">{comp.motivoRevision}</div>
                      ) : null}
                    </div>
                  </div>
                ) : ev.detalle ? (
                  <div className="wp-event-detail">{ev.detalle}</div>
                ) : null}

                <div className="wp-event-meta">
                  {ev.wa_id ? (
                    <button type="button" className="wp-event-link" onClick={() => onOpenChat?.(ev.wa_id)}>
                      Abrir chat {ev.wa_id}
                    </button>
                  ) : <span>Sin contacto asociado</span>}
                  <span>Estado: <b>{pendiente ? "pendiente" : "revisado"}</b></span>
                  {esComprobanteVenta && compArchivoUrl ? (
                    <a className="wp-event-link" href={compArchivoUrl} target="_blank" rel="noreferrer">
                      Ver comprobante
                    </a>
                  ) : null}
                </div>

                {pendiente ? (
                  <div className="wp-event-foot">
                    {esComprobanteVenta ? (
                      <>
                        <button
                          type="button"
                          className="wp-events-btn wp-events-btn--approve"
                          onClick={() => onAprobarComprobante?.(idComprobante, ev.id_evento)}
                        >
                          Aprobar comprobante
                        </button>
                        <button
                          type="button"
                          className="wp-events-btn wp-events-btn--reject"
                          onClick={() => onRechazarComprobante?.(idComprobante, ev.id_evento)}
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          className="wp-events-btn wp-events-btn--delete"
                          onClick={() => onDeleteOne?.(ev.id_evento)}
                          title="Ocultar sin aprobar, rechazar ni enviar mensajes"
                        >
                          Eliminar alerta
                        </button>
                      </>
                    ) : null}
                    {!esComprobanteVenta ? (
                      <>
                        <button type="button" className="wp-events-btn wp-events-btn--ok" onClick={() => onMarkOne?.(ev.id_evento)}>
                          Marcar revisado
                        </button>
                        <button type="button" className="wp-events-btn wp-events-btn--delete" onClick={() => onDeleteOne?.(ev.id_evento)}>
                          Eliminar
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          }) : null}
        </div>
      </div>
    </div>
  );
};

export default BotEventosModal;
