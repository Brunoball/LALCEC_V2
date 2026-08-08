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
                    <button
                      type="button"
                      className="wp-doc-card"
                      onClick={() =>
                        openViewer({
                          url: m.media_url,
                          mime,
                          name: m.media_name || "documento.pdf",
                        })
                      }
                      title="Ver PDF"
                    >
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
                    </button>
                  ) : (
                    <a href={m.media_url} target="_blank" rel="noreferrer">
                      📎 {m.media_name || "Archivo"}{" "}
                      {m.media_size ? `(${fmtBytes(m.media_size)})` : ""}
                    </a>
                  )}
                </div>
              ) : null}

              {m.text ? <div className="wp-bubble-text">{m.text}</div> : null}

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
