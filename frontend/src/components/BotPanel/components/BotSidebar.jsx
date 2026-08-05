import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCircle,
  faEllipsisVertical,
  faMagnifyingGlass,
  faRobot,
  faSpinner,
  faTag,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { fmtFechaHoraCompleta, fmtFechaHoraLista, normStr } from "../utils/botPanelUtils";

const BotSidebar = ({
  activeTagFilterLabel,
  abrirPanelAlertas,
  chats,
  errorChats,
  errorEtiquetas,
  etiquetas,
  eventosResumen,
  list,
  loadingChats,
  loadingEtiquetas,
  onBack,
  openChat,
  q,
  selectedId,
  setQ,
  setTagFilter,
  setTagFilterOpen,
  tagCounts,
  tagFilter,
  tagFilterOpen,
  tagFilterRef,
}) => (
      <aside className="wp-sidebar">
        <div className="wp-side-top">
          <button
            className="wp-back"
            onClick={onBack}
            type="button"
            title="Volver"
            aria-label="Volver"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>

          <div className="wp-brand">
            <span className="wp-brand-ico" aria-hidden="true">
              <FontAwesomeIcon icon={faRobot} />
            </span>
            <div className="wp-brand-txt">
              <div className="wp-brand-title">Panel Bot WhatsApp</div>
            </div>
          </div>

          <button
            type="button"
            className={`wp-alertbtn ${Number(eventosResumen?.pendientes || 0) > 0 ? "is-danger" : ""}`}
            onClick={abrirPanelAlertas}
            title="Ver alertas y errores del bot"
            aria-label="Ver alertas y errores del bot"
          >
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {Number(eventosResumen?.pendientes || 0) > 0 ? (
              <span className="wp-alertbadge">
                {Number(eventosResumen?.pendientes || 0) > 99 ? "99+" : Number(eventosResumen?.pendientes || 0)}
              </span>
            ) : null}
          </button>
        </div>

        <div className="wp-searchbar" ref={tagFilterRef}>
          <div className="wp-search">
            <span className="wp-search-ico" aria-hidden="true">
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="wp-search-input"
              placeholder="Buscar por nombre, número, mensaje…"
            />
          </div>

          <div className="wp-tag-filter">
            <button
              type="button"
              className={`wp-tag-filter-btn ${tagFilterOpen ? "is-open" : ""} ${tagFilter !== "all" ? "has-filter" : ""}`}
              onClick={() => setTagFilterOpen((v) => !v)}
              title={`Filtrar por etiqueta: ${activeTagFilterLabel}`}
              aria-label={`Filtrar por etiqueta: ${activeTagFilterLabel}`}
              aria-expanded={tagFilterOpen}
            >
              <FontAwesomeIcon icon={faEllipsisVertical} />
              {tagFilter !== "all" ? <span className="wp-tag-filter-dot" aria-hidden="true" /> : null}
            </button>

            {tagFilterOpen ? (
              <div className="wp-tag-filter-menu" role="menu" aria-label="Filtrar chats por etiqueta">
                <div className="wp-tag-filter-title">
                  <FontAwesomeIcon icon={faTag} />
                  <span>Filtrar por etiqueta</span>
                </div>

                <button
                  type="button"
                  className={`wp-tag-filter-item ${tagFilter === "all" ? "is-active" : ""}`}
                  onClick={() => {
                    setTagFilter("all");
                    setTagFilterOpen(false);
                  }}
                >
                  <span>Todas</span>
                  <b>{tagCounts.all}</b>
                </button>

                <button
                  type="button"
                  className={`wp-tag-filter-item ${tagFilter === "sin" ? "is-active" : ""}`}
                  onClick={() => {
                    setTagFilter("sin");
                    setTagFilterOpen(false);
                  }}
                >
                  <span>Sin etiqueta</span>
                  <b>{tagCounts.sin}</b>
                </button>

                <div className="wp-tag-filter-sep" />

                {loadingEtiquetas ? (
                  <div className="wp-tag-filter-state">Cargando etiquetas…</div>
                ) : null}

                {!loadingEtiquetas && errorEtiquetas ? (
                  <div className="wp-tag-filter-state is-error">{errorEtiquetas}</div>
                ) : null}

                {!loadingEtiquetas && !errorEtiquetas && etiquetas.length === 0 ? (
                  <div className="wp-tag-filter-state">No hay etiquetas creadas.</div>
                ) : null}

                {!loadingEtiquetas && !errorEtiquetas
                  ? etiquetas.map((et) => {
                      const etId = normStr(et?.id_etiqueta);
                      const etNombre = normStr(et?.nombre) || "Etiqueta";
                      const value = etId ? `id:${etId}` : `name:${etNombre.toLowerCase()}`;
                      const count =
                        (etId ? tagCounts.byId[etId] : undefined) ??
                        tagCounts.byName[etNombre.toLowerCase()] ??
                        0;

                      return (
                        <button
                          key={etId || etNombre}
                          type="button"
                          className={`wp-tag-filter-item ${tagFilter === value ? "is-active" : ""}`}
                          onClick={() => {
                            setTagFilter(value);
                            setTagFilterOpen(false);
                          }}
                        >
                          <span>{etNombre}</span>
                          <b>{count}</b>
                        </button>
                      );
                    })
                  : null}
              </div>
            ) : null}
          </div>
        </div>

        {errorChats ? (
          <div className="wp-error">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>{errorChats}</span>
          </div>
        ) : null}

        <div className="wp-chatlist">
          {loadingChats && chats.length === 0 ? (
            <div className="wp-loading">
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>Cargando chats…</span>
            </div>
          ) : null}

          {list.map((c) => {
            const active = c.id === selectedId;
            const nombreOk = c.nombre || "Sin nombre";
            const fechaHora = fmtFechaHoraLista(c.updatedAt || Date.now());
            const fechaHoraTitle = fmtFechaHoraCompleta(c.updatedAt || Date.now());
            const totalTxt = `${Number(c.total || 0)} msgs`;
            const urgent = !!c.urgente;
            const comprobantesPendientes = Number(c.comprobantesPendientes || 0);
            const tone = c.chatTone || (Number(c.consultasPendientes || 0) > 0
              ? "consulta"
              : comprobantesPendientes > 0
                ? "comprobante"
                : c.prioridad === "alta"
                  ? "danger"
                  : "normal");
            const toneClass = tone !== "normal" ? `wp-chatitem--${tone}` : "";

            return (
              <button
                key={c.id}
                type="button"
                className={`wp-chatitem ${active ? "is-active" : ""} ${urgent ? "is-urgent" : ""} ${toneClass}`}
                onClick={() => openChat(c.id)}
              >
                <div className="wp-avatar" aria-hidden="true">
                  <FontAwesomeIcon icon={faUser} />
                </div>

                <div className="wp-chatmeta">
                  <div className="wp-chatrow" style={{ alignItems: "center" }}>
                    <div className="wp-chatname">
                      {nombreOk}
                      {Number(c.consultasPendientes || 0) > 0 ? (
                        <span className="wp-consulta-flag">
                          • CONSULTA
                        </span>
                      ) : null}
                      {comprobantesPendientes > 0 ? (
                        <span className="wp-comprobante-flag">
                          • COMPROBANTE
                        </span>
                      ) : null}
                      {c.online ? (
                        <span className="wp-online" title="En línea" aria-hidden="true">
                          <FontAwesomeIcon icon={faCircle} />
                        </span>
                      ) : null}
                    </div>

                    <div className="wp-chattime" title={fechaHoraTitle}>{fechaHora}</div>
                  </div>

                  <div className="wp-chatrow">
                    <div className="wp-chatlast">
                      {c.id} • {totalTxt}
                      {comprobantesPendientes > 0 ? " • 🧾 comprobante" : c.prioridad === "alta" && Number(c.consultasPendientes || 0) === 0 ? " • ⚠️" : ""}
                      {c.modo === "manual" ? " • ✋ manual" : ""}
                    </div>

                    {c.unread > 0 ? (
                      <span
                        className={`wp-unread ${tone !== "normal" ? `wp-unread--${tone}` : ""}`}
                        title={
                          tone === "consulta"
                            ? "Consulta manual pendiente"
                            : tone === "comprobante"
                              ? "Comprobante pendiente"
                              : tone === "danger"
                                ? "Alerta importante"
                                : "Mensajes sin ver"
                        }
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    ) : (
                      <span
                        className={`wp-tag wp-tag--${(c.etiqueta || "sin").replace(
                          /\s/g,
                          ""
                        )}`}
                      >
                        {c.etiqueta || "sin etiqueta"}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {!loadingChats && list.length === 0 ? (
            <div className="wp-empty">No hay chats con ese filtro.</div>
          ) : null}
        </div>
      </aside>
);

export default BotSidebar;
