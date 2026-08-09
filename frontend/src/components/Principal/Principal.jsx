import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faChartLine,
  faGear,
  faReceipt,
  faRightFromBracket,
  faRobot,
  faTags,
  faUsers,
  faWallet,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  clearSession,
  getSession,
  openAuthenticatedTab,
} from "../_shared/auth/session";
import { apiPost } from "../_shared/api/apiClient";
import { BOT_PANEL_ROUTE } from "../../config/config";
import { botPanelGet } from "../BotPanel/api/botApi";
import notificationSound from "../BotPanel/notificacion/notificacion.mp3";
import logoLalcec from "../../imagenes/logo_lalcec_sf.png";
import ModalPerfil from "../Perfil/ModalPerfil";
import "./principal.css";

const APP_NAME = "Gestión de Socios";

const NAV_ITEMS = [
  {
    key: "administracion",
    label: "Administración",
    path: "/panel",
    icon: faChartLine,
  },
  {
    key: "socios",
    label: "Socios",
    path: "/socios",
    defaultPath: "/socios/personas",
    icon: faUsers,
    children: [
      { key: "socios-personas", label: "Socios", path: "/socios/personas" },
      { key: "socios-empresas", label: "Empresas", path: "/socios/empresas" },
      { key: "socios-familias", label: "Familias", path: "/socios/familias" },
    ],
  },
  { key: "cuotas", label: "Cuotas", path: "/cuotas", icon: faReceipt },
  {
    key: "categorias",
    label: "Categorías",
    path: "/categorias",
    defaultPath: "/categorias",
    icon: faTags,
    children: [
      { key: "categorias-listado", label: "Categorías", path: "/categorias" },
      {
        key: "categorias-descuentos",
        label: "Descuentos familiares",
        path: "/categorias/descuentos",
      },
    ],
  },
  {
    key: "contable",
    label: "Contabilidad",
    path: "/contable",
    defaultPath: "/contable/ingresos",
    icon: faWallet,
    children: [
      {
        key: "contable-ingresos",
        label: "Ingresos",
        path: "/contable/ingresos",
      },
      { key: "contable-egresos", label: "Egresos", path: "/contable/egresos" },
      { key: "contable-resumen", label: "Resumen", path: "/contable/resumen" },
    ],
  },
  {
    key: "bot-whatsapp",
    label: "Bot WhatsApp",
    path: BOT_PANEL_ROUTE,
    icon: faRobot,
    external: true,
  },
];

const GROUP_CLICK_DELAY = 0;
const BOT_NOTIFICATION_POLL_MS = 2000;

const toBotNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatBotBadge = (value) => {
  const number = Math.max(0, toBotNumber(value));
  if (number <= 0) return "";
  return number > 99 ? "99+" : String(number);
};

const getBotChatId = (chat) =>
  String(chat?.wa_id || chat?.id || chat?.telefono || "").trim();

const getBotChatSummary = (chat) => {
  const unread = Math.max(0, toBotNumber(chat?.unread || 0));
  const pendingQueries = Math.max(
    0,
    toBotNumber(chat?.consultas_pendientes || chat?.pending_consultas || 0),
  );
  const pendingReceipts = Math.max(
    0,
    toBotNumber(
      chat?.comprobantes_pendientes || chat?.pending_comprobantes || 0,
    ),
  );
  const priority = String(
    chat?.prioridad || chat?.notificacion_tipo || chat?.tipo_notificacion || "",
  )
    .trim()
    .toLowerCase();

  return {
    id: getBotChatId(chat),
    unread,
    pendingQueries,
    pendingReceipts,
    priority,
  };
};

// BotPanel considera "Consulta pendiente" solamente cuando el mensaje trae
// es_consulta=1 y todavía no fue atendido. No usamos modo manual, prioridad,
// tipo de notificación ni el texto del mensaje para evitar falsos positivos.
const isPendingPersonalAttentionMessage = (message) =>
  Number(message?.es_consulta || 0) === 1 &&
  Number(message?.consulta_atendida || 0) !== 1;

const getBotAttentionMessageToken = (message) =>
  String(
    message?.id ||
      message?.consulta_fecha ||
      message?.fecha ||
      `${message?.wa_id || ""}:${message?.mensaje || "consulta"}`,
  );

const getBotChatChangeSignature = (chat, summary) =>
  [
    summary.id,
    summary.unread,
    summary.pendingQueries,
    toBotNumber(chat?.total || 0),
    toBotNumber(chat?.ultima_ts || chat?.updated_at || 0),
    String(chat?.ultima_fecha || ""),
    String(chat?.ultimo_mensaje || ""),
  ].join("|");

const inspectPendingPersonalAttention = async (summary) => {
  if (!summary.id || summary.unread <= 0) {
    return { pendingQueries: 0, attentionToken: "" };
  }

  try {
    const data = await botPanelGet("panel_mensajes", {
      wa_id: summary.id,
      limit: Math.max(60, Math.min(220, summary.unread + 80)),
    });
    const messages = Array.isArray(data?.mensajes) ? data.mensajes : [];
    const pending = messages.filter(isPendingPersonalAttentionMessage);

    return {
      pendingQueries: pending.length,
      attentionToken: pending.map(getBotAttentionMessageToken).join("|"),
    };
  } catch {
    // Si el detalle falla, panel_chats sigue funcionando como fallback.
    return { pendingQueries: 0, attentionToken: "" };
  }
};

const calculateBotNotificationsFromChats = (rows, detailsByChat = new Map()) => {
  const chats = Array.isArray(rows) ? rows : [];
  let normal = 0;
  let urgent = 0;
  let approval = 0;
  const snapshot = [];

  for (const chat of chats) {
    const summary = getBotChatSummary(chat);
    const detail = detailsByChat.get(summary.id) || {};

    // panel_chats es la fuente rápida. panel_mensajes completa el dato cuando
    // ese endpoint todavía no expone consultas_pendientes.
    const pendingQueries = Math.max(
      summary.pendingQueries,
      Math.max(0, toBotNumber(detail.pendingQueries || 0)),
    );

    const isReceiptAlert =
      summary.priority === "aprobacion_comprobante" ||
      summary.priority === "comprobante_pendiente" ||
      summary.priority.includes("comprobante");

    const approvalsForChat =
      summary.pendingReceipts > 0
        ? summary.pendingReceipts
        : isReceiptAlert
          ? Math.max(1, Math.min(summary.unread, 1))
          : 0;

    // Igual que Cooperadora en cantidad: una consulta pendiente consume uno de
    // los unread verdes y lo transforma en rojo. La diferencia es que acá el
    // fallback lee es_consulta directamente del mensaje para no depender de un
    // contador que en este backend puede llegar tarde o quedar en cero.
    const urgentForChat = Math.min(summary.unread, pendingQueries);
    const classifiedForChat = Math.min(
      summary.unread,
      urgentForChat + Math.min(summary.unread, approvalsForChat),
    );

    urgent += urgentForChat;
    approval += approvalsForChat;
    normal += Math.max(0, summary.unread - classifiedForChat);

    snapshot.push({
      id: summary.id,
      unread: summary.unread,
      urgentCount: urgentForChat,
      pendingQueries,
      attentionToken: String(detail.attentionToken || ""),
    });
  }

  return {
    badges: { normal, urgent, approval },
    snapshot,
  };
};

const getGroupKeyForPath = (pathname) =>
  NAV_ITEMS.find(
    (item) =>
      item.children &&
      (pathname === item.path || pathname.startsWith(`${item.path}/`)),
  )?.key || null;

function LogoutModal({ open, onClose, onConfirm }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="pp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pp-logout-modal-title"
    >
      <div className="pp-modal pp-modal--danger">
        <div className="pp-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faRightFromBracket} />
        </div>
        <h3 id="pp-logout-modal-title" className="pp-modal__title">
          Confirmar cierre de sesión
        </h3>
        <p className="pp-modal__text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>
        <div className="pp-modal__actions">
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="pp-btn pp-btn--danger"
            type="button"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Principal() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = getSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [openGroupKey, setOpenGroupKey] = useState(() =>
    getGroupKeyForPath(location.pathname),
  );
  const groupClickTimer = useRef(null);
  const logoutInProgress = useRef(false);

  const [botNotifications, setBotNotifications] = useState({
    normal: 0,
    urgent: 0,
    approval: 0,
  });
  const botNotificationAudioRef = useRef(null);
  const botNotificationUserInteractedRef = useRef(false);
  const botNotificationAudioUnlockedRef = useRef(false);
  const botNotificationAudioContextRef = useRef(null);
  const previousBotChatsRef = useRef([]);
  const firstBotChatsLoadRef = useRef(true);
  const botNotificationRequestRef = useRef(false);
  const botAttentionDetailsCacheRef = useRef(new Map());

  useEffect(() => {
    setDrawerOpen(false);
    setOpenGroupKey(getGroupKeyForPath(location.pathname));
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (groupClickTimer.current) clearTimeout(groupClickTimer.current);
    },
    [],
  );

  useEffect(() => {
    try {
      botNotificationUserInteractedRef.current =
        Boolean(navigator?.userActivation?.hasBeenActive) ||
        botNotificationUserInteractedRef.current;
    } catch {}

    const unlockBotNotificationAudio = () => {
      botNotificationUserInteractedRef.current = true;

      // Dejamos un AudioContext habilitado como respaldo. Esto evita que el
      // navegador silencie la alerta varios segundos después del primer clic.
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass && !botNotificationAudioContextRef.current) {
          botNotificationAudioContextRef.current = new AudioContextClass();
        }
        const context = botNotificationAudioContextRef.current;
        if (context?.state === "suspended") {
          const resumePromise = context.resume();
          if (resumePromise && typeof resumePromise.catch === "function") {
            resumePromise.catch(() => {});
          }
        }
      } catch {}

      // También desbloqueamos explícitamente el MP3 durante el gesto del usuario.
      // Se reproduce muteado y se detiene enseguida, por lo que no se oye nada.
      if (!botNotificationAudioUnlockedRef.current) {
        const audio = botNotificationAudioRef.current;
        if (audio) {
          try {
            const previousMuted = audio.muted;
            audio.muted = true;
            audio.currentTime = 0;
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.then === "function") {
              playPromise
                .then(() => {
                  audio.pause();
                  audio.currentTime = 0;
                  audio.muted = previousMuted;
                  botNotificationAudioUnlockedRef.current = true;
                })
                .catch(() => {
                  audio.muted = previousMuted;
                });
            } else {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = previousMuted;
              botNotificationAudioUnlockedRef.current = true;
            }
          } catch {}
        }
      }
    };

    window.addEventListener("pointerdown", unlockBotNotificationAudio, { passive: true });
    window.addEventListener("keydown", unlockBotNotificationAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockBotNotificationAudio);
      window.removeEventListener("keydown", unlockBotNotificationAudio);
      try {
        botNotificationAudioContextRef.current?.close?.();
      } catch {}
      botNotificationAudioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const playFallbackAttentionTone = () => {
      const renderTone = () => {
        try {
          const context = botNotificationAudioContextRef.current;
          if (!context || context.state === "closed") return;

          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const now = context.currentTime;

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, now);
          oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now);
          oscillator.stop(now + 0.24);
        } catch {}
      };

      try {
        const context = botNotificationAudioContextRef.current;
        if (!context || context.state === "closed") return;
        if (context.state === "suspended") {
          const resumed = context.resume();
          if (resumed && typeof resumed.then === "function") {
            resumed.then(renderTone).catch(() => {});
            return;
          }
        }
        renderTone();
      } catch {}
    };

    const playUrgentNotificationSound = () => {
      const audio = botNotificationAudioRef.current;
      if (!audio) {
        playFallbackAttentionTone();
        return;
      }

      try {
        audio.muted = false;
        audio.pause();
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => playFallbackAttentionTone());
        }
      } catch {
        playFallbackAttentionTone();
      }
    };

    const refreshBotNotifications = async () => {
      if (botNotificationRequestRef.current) return;
      botNotificationRequestRef.current = true;

      try {
        const data = await botPanelGet("panel_chats");
        if (!mounted || !Array.isArray(data?.chats)) return;

        // panel_chats sirve para unread/comprobantes. Para atención personalizada
        // verificamos también el mismo flag de mensaje que usa BotPanel:
        // es_consulta=1 && consulta_atendida=0. Esto evita los dos errores que
        // tuvimos antes: "todo rojo" por modo/prioridad y "todo verde" porque
        // consultas_pendientes no estaba llegando en este backend.
        const detailsByChat = new Map();
        const now = Date.now();
        const activeIds = new Set();

        await Promise.all(
          data.chats.map(async (chat) => {
            const summary = getBotChatSummary(chat);
            if (!summary.id || summary.unread <= 0) return;

            activeIds.add(summary.id);
            const signature = getBotChatChangeSignature(chat, summary);
            const cached = botAttentionDetailsCacheRef.current.get(summary.id);
            const cacheStillFresh =
              cached &&
              cached.signature === signature &&
              now - Number(cached.checkedAt || 0) < 3000;

            if (cacheStillFresh) {
              detailsByChat.set(summary.id, cached.detail);
              return;
            }

            const detail = await inspectPendingPersonalAttention(summary);
            botAttentionDetailsCacheRef.current.set(summary.id, {
              signature,
              checkedAt: now,
              detail,
            });
            detailsByChat.set(summary.id, detail);
          }),
        );

        // Limpiamos chats ya leídos/eliminados para que una solicitud vieja no
        // pueda volver a disparar sonido más adelante.
        for (const id of botAttentionDetailsCacheRef.current.keys()) {
          if (!activeIds.has(id)) {
            botAttentionDetailsCacheRef.current.delete(id);
          }
        }

        if (!mounted) return;

        const { badges, snapshot } = calculateBotNotificationsFromChats(
          data.chats,
          detailsByChat,
        );

        if (firstBotChatsLoadRef.current) {
          firstBotChatsLoadRef.current = false;
        } else {
          const previousChats = previousBotChatsRef.current;

          // Sonido SOLO por una nueva solicitud real de atención personalizada.
          // Un mensaje normal, aunque llegue en un chat que esté en modo manual,
          // no altera pendingQueries/attentionToken y por eso no suena.
          const mustPlayUrgent = snapshot.some((nextChat) => {
            const previousChat = previousChats.find(
              (chat) => chat.id === nextChat.id,
            );
            const previousPending = Number(previousChat?.pendingQueries || 0);
            const previousUrgentCount = Number(previousChat?.urgentCount || 0);
            const pendingIncreased = nextChat.pendingQueries > previousPending;
            const becameUrgent =
              nextChat.urgentCount > 0 && previousUrgentCount === 0;
            const tokenChanged =
              !!nextChat.attentionToken &&
              nextChat.attentionToken !== previousChat?.attentionToken;

            return pendingIncreased || becameUrgent || tokenChanged;
          });

          if (mustPlayUrgent) {
            playUrgentNotificationSound();
          }
        }

        previousBotChatsRef.current = snapshot;
        setBotNotifications({
          normal: Math.max(0, toBotNumber(badges.normal)),
          urgent: Math.max(0, toBotNumber(badges.urgent)),
          approval: Math.max(0, toBotNumber(badges.approval)),
        });
      } catch {
        // Si el bot está temporalmente inaccesible, el sistema principal sigue funcionando.
      } finally {
        botNotificationRequestRef.current = false;
      }
    };

    refreshBotNotifications();
    const timer = window.setInterval(
      refreshBotNotifications,
      BOT_NOTIFICATION_POLL_MS,
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshBotNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const activeLabel = useMemo(() => {
    const configurationLabels = {
      "/configuracion": "Configuración",
      "/configuracion/usuarios": "Usuarios y roles",
      "/configuracion/catalogos": "Catálogos generales",
      "/configuracion/contable": "Configuración contable",
    };
    if (configurationLabels[location.pathname]) {
      return configurationLabels[location.pathname];
    }
    if (location.pathname.startsWith("/configuracion")) return "Configuración";
    for (const item of NAV_ITEMS) {
      const child = item.children?.find(
        (entry) => location.pathname === entry.path,
      );
      if (child) return child.label;
      if (
        location.pathname === item.path ||
        location.pathname.startsWith(`${item.path}/`)
      )
        return item.label;
    }
    return "Administración";
  }, [location.pathname]);

  const logout = () => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    setLogoutOpen(false);

    // apiPost toma el token antes del primer await. El cierre local puede ser
    // inmediato y la invalidación del servidor queda como una tarea best-effort.
    void apiPost("auth_logout", {}).catch(() => {
      // La sesión local ya se cerró aunque el servidor la hubiera vencido.
    });

    clearSession();
    navigate("/", { replace: true });
  };

  const clearGroupClickTimer = () => {
    if (!groupClickTimer.current) return;
    clearTimeout(groupClickTimer.current);
    groupClickTimer.current = null;
  };

  const toggleGroup = (item, event) => {
    clearGroupClickTimer();

    // El segundo clic pertenece al doble clic: la navegación se resuelve
    // exclusivamente en handleGroupDoubleClick.
    if (event.detail > 1) return;

    groupClickTimer.current = setTimeout(() => {
      setOpenGroupKey((currentKey) =>
        currentKey === item.key ? null : item.key,
      );
      groupClickTimer.current = null;
    }, GROUP_CLICK_DELAY);
  };

  const handleGroupDoubleClick = (item, event) => {
    event.preventDefault();
    clearGroupClickTimer();
    setOpenGroupKey(item.key);
    setDrawerOpen(false);
    navigate(item.defaultPath || item.path);
  };

  const closeOpenGroup = () => {
    clearGroupClickTimer();
    setOpenGroupKey(null);
  };

  const botNotificationTitle = [
    botNotifications.normal > 0
      ? `${botNotifications.normal} mensaje${botNotifications.normal === 1 ? "" : "s"} sin leer`
      : null,
    botNotifications.urgent > 0
      ? `${botNotifications.urgent} de atención personalizada`
      : null,
    botNotifications.approval > 0
      ? `${botNotifications.approval} comprobante${botNotifications.approval === 1 ? "" : "s"} pendiente${botNotifications.approval === 1 ? "" : "s"} de aprobación`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pp-shell">
      <audio
        ref={botNotificationAudioRef}
        preload="auto"
        src={notificationSound}
      />
      <header className="mov-topbar">
        <div className="mov-topbar__left">
          <button
            className="pp-burger"
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>
          <div className="mov-topbar__logo mov-topbar__appBrand">
            <span className="mov-topbar__appBrandMark mov-topbar__appBrandMark--image">
              <img src={logoLalcec} alt="Logo LALCEC" />
            </span>
            <span className="mov-topbar__brandText">
              <strong>LALCEC</strong>
              <small>Sistema Gestión de Socios</small>
            </span>
          </div>
        </div>
        <div className="mov-topbar__right">
          <div className="mov-topbar__section">{activeLabel}</div>
          <button
            className={`pp-topbarConfig ${location.pathname.startsWith("/configuracion") ? "is-active" : ""}`}
            type="button"
            onClick={() => navigate("/configuracion")}
            title="Configuración"
            aria-label="Abrir configuración"
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
          <button
            className="mov-topbar__usericon has-logo"
            type="button"
            onClick={() => setPerfilOpen(true)}
            title="Perfil"
            aria-label="Abrir perfil"
          >
            <img
              className="mov-topbar__userlogo"
              src={logoLalcec}
              alt="LALCEC San Francisco"
            />
          </button>
          <button
            className="pp-topbarLogout"
            type="button"
            onClick={() => setLogoutOpen(true)}
            title="Cerrar sesión"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>
      </header>

      <div
        className={`pp-drawerOverlay ${drawerOpen ? "is-open" : ""}`}
        onMouseDown={() => setDrawerOpen(false)}
      />
      <aside className={`pp-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
        <div className="pp-drawerHeader">
          <div
            className="pp-drawerBrand"
            onClick={() => navigate("/panel")}
            role="button"
            tabIndex={0}
          >
            <div className="pp-drawerBrand__mark pp-drawerBrand__mark--image">
              <img src={logoLalcec} alt="Logo LALCEC" />
            </div>
            <div className="pp-drawerBrand__txt">
              <div className="pp-drawerBrand__t">LALCEC</div>
              <div className="pp-drawerBrand__s">Sistema Gestión de Socios</div>
            </div>
          </div>
          <button
            className="pp-drawerClose"
            type="button"
            onClick={() => setDrawerOpen(false)}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div
          className="pp-brand panel_contable"
          onClick={() => navigate("/panel")}
          role="button"
          tabIndex={0}
        >
          <div className="pp-brand__mark pp-brand__mark--image">
            <img className="pp-brand__logo" src={logoLalcec} alt="Logo LALCEC" />
          </div>
          <div className="pp-brand__text">
            <div className="pp-brand__title">LALCEC</div>
            <div className="pp-brand__subtitle">Sistema Gestión de Socios</div>
          </div>
        </div>

        <nav className="pp-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const active =
              location.pathname === item.path ||
              location.pathname.startsWith(`${item.path}/`);
            const groupOpen = Boolean(
              item.children && openGroupKey === item.key,
            );
            return (
              <div
                className={`pp-navGroup ${item.children ? "has-sub" : ""} ${groupOpen ? "is-open" : ""}`}
                key={item.key}
              >
                {item.external ? (
                  <button
                    className="pp-nav__item"
                    type="button"
                    title={
                      item.key === "bot-whatsapp" && botNotificationTitle
                        ? `Abrir Bot WhatsApp · ${botNotificationTitle}`
                        : "Abrir en una pestaña nueva"
                    }
                    aria-label={
                      item.key === "bot-whatsapp" && botNotificationTitle
                        ? `Abrir Bot WhatsApp. ${botNotificationTitle}`
                        : undefined
                    }
                    onClick={() => {
                      closeOpenGroup();
                      setDrawerOpen(false);
                      openAuthenticatedTab(item.path);
                    }}
                  >
                    <span
                      className={`pp-nav__icon ${item.key === "bot-whatsapp" ? "pp-nav__icon--bot" : ""}`}
                    >
                      <FontAwesomeIcon icon={item.icon} />
                      {item.key === "bot-whatsapp" && botNotifications.approval > 0 ? (
                        <span
                          className="pp-navBotBadge pp-navBotBadge--approval"
                          aria-label={`Comprobantes pendientes de aprobación: ${botNotifications.approval}`}
                          title={`Comprobantes para aprobar: ${botNotifications.approval}`}
                        >
                          {formatBotBadge(botNotifications.approval)}
                        </span>
                      ) : null}
                      {item.key === "bot-whatsapp" && botNotifications.normal > 0 ? (
                        <span
                          className="pp-navBotBadge pp-navBotBadge--normal"
                          aria-label={`Notificaciones normales: ${botNotifications.normal}`}
                          title={`Mensajes sin leer: ${botNotifications.normal}`}
                        >
                          {formatBotBadge(botNotifications.normal)}
                        </span>
                      ) : null}
                      {item.key === "bot-whatsapp" && botNotifications.urgent > 0 ? (
                        <span
                          className="pp-navBotBadge pp-navBotBadge--urgent"
                          aria-label={`Notificaciones urgentes: ${botNotifications.urgent}`}
                          title={`Atención personalizada: ${botNotifications.urgent}`}
                        >
                          {formatBotBadge(botNotifications.urgent)}
                        </span>
                      ) : null}
                    </span>
                    <span className="pp-nav__label">{item.label}</span>
                  </button>
                ) : item.children ? (
                  <button
                    className={`pp-nav__item ${active ? "is-active" : ""}`}
                    type="button"
                    aria-expanded={groupOpen}
                    onClick={(event) => toggleGroup(item, event)}
                    onDoubleClick={(event) =>
                      handleGroupDoubleClick(item, event)
                    }
                    title="Un clic para desplegar; doble clic para ingresar"
                  >
                    <span className="pp-nav__icon">
                      <FontAwesomeIcon icon={item.icon} />
                    </span>
                    <span className="pp-nav__label">{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    className={({ isActive }) =>
                      `pp-nav__item ${isActive ? "is-active" : ""}`
                    }
                    to={item.path}
                    onClick={closeOpenGroup}
                  >
                    <span className="pp-nav__icon">
                      <FontAwesomeIcon icon={item.icon} />
                    </span>
                    <span className="pp-nav__label">{item.label}</span>
                  </NavLink>
                )}
                {item.children ? (
                  <div className="pp-navSub" aria-hidden={!groupOpen}>
                    {item.children.map((child) => (
                      <NavLink
                        end
                        className={({ isActive }) =>
                          `pp-navSub__item ${isActive ? "is-active" : ""}`
                        }
                        to={child.path}
                        key={child.key}
                      >
                        <span className="pp-navSub__dot" />
                        <span className="pp-navSub__label">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="pp-content">
        <div className="pp-content__inner">
          <Outlet />
        </div>
      </main>
      <ModalPerfil
        open={perfilOpen}
        onClose={() => setPerfilOpen(false)}
        usuario={session?.usuario}
        logoSrc={logoLalcec}
        onConfigRequest={() => {
          setPerfilOpen(false);
          navigate("/configuracion");
        }}
      />
      <LogoutModal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={logout}
      />
    </div>
  );
}
