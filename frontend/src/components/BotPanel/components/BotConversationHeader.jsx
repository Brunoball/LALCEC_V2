import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHand,
  faMoon,
  faRobot,
  faSun,
  faTriangleExclamation,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ChatOptionsMenu from "../ChatOptionsMenu";
import { CONSULTA_MANUAL_TEMPLATE_ENABLED } from "../utils/botPanelUtils";

const BotConversationHeader = ({
  headerMenuBtnRef,
  isWindowExpired,
  marcarChatComoLeido,
  marcarChatComoNoLeido,
  mode,
  openCambiarEtiqueta,
  openEditarNombre,
  openEliminarContacto,
  openGaleria,
  openMenu,
  openVaciarChat,
  selected,
  selectedConsultasPendientes,
  selectedId,
  selectedWindow,
  setModeDB,
  setOpenMenu,
  theme,
  toggleTheme,
}) => (
<>
            <div className="wp-chat-top">
              <div className="wp-chat-top-left">
                <div className="wp-avatar wp-avatar--sm" aria-hidden="true">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <div className="wp-chat-top-meta">
                  <div className="wp-chat-top-name">
                    {selected?.nombre || "Sin nombre"}
                  </div>
                  <div className="wp-chat-top-id">{selectedId}</div>
                </div>
              </div>

              <div className="wp-chat-top-right">
                <div className="wp-chat-actions" aria-label="Acciones de la conversación">
                  <div className="wp-mode">
                    <div
                      className={`wp-window ${isWindowExpired ? "is-expired" : ""}`}
                      title={
                        isWindowExpired
                          ? "Ventana de 24hs expirada"
                          : `Quedan ${selectedWindow.remainingHours}h`
                      }
                      aria-label="Ventana 24 horas"
                    >
                      {isWindowExpired ? (
                        <span className="wp-window-x" aria-hidden="true">
                          <FontAwesomeIcon icon={faXmark} />
                        </span>
                      ) : (
                        <span className="wp-window-h">
                          {selectedWindow.remainingHours}hs
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`wp-modebtn ${mode === "bot" ? "is-active" : ""}`}
                      onClick={() => setModeDB("bot")}
                      title="Modo Bot (respuestas automáticas activas)"
                      aria-label="Modo Bot"
                    >
                      <FontAwesomeIcon icon={faRobot} />
                    </button>

                    <button
                      type="button"
                      className={`wp-modebtn ${mode === "manual" ? "is-active" : ""}`}
                      onClick={() => setModeDB("manual")}
                      title={
                        isWindowExpired
                          ? CONSULTA_MANUAL_TEMPLATE_ENABLED
                            ? "Modo Manual (ventana expirada: podés enviar una plantilla de texto)"
                            : "Modo Manual (ventana expirada)"
                          : "Modo Manual (el bot queda inhabilitado)"
                      }
                      aria-label="Modo Manual"
                    >
                      <FontAwesomeIcon icon={faHand} />
                    </button>

                    <ChatOptionsMenu
                      anchorRef={headerMenuBtnRef}
                      open={openMenu}
                      onOpen={() => setOpenMenu(true)}
                      onClose={() => setOpenMenu(false)}
                      onEditarNombre={() => openEditarNombre(selectedId)}
                      onCambiarEtiqueta={() => openCambiarEtiqueta(selectedId)}
                      onVerGaleria={() => openGaleria()}
                      onMarcarNoLeido={() => marcarChatComoNoLeido(selectedId)}
                      onMarcarLeido={() => marcarChatComoLeido(selectedId)}
                      isUnread={Number(selected?.unread || 0) > 0}
                      onVaciarChat={() => openVaciarChat(selectedId)}
                      onEliminarContacto={() => openEliminarContacto(selectedId)}
                    />
                  </div>

                  <button
                    type="button"
                    className="wp-themebtn"
                    onClick={toggleTheme}
                    title={
                      theme === "dark"
                        ? "Cambiar a modo claro"
                        : "Cambiar a modo oscuro"
                    }
                    aria-label="Cambiar tema"
                  >
                    <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
                    <span className="wp-themebtn-txt">
                      {theme === "dark" ? "Claro" : "Oscuro"}
                    </span>
                  </button>
                </div>

                <div className="wp-chat-status">
                  

                  {mode === "manual" ? (
                    <span className="wp-chip wp-chip--manual">
                      Manual activo • bot pausado
                    </span>
                  ) : null}

                  <span className="wp-chip wp-chip--tag">
                    {selected?.etiqueta || "sin etiqueta"}
                  </span>

                </div>
              </div>
            </div>

            {isWindowExpired ? (
              <div className="wp-window-expiredline">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>Ventana de 24hs expirada</span>
              </div>
            ) : null}

            {mode === "manual" ? (
              <div className={`wp-manual-banner ${selectedConsultasPendientes > 0 ? "is-consulta-pending" : ""}`}>
                <div className="wp-manual-banner-icon" aria-hidden="true">✋</div>
                <div className="wp-manual-banner-copy">
                  <strong>
                    {selectedConsultasPendientes > 0
                      ? "Consulta pendiente en atención manual"
                      : "Conversación manual activa"}
                  </strong>
                  <span>
                    {selectedConsultasPendientes > 0
                      ? "El usuario está esperando respuesta. El bot queda pausado mientras atendés este chat."
                      : "El bot no va a responder automáticamente hasta que vuelvas a modo bot."}
                  </span>
                </div>
              </div>
            ) : null}
</>
);

export default BotConversationHeader;
