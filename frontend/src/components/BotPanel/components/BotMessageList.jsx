import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  fmtBytes,
  fmtDateKey,
  fmtFechaSeparador,
  fmtHora,
  inferMimeFromUrl,
  isImageMime,
  isPdfMime,
  mapEmisorToSide,
} from "../utils/botPanelUtils";

const BotMessageList = ({
  errorMsgs,
  mensajes,
  messagesRef,
  msgEndRef,
  openViewer,
}) => (
  <div className="wp-messages" ref={messagesRef}>
    <div className="wp-day">
      <span>Mensajes</span>
    </div>

    {errorMsgs ? (
      <div className="wp-error wp-error--inchat">
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <span>{errorMsgs}</span>
      </div>
    ) : null}

    {(mensajes || []).map((m, idx) => {
      const prev = idx > 0 ? mensajes[idx - 1] : null;
      const showDateSeparator = !prev || fmtDateKey(prev.ts) !== fmtDateKey(m.ts);
      const side = mapEmisorToSide(m.emisor);
      const prioridadMsg = String(m.prioridad || "normal").toLowerCase();

      const isPendingConsult =
        m.es_consulta === true &&
        m.consulta_atendida === false;

      const danger =
        String(m.text || "").startsWith("ERROR") ||
        (prioridadMsg === "alta" && !isPendingConsult);

      const hasMedia = !!m.media_url;
      const mime = m.media_mime || (m.media_url ? inferMimeFromUrl(m.media_url) : "");
      const showImg = hasMedia && isImageMime(mime);
      const showPdf = hasMedia && isPdfMime(mime);

      // Algunos mensajes de documentos llegan con una leyenda técnica tipo
      // "[pdf]archivo.pdf" además del adjunto. WhatsApp no muestra ese texto
      // duplicado, así que lo ocultamos únicamente cuando coincide con el archivo.
      const rawText = String(m.text || "").trim();
      const mediaName = String(m.media_name || "").trim();
      const pdfMarkerMatch = rawText.match(/^\[pdf\]\s*(.+)$/i);
      const hidePdfMarker =
        showPdf &&
        pdfMarkerMatch &&
        (!mediaName || pdfMarkerMatch[1].trim().toLowerCase() === mediaName.toLowerCase());
      const visibleText = hidePdfMarker ? "" : m.text;

      const pdfPreviewUrl = showPdf
        ? `${m.media_url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`
        : "";

      const openPdf = () =>
        openViewer({
          url: m.media_url,
          mime,
          name: m.media_name || "documento.pdf",
        });

      return (
        <React.Fragment key={m.id}>
          {showDateSeparator ? (
            <div className="wp-date-separator">
              <span>{fmtFechaSeparador(m.ts)}</span>
            </div>
          ) : null}

          <div className={`wp-msg wp-msg--${side}`}>
            <div
              className={`wp-bubble ${danger ? "wp-bubble--danger" : ""} ${
                isPendingConsult ? "wp-bubble--consulta" : ""
              }`}
            >
              {isPendingConsult ? (
                <span
                  className="wp-consulta-pill"
                  title="Consulta pendiente de respuesta"
                >
                  👩‍💼 Consulta pendiente
                </span>
              ) : null}

              {hasMedia ? (
                <div className="wp-media-inbubble">
                  {showImg ? (
                    <button
                      type="button"
                      className="wp-media-thumbbtn"
                      onClick={() =>
                        openViewer({
                          url: m.media_url,
                          mime,
                          name: m.media_name || "imagen",
                        })
                      }
                      title="Ver imagen"
                    >
                      <img
                        className="wp-media-thumb"
                        src={m.media_url}
                        alt={m.media_name || "imagen"}
                      />
                    </button>
                  ) : showPdf ? (
                    <div
                      className="wp-doc-card"
                      role="button"
                      tabIndex={0}
                      onClick={openPdf}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPdf();
                        }
                      }}
                      title="Ver PDF"
                      aria-label={`Abrir ${m.media_name || "Documento PDF"}`}
                    >
                      <div className="wp-doc-preview" aria-hidden="true">
                        <div className="wp-doc-preview-fallback">
                          <div className="wp-doc-preview-sheet">
                            <span className="wp-doc-preview-line wp-doc-preview-line--title" />
                            <span className="wp-doc-preview-line" />
                            <span className="wp-doc-preview-line" />
                            <span className="wp-doc-preview-line wp-doc-preview-line--short" />
                          </div>
                        </div>
                        <iframe
                          className="wp-doc-preview-frame"
                          src={pdfPreviewUrl}
                          title=""
                          loading="lazy"
                          scrolling="no"
                          tabIndex={-1}
                        />
                        <span className="wp-doc-preview-badge">PDF</span>
                      </div>

                      <div className="wp-doc-info">
                        <div className="wp-doc-ico">
                          <FontAwesomeIcon icon={faFilePdf} />
                        </div>
                        <div className="wp-doc-meta">
                          <div className="wp-doc-name">
                            {m.media_name || "Documento PDF"}
                          </div>
                          <div className="wp-doc-sub">
                            PDF {m.media_size ? `• ${fmtBytes(m.media_size)}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <a href={m.media_url} target="_blank" rel="noreferrer">
                      📎 {m.media_name || "Archivo"}{" "}
                      {m.media_size ? `(${fmtBytes(m.media_size)})` : ""}
                    </a>
                  )}
                </div>
              ) : null}

              {visibleText ? <div className="wp-bubble-text">{visibleText}</div> : null}

              <div className="wp-bubble-time">
                {fmtHora(m.ts)} • {m.emisor}
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    })}

    <div ref={msgEndRef} />
  </div>
);

export default BotMessageList;
