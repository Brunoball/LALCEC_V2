import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCircle,
  faEllipsisVertical,
  faMagnifyingGlass,
  faChartColumn,
  faRobot,
  faSpinner,
  faTag,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { fmtFechaHoraCompleta, fmtFechaHoraLista, normStr } from "../utils/botPanelUtils";

const BotSidebar = ({
  activeTagFilterLabel,
  chats,
  errorChats,
  errorEtiquetas,
  etiquetas,
  list,
  loadingChats,
  loadingEtiquetas,
  onBack,
  onOpenReportes,
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
        className="wp-report-launch"
        onClick={onOpenReportes}
        type="button"
        title="Reportes del bot"
        aria-label="Abrir reportes del bot"
      >
        <FontAwesomeIcon icon={faChartColumn} />
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

            {(etiquetas || []).map((et) => {
              const id = normStr(et?.id_etiqueta ?? et?.id);
              const nombre = normStr(et?.nombre);
              const count = Number(tagCounts.byId?.[id] ?? tagCounts.byName?.[nombre.toLowerCase()] ?? 0);
              const selected = tagFilter === `id:${id}`;

              return (
                <button
                  key={id || nombre}
                  type="button"
                  className={`wp-tag-filter-item ${selected ? "is-active" : ""}`}
                  onClick={() => {
                    setTagFilter(`id:${id}`);
                    setTagFilterOpen(false);
                  }}
                >
                  <span>{nombre || "Sin nombre"}</span>
                  <b>{count}</b>
                </button>
              );
            })}

            {loadingEtiquetas ? (
              <div className="wp-tag-filter-status">
                <FontAwesomeIcon icon={faSpinner} spin /> Cargando etiquetas…
              </div>
            ) : null}

            {errorEtiquetas ? (
              <div className="wp-tag-filter-status is-error">{errorEtiquetas}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>

    {errorChats ? (
      <div className="wp-error wp-error--sidebar">
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
        const consultasPendientes = Number(c.consultasPendientes || 0);
        const tone = c.chatTone || (consultasPendientes > 0
          ? "consulta"
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
                  {consultasPendientes > 0 ? (
                    <span className="wp-consulta-flag">• CONSULTA</span>
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
                  {c.modo === "manual" ? " • ✋ manual" : ""}
                </div>

                {c.unread > 0 ? (
                  <span
                    className={`wp-unread ${tone !== "normal" ? `wp-unread--${tone}` : ""}`}
                    title={tone === "consulta" ? "Consulta pendiente" : "Mensajes sin ver"}
                  >
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                ) : (
                  <span
                    className={`wp-tag wp-tag--${(c.etiqueta || "sin").replace(/\s/g, "")}`}
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
