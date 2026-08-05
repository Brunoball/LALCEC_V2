import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFaceSmile,
  faPaperclip,
  faPaperPlane,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import {
  CONSULTA_MANUAL_TEMPLATE_ENABLED,
  CONSULTA_TEMPLATE_VARIABLE_PLACEHOLDER,
  EMOJIS_RAPIDOS,
  fmtBytes,
} from "../utils/botPanelUtils";

const BotComposer = ({
  attachedFile,
  clearAttached,
  composerRef,
  draft,
  emojiBtnRef,
  emojiOpen,
  emojiPopRef,
  fileInputRef,
  insertAtCursor,
  isConsultaManualBlockedByTemplatePending,
  isWindowExpired,
  mode,
  onAttachClick,
  onFilePicked,
  onKeyDownDraft,
  selectedConsultasPendientes,
  sendManual,
  sendingMedia,
  setDraft,
  setEmojiOpen,
}) => (
<>
            {mode === "manual" ? (
              <div
                className={`wp-composer ${
                  isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED ? "is-template-mode" : ""
                } ${
                  isWindowExpired && !CONSULTA_MANUAL_TEMPLATE_ENABLED ? "is-disabled" : ""
                } ${
                  selectedConsultasPendientes > 0 ? "has-consulta-pending" : ""
                }`}
              >
                {isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED ? (
                  <div className="wp-template-preview">
                    <div className="wp-template-preview-head">
                      <span>📨 Plantilla aprobada que se enviará</span>
                      <small>Escribí solo la respuesta. El saludo y el cierre ya van incluidos.</small>
                    </div>

                    <div className="wp-template-preview-wrap">
                      <div className="wp-template-preview-bubble">
                        <div>Hola 👋</div>
                        <br />
                        <div>Te respondemos desde la Cooperadora del IPET 50.</div>
                        <br />
                        <div
                          className={`wp-template-preview-var ${
                            draft.trim() ? "has-text" : "is-empty"
                          }`}
                        >
                          {draft.trim() || CONSULTA_TEMPLATE_VARIABLE_PLACEHOLDER}
                        </div>
                        <br />
                        <div>
                          Si necesitás continuar, respondé este mensaje y te seguimos
                          ayudando.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="wp-composer-inner">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: "none" }}
                    onChange={onFilePicked}
                  />

                  <button
                    type="button"
                    className="wp-attach"
                    title={
                      isConsultaManualBlockedByTemplatePending
                        ? "Ventana de 24hs expirada"
                        : isWindowExpired
                        ? "Fuera de 24hs solo se puede enviar plantilla de texto"
                        : "Adjuntar imagen/PDF"
                    }
                    aria-label="Adjuntar imagen/PDF"
                    disabled={isWindowExpired || sendingMedia}
                    onClick={onAttachClick}
                  >
                    <FontAwesomeIcon icon={faPaperclip} />
                  </button>

                  <button
                    ref={emojiBtnRef}
                    type="button"
                    className={`wp-emoji-btn ${emojiOpen ? "is-open" : ""}`}
                    title={isConsultaManualBlockedByTemplatePending ? "Ventana de 24hs expirada" : "Emojis"}
                    aria-label="Emojis"
                    disabled={sendingMedia || isConsultaManualBlockedByTemplatePending}
                    onClick={() => setEmojiOpen((v) => !v)}
                  >
                    <FontAwesomeIcon icon={faFaceSmile} />
                  </button>

                  {emojiOpen && !isConsultaManualBlockedByTemplatePending ? (
                    <div
                      ref={emojiPopRef}
                      className="wp-emoji-pop"
                      role="dialog"
                      aria-label="Selector de emojis"
                    >
                      <div className="wp-emoji-grid">
                        {EMOJIS_RAPIDOS.map((emoji, index) => (
                          <button
                            key={`${emoji}-${index}`}
                            type="button"
                            className="wp-emoji-option"
                            title={`Insertar ${emoji}`}
                            aria-label={`Insertar emoji ${emoji}`}
                            onClick={() => insertAtCursor(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <textarea
                    ref={composerRef}
                    className="wp-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDownDraft}
                    placeholder={
                      attachedFile
                        ? `Adjunto: ${attachedFile.name} — escribí un texto opcional…`
                        : isConsultaManualBlockedByTemplatePending
                        ? "Ventana de 24hs expirada"
                        : isWindowExpired
                        ? "Escribí solo la respuesta; el saludo y el cierre ya están en la plantilla…"
                        : "Modo manual: escribir mensaje…"
                    }
                    rows={1}
                    disabled={sendingMedia || isConsultaManualBlockedByTemplatePending}
                  />

                  <button
                    type="button"
                    className={`wp-send ${
                      isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED ? "is-template" : ""
                    }`}
                    onClick={sendManual}
                    aria-label={
                      isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED
                        ? "Enviar plantilla"
                        : "Enviar"
                    }
                    title={
                      isConsultaManualBlockedByTemplatePending
                        ? "Ventana de 24hs expirada"
                        : isWindowExpired
                        ? "Enviar plantilla"
                        : attachedFile
                        ? "Enviar archivo"
                        : "Enviar"
                    }
                    disabled={sendingMedia || isConsultaManualBlockedByTemplatePending}
                  >
                    {sendingMedia ? (
                      <FontAwesomeIcon icon={faSpinner} spin />
                    ) : isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED ? (
                      <>
                        <FontAwesomeIcon icon={faPaperPlane} />
                        <span>Enviar plantilla</span>
                      </>
                    ) : (
                      <FontAwesomeIcon icon={faPaperPlane} />
                    )}
                  </button>
                </div>

                {attachedFile ? (
                  <div
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      opacity: 0.9,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      📎 <b>{attachedFile.name}</b> ({fmtBytes(attachedFile.size)})
                    </span>
                    <button
                      type="button"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "inherit",
                        textDecoration: "underline",
                      }}
                      onClick={clearAttached}
                    >
                      quitar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
</>
);

export default BotComposer;
