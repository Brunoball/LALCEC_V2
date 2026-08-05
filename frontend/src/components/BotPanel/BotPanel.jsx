import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  botManagementGet,
  botManagementPost,
  botPanelFormPost,
  botPanelGet,
  botPanelPost,
} from "./api/botApi";
import BotSidebar from "./components/BotSidebar";
import BotConversationHeader from "./components/BotConversationHeader";
import BotMessageList from "./components/BotMessageList";
import BotComposer from "./components/BotComposer";
import BotEventosModal from "./modales/BotEventosModal";
import MediaViewerModal from "./modales/MediaViewerModal";
import {
  CONSULTA_MANUAL_TEMPLATE_ENABLED,
  buildConsultaTemplateText,
  calcWindow,
  inferMimeFromUrl,
  inferNameFromUrl,
  isImageMime,
  isPdfMime,
  normStr,
  parseMoneyInput,
  pickModo,
  pickNombre,
  toTs,
} from "./utils/botPanelUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";

import "./BotPanel.css";
import notificationSound from "./notificacion/notificacion.mp3";

import EditNombreModal from "./modales/EditNombreModal";
import EditEtiquetaModal from "./modales/EditEtiquetaModal";
import ConfirmActionModal from "./modales/ConfirmActionModal";
import ComprobanteRevisionModal from "./modales/ComprobanteRevisionModal";

import GaleriaModal from "./modales/GaleriaModal";

const BotPanel = () => {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mensajes, setMensajes] = useState([]);

  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [refreshingChats, setRefreshingChats] = useState(false);

  const [errorChats, setErrorChats] = useState("");
  const [errorMsgs, setErrorMsgs] = useState("");

  const [eventosOpen, setEventosOpen] = useState(false);
  const [eventos, setEventos] = useState([]);
  const [eventosResumen, setEventosResumen] = useState({
    pendientes: 0,
    errores_pendientes: 0,
    warnings_pendientes: 0,
    total_ultimos_7_dias: 0,
  });
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [errorEventos, setErrorEventos] = useState("");

  const [comprobanteConfirm, setComprobanteConfirm] = useState({
    open: false,
    accion: "",
    idComprobante: 0,
    idEvento: 0,
    motivo: "",
    montoManual: "",
    cantidadManual: "",
    detalle: null,
    loadingDetalle: false,
  });
  const [comprobanteConfirmLoading, setComprobanteConfirmLoading] = useState(false);
  const [comprobanteConfirmError, setComprobanteConfirmError] = useState("");

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("bot");

  const msgEndRef = useRef(null);
  const messagesRef = useRef(null);

  const lastHashRef = useRef("");
  const globalHashRef = useRef("");
  const pendingScrollRef = useRef(null);

  const selectedIdRef = useRef(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const headerMenuBtnRef = useRef(null);
  const tagFilterRef = useRef(null);

  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // ==========================
  // ✅ SONIDO NOTIFICACIÓN
  // ==========================
  const audioUrgentRef = useRef(null);
  const prevChatsRef = useRef([]);
  const firstChatsLoadRef = useRef(true);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const unlock = () => {
      userInteractedRef.current = true;
    };

    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playUrgentSound = useCallback(() => {
    if (!userInteractedRef.current) return;

    const audio = audioUrgentRef.current;
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    } catch {}
  }, []);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
      return;
    }

    msgEndRef.current?.scrollIntoView({
      behavior,
      block: "end",
    });
  }, []);


  useLayoutEffect(() => {
    const behavior = pendingScrollRef.current;
    if (!behavior) return;

    scrollToBottom(behavior);
    pendingScrollRef.current = null;

    // Algunas burbujas terminan de medir después del render (imágenes/PDFs),
    // por eso repetimos el ajuste para que quede realmente pegado abajo.
    const raf = window.requestAnimationFrame(() => scrollToBottom("auto"));
    const t = window.setTimeout(() => scrollToBottom("auto"), 120);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [mensajes, selectedId, scrollToBottom]);

  const markSeen = useCallback(async (waId) => {
    if (!waId) return;
    try {
      await botPanelGet("panel_mark_seen", { wa_id: waId });
    } catch {}
  }, []);

  const markUnread = useCallback(async (waId) => {
    if (!waId) return { success: false, error: "wa_id requerido" };
    return botPanelGet("panel_mark_unread", { wa_id: waId });
  }, []);

  // ==========================
  // ✅ TEMA CLARO / OSCURO
  // ==========================
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("botpanel_theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-botpanel-theme", theme);
    localStorage.setItem("botpanel_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  // ==========================
  // ✅ ETIQUETAS (DB)
  // ==========================
  const [etiquetas, setEtiquetas] = useState([]);
  const [loadingEtiquetas, setLoadingEtiquetas] = useState(false);
  const [errorEtiquetas, setErrorEtiquetas] = useState("");

  const fetchEtiquetas = useCallback(async () => {
    setLoadingEtiquetas(true);
    setErrorEtiquetas("");
    try {
      const data = await botManagementGet("etiquetas_list");
      setEtiquetas(Array.isArray(data.etiquetas) ? data.etiquetas : []);
    } catch (e) {
      setErrorEtiquetas(e?.message || "No se pudieron cargar etiquetas");
      setEtiquetas([]);
    } finally {
      setLoadingEtiquetas(false);
    }
  }, []);

  useEffect(() => {
    if (!tagFilterOpen) return;

    const onDocDown = (e) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target)) {
        setTagFilterOpen(false);
      }
    };

    const onEsc = (e) => {
      if (e.key === "Escape") setTagFilterOpen(false);
    };

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [tagFilterOpen]);


  const fetchEventos = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingEventos(true);
      setErrorEventos("");
      try {
        const data = await botPanelGet("panel_eventos", {
          estado: "pendiente",
          limit: 100,
        });
        setEventos(Array.isArray(data.eventos) ? data.eventos : []);
        setEventosResumen({
          pendientes: Number(data?.resumen?.pendientes || 0),
          errores_pendientes: Number(data?.resumen?.errores_pendientes || 0),
          warnings_pendientes: Number(data?.resumen?.warnings_pendientes || 0),
          total_ultimos_7_dias: Number(data?.resumen?.total_ultimos_7_dias || 0),
        });
      } catch (e) {
        setErrorEventos(e?.message || "No se pudieron cargar las alertas del bot");
      } finally {
        if (!silent) setLoadingEventos(false);
      }
    },
    []
  );

  const marcarEventoRevisado = useCallback(
    async (idEvento = 0) => {
      try {
        setLoadingEventos(true);
        await botPanelPost("panel_eventos", {
          accion: "marcar_revisado",
          id_evento: Number(idEvento || 0),
        });
        await fetchEventos(true);
      } catch (e) {
        setErrorEventos(e?.message || "No se pudo marcar la alerta como revisada");
      } finally {
        setLoadingEventos(false);
      }
    },
    [fetchEventos]
  );

  const fetchChats = useCallback(
    async (silent = false) => {
      if (silent) setRefreshingChats(true);
      else setLoadingChats(true);

      setErrorChats("");

      try {
        const data = await botPanelGet("panel_chats");

        const rows = Array.isArray(data.chats) ? data.chats : [];
        const mapped = rows.map((c) => {
          const modo = pickModo(c);
          const unread = Number(c.unread || 0);
          const prioridad = normStr(c.prioridad || "normal");
          const consultasPendientes = Number(
            c.consultas_pendientes || c.pending_consultas || 0
          );
          const comprobantesPendientes = Number(
            c.comprobantes_pendientes || c.pending_comprobantes || 0
          );

          const chatTone =
            consultasPendientes > 0
              ? "consulta"
              : comprobantesPendientes > 0
                ? "comprobante"
                : prioridad === "alta"
                  ? "danger"
                  : "normal";

          const urgente =
            consultasPendientes > 0 ||
            comprobantesPendientes > 0 ||
            (modo === "manual" && unread > 0) ||
            prioridad === "alta";

          return {
            id: normStr(c.wa_id),
            nombre: pickNombre(c),

            etiqueta: normStr(c.etiqueta || ""),
            etiqueta_id: c?.etiqueta_id ?? c?.etiquetaId ?? null,

            ventana24hTs: toTs(c?.ventana_24h),

            online: !!c.online,
            ultimo: normStr(c.ultimo_mensaje || ""),
            updatedAt: Number(c.ultima_ts || 0) > 0 ? Number(c.ultima_ts) : (toTs(c.ultima_fecha) ?? Date.now()),
            total: Number(c.total || 0),
            prioridad,
            unread,
            modo,
            urgente,
            consultasPendientes,
            comprobantesPendientes,
            chatTone,
          };
        });

        setChats((prevCurrent) => {
          const prevList = prevChatsRef.current?.length
            ? prevChatsRef.current
            : prevCurrent;

          if (firstChatsLoadRef.current) {
            firstChatsLoadRef.current = false;
          } else {
            let mustPlayUrgent = false;

            for (const nextChat of mapped) {
              const prevChat = prevList.find((x) => x.id === nextChat.id);
              const prevUnread = Number(prevChat?.unread || 0);
              const nextUnread = Number(nextChat?.unread || 0);

              const unreadIncreased = nextUnread > prevUnread;
              const isUrgentNow = !!nextChat.urgente;

              if (unreadIncreased && isUrgentNow) {
                mustPlayUrgent = true;
                break;
              }
            }

            if (mustPlayUrgent) {
              playUrgentSound();
            }
          }

          prevChatsRef.current = mapped;
          return mapped;
        });
      } catch (err) {
        setErrorChats(err?.message || "Error cargando chats");
      } finally {
        if (silent) setRefreshingChats(false);
        else setLoadingChats(false);
      }
    },
    [playUrgentSound]
  );

  const eliminarEventoSinAccion = useCallback(
    async (idEvento = 0, options = {}) => {
      try {
        setLoadingEventos(true);
        setErrorEventos("");
        await botPanelPost("panel_eventos", {
          accion: "eliminar_alerta",
          id_evento: Number(idEvento || 0),
        });
        await fetchEventos(true);
        await fetchChats(true);
      } catch (e) {
        const msg = e?.message || "No se pudo eliminar la alerta";
        setErrorEventos(msg);
        if (options?.throwOnError) throw e;
      } finally {
        setLoadingEventos(false);
      }
    },
    [fetchEventos, fetchChats]
  );

  // ==========================
  // ✅ MEDIA VISOR STATE
  // ==========================
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState(null);

  const openViewer = (item) => {
    if (!item?.url) return;
    setViewerItem(item);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerItem(null);
  };

  const abrirConfirmacionComprobante = useCallback((accion, idComprobante = 0, idEvento = 0) => {
    const tipo = accion === "rechazar" ? "rechazar" : "aprobar";
    const baseState = {
      open: true,
      accion: tipo,
      idComprobante: Number(idComprobante || 0),
      idEvento: Number(idEvento || 0),
      motivo: "",
      montoManual: "",
      cantidadManual: "",
      detalle: null,
      loadingDetalle: true,
    };

    setComprobanteConfirm(baseState);
    setComprobanteConfirmError("");

    (async () => {
      try {
        const data = await botPanelPost(
          "panel_ventas_comprobante_transferencia",
          {
            accion: "detalle_comprobante",
            id_comprobante: Number(idComprobante || 0),
            id_evento: Number(idEvento || 0),
          },
        );

        const cantidad = Number(data?.cantidad_sugerida || data?.cantidad_estimada || 1);
        const monto = data?.monto_detectado ?? data?.monto_confirmado ?? "";

        setComprobanteConfirm((prev) => {
          if (!prev.open || Number(prev.idComprobante || 0) !== Number(idComprobante || 0)) return prev;
          return {
            ...prev,
            detalle: data,
            loadingDetalle: false,
            cantidadManual: cantidad > 0 ? String(cantidad) : "1",
            montoManual: monto !== "" && monto !== null && monto !== undefined ? String(monto) : "",
          };
        });
      } catch (e) {
        const msg = e?.message || "No se pudo cargar el detalle del comprobante.";
        setComprobanteConfirm((prev) => {
          if (!prev.open || Number(prev.idComprobante || 0) !== Number(idComprobante || 0)) return prev;
          return { ...prev, loadingDetalle: false };
        });
        setComprobanteConfirmError(msg);
      }
    })();
  }, []);

  const cerrarConfirmacionComprobante = useCallback(() => {
    if (comprobanteConfirmLoading) return;
    setComprobanteConfirm({
      open: false,
      accion: "",
      idComprobante: 0,
      idEvento: 0,
      motivo: "",
      montoManual: "",
      cantidadManual: "",
      detalle: null,
      loadingDetalle: false,
    });
    setComprobanteConfirmError("");
  }, [comprobanteConfirmLoading]);

  const ejecutarAccionComprobante = useCallback(
    async () => {
      const accion = comprobanteConfirm.accion === "rechazar" ? "rechazar" : "aprobar";
      const idComprobante = Number(comprobanteConfirm.idComprobante || 0);
      const idEvento = Number(comprobanteConfirm.idEvento || 0);

      if (idComprobante <= 0) {
        setComprobanteConfirmError("Falta el comprobante a procesar.");
        return;
      }

      const payload = {
        accion: accion === "rechazar" ? "rechazar_comprobante" : "aprobar_comprobante",
        id_comprobante: idComprobante,
        id_evento: idEvento,
      };

      if (accion === "rechazar") {
        payload.motivo = String(comprobanteConfirm.motivo || "").trim();
      } else {
        const cantidadManual = Number.parseInt(String(comprobanteConfirm.cantidadManual || ""), 10);
        const montoManual = parseMoneyInput(comprobanteConfirm.montoManual);

        if (!Number.isFinite(cantidadManual) || cantidadManual <= 0) {
          setComprobanteConfirmError("Ingresá una cantidad de entradas válida.");
          return;
        }

        payload.cantidad_manual = cantidadManual;
        if (montoManual !== null) payload.monto_manual = montoManual;
      }

      try {
        setComprobanteConfirmLoading(true);
        setLoadingEventos(true);
        setErrorEventos("");
        setComprobanteConfirmError("");

        await botPanelPost(
          "panel_ventas_comprobante_transferencia",
          payload,
        );

        setComprobanteConfirm({
          open: false,
          accion: "",
          idComprobante: 0,
          idEvento: 0,
          motivo: "",
          montoManual: "",
          cantidadManual: "",
          detalle: null,
          loadingDetalle: false,
        });
        await fetchEventos(true);
        await fetchChats(true);
      } catch (e) {
        const msg = e?.message || (comprobanteConfirm.accion === "rechazar" ? "No se pudo rechazar el comprobante" : "No se pudo aprobar el comprobante");
        setComprobanteConfirmError(msg);
        setErrorEventos(msg);
      } finally {
        setComprobanteConfirmLoading(false);
        setLoadingEventos(false);
      }
    },
    [comprobanteConfirm, fetchEventos, fetchChats]
  );

  const setCampoComprobanteConfirm = useCallback((campo, valor) => {
    setComprobanteConfirm((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const aprobarComprobanteVenta = useCallback(
    (idComprobante = 0, idEvento = 0) => {
      abrirConfirmacionComprobante("aprobar", idComprobante, idEvento);
    },
    [abrirConfirmacionComprobante]
  );

  const rechazarComprobanteVenta = useCallback(
    (idComprobante = 0, idEvento = 0) => {
      abrirConfirmacionComprobante("rechazar", idComprobante, idEvento);
    },
    [abrirConfirmacionComprobante]
  );

  const abrirPanelAlertas = useCallback(() => {
    setEventosOpen(true);
    fetchEventos(true);
  }, [fetchEventos]);

  const fetchMensajes = useCallback(
    async (waId, { silent = false } = {}) => {
      if (!waId) return;

      if (!silent) setLoadingMsgs(true);
      setErrorMsgs("");

      try {
        const data = await botPanelGet("panel_mensajes", {
          wa_id: waId,
          limit: 600,
        });

        const rows = Array.isArray(data.mensajes) ? data.mensajes : [];

        const mapped = rows.map((m) => {
          const url = normStr(m.archivo_url || m.media_url || "");
          const mime =
            normStr(m.media_mime || "") || (url ? inferMimeFromUrl(url) : "");
          const name =
            normStr(m.media_name || "") || (url ? inferNameFromUrl(url) : "");
          const size = Number(m.media_size || 0);

          const tipo =
            normStr(m.tipo || "") ||
            (url
              ? isPdfMime(mime)
                ? "document"
                : isImageMime(mime)
                ? "image"
                : "file"
              : "text");

          return {
            id: Number(m.id) || m.id || `${m.fecha}-${Math.random()}`,
            wa_id: normStr(m.wa_id),
            text: normStr(m.mensaje),
            emisor: normStr(m.emisor),
            prioridad: normStr(m.prioridad || "normal"),
            notificacion_tipo: normStr(m.notificacion_tipo || m.tipo_notificacion || "normal"),
            ts: toTs(m.fecha) ?? Date.now(),

            es_consulta: Number(m.es_consulta || 0) === 1,
            consulta_atendida: Number(m.consulta_atendida || 0) === 1,
            consulta_fecha: toTs(m.consulta_fecha),

            tipo,
            media_url: url,
            media_mime: mime,
            media_name: name,
            media_size: size,
          };
        });

        if (selectedIdRef.current !== waId) return;

        // Mantener el chat siempre pegado al último mensaje, incluso en refrescos silenciosos.
        pendingScrollRef.current = "auto";

        setMensajes(mapped);

        await markSeen(waId);
        await fetchChats(true);
      } catch (err) {
        setErrorMsgs(err?.message || "Error cargando mensajes");
        setMensajes([]);
      } finally {
        if (!silent) setLoadingMsgs(false);
      }
    },
    [markSeen, fetchChats]
  );

  const getHash = useCallback(async (waId) => {
    try {
      const data = await botPanelGet("panel_hash", { wa_id: waId });
      return String(data.hash ?? "");
    } catch {
      return "";
    }
  }, []);

  const getGlobalHash = useCallback(async () => {
    try {
      const data = await botPanelGet("panel_global_hash");
      return String(data.hash ?? "");
    } catch {
      return "";
    }
  }, []);

  const pollSelectedChat = useCallback(async () => {
    const waId = selectedIdRef.current;
    if (!waId) return;

    try {
      const newHash = await getHash(waId);

      if (!lastHashRef.current) {
        lastHashRef.current = newHash;
        return;
      }

      if (newHash && newHash !== lastHashRef.current) {
        lastHashRef.current = newHash;
        await fetchMensajes(waId, { silent: true });
      }
    } catch {}
  }, [fetchMensajes, getHash]);

  const pollGlobal = useCallback(async () => {
    try {
      const newHash = await getGlobalHash();

      if (!globalHashRef.current) {
        globalHashRef.current = newHash;
        return;
      }

      if (newHash && newHash !== globalHashRef.current) {
        globalHashRef.current = newHash;
        if (!refreshingChats && !loadingChats) fetchChats(true);
        fetchEventos(true);
      }
    } catch {}
  }, [fetchChats, fetchEventos, getGlobalHash, refreshingChats, loadingChats]);

  const setModeDB = useCallback(
    async (nextMode) => {
      const waId = selectedIdRef.current;

      setMode(nextMode);
      if (!waId) return;

      try {
        await botPanelPost("panel_set_modo", {
          wa_id: waId,
          modo: nextMode,
        });
        await fetchChats(true);
      } catch (err) {
        setMensajes((prev) => [
          ...prev,
          {
            id: `err-mode-${Date.now()}`,
            wa_id: waId,
            text: `ERROR MODO: ${
              err?.message || "No se pudo actualizar el modo en la DB"
            }`,
            emisor: "Panel",
            prioridad: "alta",
            ts: Date.now(),
          },
        ]);
      }
    },
    [fetchChats]
  );

  useEffect(() => {
    fetchChats(false);
    fetchEtiquetas();
    fetchEventos(true);

    (async () => {
      const h = await getGlobalHash();
      globalHashRef.current = h || "";
    })();
  }, [fetchChats, fetchEtiquetas, fetchEventos, getGlobalHash]);

  useEffect(() => {
    if (!selectedId) return;

    lastHashRef.current = "";

    (async () => {
      await fetchMensajes(selectedId, { silent: false });
      const h = await getHash(selectedId);
      lastHashRef.current = h || "";
    })();
  }, [selectedId, fetchMensajes, getHash]);

  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => pollSelectedChat(), 900);
    return () => clearInterval(t);
  }, [selectedId, pollSelectedChat]);

  useEffect(() => {
    const t = setInterval(() => pollGlobal(), 900);
    return () => clearInterval(t);
  }, [pollGlobal]);

  useEffect(() => {
    const t = setInterval(() => fetchChats(true), 30000);
    return () => clearInterval(t);
  }, [fetchChats]);


  useEffect(() => {
    const t = setInterval(() => fetchEventos(true), 2000);
    return () => clearInterval(t);
  }, [fetchEventos]);

  const tagCounts = useMemo(() => {
    const counts = { all: chats.length, sin: 0, byId: {}, byName: {} };

    chats.forEach((c) => {
      const etiquetaId = normStr(c.etiqueta_id);
      const etiquetaNombre = normStr(c.etiqueta).toLowerCase();

      if (!etiquetaId && !etiquetaNombre) {
        counts.sin += 1;
        return;
      }

      if (etiquetaId) {
        counts.byId[etiquetaId] = (counts.byId[etiquetaId] || 0) + 1;
      }

      if (etiquetaNombre) {
        counts.byName[etiquetaNombre] = (counts.byName[etiquetaNombre] || 0) + 1;
      }
    });

    return counts;
  }, [chats]);

  const activeTagFilterLabel = useMemo(() => {
    if (tagFilter === "sin") return "sin etiqueta";
    if (String(tagFilter).startsWith("id:")) {
      const id = String(tagFilter).slice(3);
      const found = etiquetas.find((e) => normStr(e?.id_etiqueta) === id);
      return normStr(found?.nombre) || "etiqueta";
    }
    if (String(tagFilter).startsWith("name:")) {
      return String(tagFilter).slice(5) || "etiqueta";
    }
    return "todas";
  }, [tagFilter, etiquetas]);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const selectedEtiquetaId = String(tagFilter).startsWith("id:")
      ? String(tagFilter).slice(3)
      : "";
    const selectedEtiquetaNameDirect = String(tagFilter).startsWith("name:")
      ? String(tagFilter).slice(5).toLowerCase()
      : "";
    const selectedEtiqueta = selectedEtiquetaId
      ? etiquetas.find((e) => normStr(e?.id_etiqueta) === selectedEtiquetaId)
      : null;
    const selectedEtiquetaNombre = selectedEtiquetaNameDirect || normStr(selectedEtiqueta?.nombre).toLowerCase();

    const arr = [...chats].sort((a, b) => {
      if (!!b.urgente !== !!a.urgente) return b.urgente ? 1 : -1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    return arr.filter((c) => {
      const chatEtiquetaId = normStr(c.etiqueta_id);
      const chatEtiquetaNombre = normStr(c.etiqueta).toLowerCase();

      if (tagFilter === "sin" && (chatEtiquetaId || chatEtiquetaNombre)) {
        return false;
      }

      if (selectedEtiquetaId || selectedEtiquetaNameDirect) {
        const matchesById =
          selectedEtiquetaId && chatEtiquetaId && chatEtiquetaId === selectedEtiquetaId;
        const matchesByName =
          selectedEtiquetaNombre && chatEtiquetaNombre === selectedEtiquetaNombre;

        if (!matchesById && !matchesByName) return false;
      }

      if (!qq) return true;

      return (
        String(c.nombre || "").toLowerCase().includes(qq) ||
        String(c.id || "").toLowerCase().includes(qq) ||
        String(c.etiqueta || "").toLowerCase().includes(qq) ||
        String(c.ultimo || "").toLowerCase().includes(qq)
      );
    });
  }, [chats, q, tagFilter, etiquetas]);

  const selected = useMemo(
    () => chats.find((c) => c.id === selectedId) || null,
    [chats, selectedId]
  );

  const selectedConsultasPendientes = Number(selected?.consultasPendientes || 0);

  const selectedWindow = useMemo(
    () => calcWindow(selected?.ventana24hTs, nowTs),
    [selected?.ventana24hTs, nowTs]
  );

  const isWindowExpired = selectedId ? !selectedWindow.valid : false;
  const isConsultaManualBlockedByTemplatePending =
    isWindowExpired && !CONSULTA_MANUAL_TEMPLATE_ENABLED;

  const openChat = (id) => {
    const c = chats.find((x) => x.id === id) || null;
    const sameChat = selectedIdRef.current === id;

    pendingScrollRef.current = "auto";
    setMode(c?.modo === "manual" ? "manual" : "bot");

    // Si vuelve a hacer clic en el mismo chat, NO vaciamos mensajes.
    // Opcionalmente refrescamos el chat.
    if (sameChat) {
      fetchMensajes(id, { silent: true });
      return;
    }

    // Si es otro chat distinto, sí limpiamos y cambiamos selección.
    setMensajes([]);
    setSelectedId(id);
  };

  useEffect(() => {
    if (!selectedId) return;

    pendingScrollRef.current = "auto";
    scrollToBottom("auto");

    const raf = window.requestAnimationFrame(() => scrollToBottom("auto"));
    const t1 = window.setTimeout(() => scrollToBottom("auto"), 80);
    const t2 = window.setTimeout(() => scrollToBottom("auto"), 220);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [selectedId, scrollToBottom]);

  // ==========================
  // ✅ EMOJIS
  // ==========================
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef(null);
  const emojiPopRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    setEmojiOpen(false);
  }, [selectedId, mode, isWindowExpired]);

  useEffect(() => {
    if (!emojiOpen) return;

    const onDown = (e) => {
      const btn = emojiBtnRef.current;
      const pop = emojiPopRef.current;
      if (!btn || !pop) return;

      if (btn.contains(e.target)) return;
      if (pop.contains(e.target)) return;

      setEmojiOpen(false);
    };

    const onKey = (e) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  const insertAtCursor = useCallback(
    (emoji) => {
      const ta = composerRef.current;
      if (!ta) {
        setDraft((prev) => prev + emoji);
        return;
      }

      const start = ta.selectionStart ?? draft.length;
      const end = ta.selectionEnd ?? draft.length;

      setDraft((prev) => {
        const a = prev.slice(0, start);
        const b = prev.slice(end);
        return a + emoji + b;
      });

      setTimeout(() => {
        try {
          ta.focus();
          const next = start + emoji.length;
          ta.setSelectionRange(next, next);
        } catch {}
      }, 0);
    },
    [draft]
  );

  // ==========================
  // ✅ adjuntos (imagen/pdf)
  // ==========================
  const fileInputRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [sendingMedia, setSendingMedia] = useState(false);

  const onAttachClick = () => {
    if (isWindowExpired) return;
    if (mode !== "manual") return;
    fileInputRef.current?.click();
  };

  const onFilePicked = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;

    const mime = String(f.type || "");
    const ok = isImageMime(mime) || isPdfMime(mime);

    if (!ok) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `bad-file-${Date.now()}`,
          wa_id: selectedIdRef.current || "",
          text: "⚠️ Solo se permiten imágenes (JPG/PNG/WEBP) o PDF.",
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
      e.target.value = "";
      return;
    }

    if (f.size > 12 * 1024 * 1024) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `big-file-${Date.now()}`,
          wa_id: selectedIdRef.current || "",
          text: "⚠️ Archivo demasiado grande (máx sugerido 12MB).",
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
      e.target.value = "";
      return;
    }

    setAttachedFile(f);
  };

  const clearAttached = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendManual = async () => {
    const waId = selectedIdRef.current;
    if (!waId) return;

    const text = draft.trim();

    if (mode !== "manual") {
      setMensajes((prev) => [
        ...prev,
        {
          id: `mode-block-${Date.now()}`,
          wa_id: waId,
          text: "⚠️ Para responder manualmente, activá primero el modo manual.",
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
      return;
    }

    if (isConsultaManualBlockedByTemplatePending) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `win-exp-template-disabled-${Date.now()}`,
          wa_id: waId,
          text: "⛔ Ventana de 24hs expirada.",
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
      clearAttached();
      return;
    }

    if (isWindowExpired && attachedFile) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `win-exp-media-${Date.now()}`,
          wa_id: waId,
          text: "⛔ Ventana de 24hs expirada. Fuera de la ventana solo se puede enviar una plantilla de texto, no imágenes ni PDF.",
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
      clearAttached();
      return;
    }

    // ✅ si hay archivo => enviar media
    if (attachedFile) {
      setSendingMedia(true);

      const tempId = `local-media-${Date.now()}`;
      pendingScrollRef.current = "auto";

      setMensajes((prev) => [
        ...prev,
        {
          id: tempId,
          wa_id: waId,
          text: text || "",
          emisor: "Admin",
          prioridad: "normal",
          ts: Date.now(),
          tipo: isPdfMime(attachedFile.type) ? "document" : "image",
          media_url: "",
          media_mime: attachedFile.type,
          media_name: attachedFile.name,
          media_size: attachedFile.size,
        },
      ]);

      setDraft("");
      setEmojiOpen(false);

      try {
        const fd = new FormData();
        fd.append("wa_id", waId);
        fd.append("caption", text);
        fd.append("file", attachedFile);

        await botPanelFormPost("panel_send_media", fd);

        clearAttached();

        lastHashRef.current = "";
        await fetchMensajes(waId, { silent: true });

        const h = await getHash(waId);
        lastHashRef.current = h || "";

        await fetchChats(true);
      } catch (err) {
        setMensajes((prev) => [
          ...prev,
          {
            id: `err-media-${Date.now()}`,
            wa_id: waId,
            text: `ERROR ENVIO ARCHIVO: ${err?.message || "No se pudo enviar"}`,
            emisor: "Panel",
            prioridad: "alta",
            ts: Date.now(),
          },
        ]);
      } finally {
        setSendingMedia(false);
      }

      return;
    }

    // ✅ texto normal
    if (!text) return;

    const tempId = `local-${Date.now()}`;
    const optimisticText =
      isWindowExpired && CONSULTA_MANUAL_TEMPLATE_ENABLED
        ? buildConsultaTemplateText(text)
        : text;
    pendingScrollRef.current = "auto";

    setMensajes((prev) => [
      ...prev,
      {
        id: tempId,
        wa_id: waId,
        text: optimisticText,
        emisor: "Admin",
        prioridad: "normal",
        ts: Date.now(),
        tipo: "text",
      },
    ]);

    setDraft("");
    setEmojiOpen(false);

    try {
      await botPanelPost("panel_send", {
        wa_id: waId,
        texto: text,
        // Si la ventana de 24hs está expirada, el backend envía la plantilla aprobada.
        usar_plantilla_si_ventana_expirada: CONSULTA_MANUAL_TEMPLATE_ENABLED,
      });

      lastHashRef.current = "";
      await fetchMensajes(waId, { silent: true });

      const h = await getHash(waId);
      lastHashRef.current = h || "";

      await fetchChats(true);
    } catch (err) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          wa_id: waId,
          text: `ERROR ENVIO: ${err?.message || "No se pudo enviar"}`,
          emisor: "Panel",
          prioridad: "alta",
          ts: Date.now(),
        },
      ]);
    }
  };

  const onKeyDownDraft = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendManual();
    }
  };

  // ==========================
  // ✅ MENU ⋮ EN HEADER + MODALES
  // ==========================
  const [openMenu, setOpenMenu] = useState(false);

  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [modalEditWa, setModalEditWa] = useState("");
  const [modalEditLoading, setModalEditLoading] = useState(false);
  const [modalEditError, setModalEditError] = useState("");

  const [modalVaciarOpen, setModalVaciarOpen] = useState(false);
  const [modalVaciarWa, setModalVaciarWa] = useState("");
  const [modalVaciarLoading, setModalVaciarLoading] = useState(false);
  const [modalVaciarError, setModalVaciarError] = useState("");

  const [modalEliminarOpen, setModalEliminarOpen] = useState(false);
  const [modalEliminarWa, setModalEliminarWa] = useState("");
  const [modalEliminarLoading, setModalEliminarLoading] = useState(false);
  const [modalEliminarError, setModalEliminarError] = useState("");

  const [modalEliminarAlertaOpen, setModalEliminarAlertaOpen] = useState(false);
  const [modalEliminarAlertaId, setModalEliminarAlertaId] = useState(null);
  const [modalEliminarAlertaLoading, setModalEliminarAlertaLoading] = useState(false);
  const [modalEliminarAlertaError, setModalEliminarAlertaError] = useState("");

  const [modalTagOpen, setModalTagOpen] = useState(false);
  const [modalTagWa, setModalTagWa] = useState("");
  const [modalTagLoading, setModalTagLoading] = useState(false);
  const [modalTagError, setModalTagError] = useState("");

  // ✅ NUEVO: Galería
  const [galeriaOpen, setGaleriaOpen] = useState(false);

  const openEditarNombre = (waId) => {
    setModalEditError("");
    setModalEditWa(waId);
    setModalEditOpen(true);
  };

  const openVaciarChat = (waId) => {
    setModalVaciarError("");
    setModalVaciarWa(waId);
    setModalVaciarOpen(true);
  };

  const openEliminarContacto = (waId) => {
    setModalEliminarError("");
    setModalEliminarWa(waId);
    setModalEliminarOpen(true);
  };

  const openEliminarAlerta = (idEvento) => {
    setModalEliminarAlertaError("");
    setModalEliminarAlertaId(Number(idEvento || 0));
    setModalEliminarAlertaOpen(true);
  };

  const openCambiarEtiqueta = (waId) => {
    setModalTagError("");
    setModalTagWa(waId);
    setModalTagOpen(true);
  };

  const marcarChatComoNoLeido = async (waId) => {
    if (!waId) return;

    setErrorMsgs("");
    try {
      const data = await markUnread(waId);

      if (Number(data?.unread || 0) > 0) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === waId
              ? {
                  ...c,
                  unread: Number(data.unread || 1),
                  urgente:
                    Number(data.unread || 1) > 0 &&
                    (c.modo === "manual" || c.prioridad === "alta" || Number(c.consultasPendientes || 0) > 0 || Number(c.comprobantesPendientes || 0) > 0),
                }
              : c
          )
        );
      } else if (data?.no_user_messages) {
        setErrorMsgs("Este chat todavía no tiene mensajes entrantes para marcar como no leído.");
      }

      await fetchChats(true);
    } catch (e) {
      setErrorMsgs(e?.message || "No se pudo marcar el chat como no leído");
    }
  };

  const marcarChatComoLeido = async (waId) => {
    if (!waId) return;

    setErrorMsgs("");
    try {
      await markSeen(waId);
      setChats((prev) =>
        prev.map((c) =>
          c.id === waId
            ? {
                ...c,
                unread: 0,
                urgente: Number(c.consultasPendientes || 0) > 0 || Number(c.comprobantesPendientes || 0) > 0 || c.prioridad === "alta",
              }
            : c
        )
      );
      await fetchChats(true);
    } catch (e) {
      setErrorMsgs(e?.message || "No se pudo marcar el chat como leído");
    }
  };

  const saveNombre = async (waId, nombre) => {
    setModalEditLoading(true);
    setModalEditError("");
    try {
      await botManagementPost("editar_nombre", {
        wa_id: waId,
        nombre,
      });
      setModalEditOpen(false);
      await fetchChats(true);
    } catch (e) {
      setModalEditError(e?.message || "No se pudo guardar el nombre");
    } finally {
      setModalEditLoading(false);
    }
  };

  const saveEtiqueta = async (waId, etiquetaId) => {
    setModalTagLoading(true);
    setModalTagError("");
    try {
      await botManagementPost("etiquetas_set", {
        wa_id: waId,
        etiqueta_id: etiquetaId,
      });
      setModalTagOpen(false);
      await fetchChats(true);
    } catch (e) {
      setModalTagError(e?.message || "No se pudo guardar la etiqueta");
    } finally {
      setModalTagLoading(false);
    }
  };

  const refreshEtiquetasYChats = useCallback(async () => {
    await fetchEtiquetas();
    await fetchChats(true);
  }, [fetchEtiquetas, fetchChats]);

  const doVaciarChat = async () => {
    const waId = modalVaciarWa;
    if (!waId) return;

    setModalVaciarLoading(true);
    setModalVaciarError("");
    try {
      await botManagementPost("vaciar_chat", {
        wa_id: waId,
      });

      setModalVaciarOpen(false);

      if (selectedIdRef.current === waId) {
        setSelectedId(null);
        setMensajes([]);
      }

      await fetchChats(true);
    } catch (e) {
      setModalVaciarError(e?.message || "No se pudo vaciar el chat");
    } finally {
      setModalVaciarLoading(false);
    }
  };

  const doEliminarContacto = async () => {
    const waId = modalEliminarWa;
    if (!waId) return;

    setModalEliminarLoading(true);
    setModalEliminarError("");
    try {
      await botManagementPost("eliminar_contacto", { wa_id: waId });

      setModalEliminarOpen(false);

      if (selectedIdRef.current === waId) {
        setSelectedId(null);
        setMensajes([]);
      }

      await fetchChats(true);
    } catch (e) {
      setModalEliminarError(e?.message || "No se pudo eliminar el contacto");
    } finally {
      setModalEliminarLoading(false);
    }
  };

  const doEliminarAlerta = async () => {
    const idEvento = Number(modalEliminarAlertaId || 0);
    if (idEvento <= 0) return;

    setModalEliminarAlertaLoading(true);
    setModalEliminarAlertaError("");
    try {
      await eliminarEventoSinAccion(idEvento, { throwOnError: true });
      setModalEliminarAlertaOpen(false);
      setModalEliminarAlertaId(null);
    } catch (e) {
      setModalEliminarAlertaError(e?.message || "No se pudo eliminar la alerta");
    } finally {
      setModalEliminarAlertaLoading(false);
    }
  };

  const galleryItems = useMemo(() => {
    const arr = Array.isArray(mensajes) ? mensajes : [];
    const files = arr
      .filter((m) => !!m?.media_url)
      .map((m) => {
        const url = m.media_url;
        const mime = m.media_mime || inferMimeFromUrl(url);
        const kind = isPdfMime(mime)
          ? "pdf"
          : isImageMime(mime)
          ? "image"
          : "file";
        return {
          url,
          mime,
          kind,
          name: m.media_name || inferNameFromUrl(url),
          size: m.media_size || 0,
          ts: m.ts || 0,
        };
      });

    files.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return files;
  }, [mensajes]);

  const openGaleria = () => {
    setGaleriaOpen(true);
  };

  const closeGaleria = () => setGaleriaOpen(false);

  const onOpenGalleryItem = (it) => {
    openViewer({ url: it.url, mime: it.mime, name: it.name });
  };

  return (
    <div className="wp-shell">
      <audio ref={audioUrgentRef} preload="auto" src={notificationSound} />

      <BotSidebar
        activeTagFilterLabel={activeTagFilterLabel}
        abrirPanelAlertas={abrirPanelAlertas}
        chats={chats}
        errorChats={errorChats}
        errorEtiquetas={errorEtiquetas}
        etiquetas={etiquetas}
        eventosResumen={eventosResumen}
        list={list}
        loadingChats={loadingChats}
        loadingEtiquetas={loadingEtiquetas}
        onBack={() => navigate("/panel", { replace: true })}
        openChat={openChat}
        q={q}
        selectedId={selectedId}
        setQ={setQ}
        setTagFilter={setTagFilter}
        setTagFilterOpen={setTagFilterOpen}
        tagCounts={tagCounts}
        tagFilter={tagFilter}
        tagFilterOpen={tagFilterOpen}
        tagFilterRef={tagFilterRef}
      />

      <main className="wp-main">
        {!selectedId ? (
          <div className="wp-main-empty">
            <div className="wp-main-empty-card">
              <div className="wp-main-empty-ico" aria-hidden="true">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <h2>Seleccioná un chat</h2>
              <p>Elegí una conversación para ver los mensajes.</p>
            </div>
          </div>
        ) : (
          <>
            <BotConversationHeader
              headerMenuBtnRef={headerMenuBtnRef}
              isWindowExpired={isWindowExpired}
              marcarChatComoLeido={marcarChatComoLeido}
              marcarChatComoNoLeido={marcarChatComoNoLeido}
              mode={mode}
              openCambiarEtiqueta={openCambiarEtiqueta}
              openEditarNombre={openEditarNombre}
              openEliminarContacto={openEliminarContacto}
              openGaleria={openGaleria}
              openMenu={openMenu}
              openVaciarChat={openVaciarChat}
              selected={selected}
              selectedConsultasPendientes={selectedConsultasPendientes}
              selectedId={selectedId}
              selectedWindow={selectedWindow}
              setModeDB={setModeDB}
              setOpenMenu={setOpenMenu}
              theme={theme}
              toggleTheme={toggleTheme}
            />

            <BotMessageList
              abrirPanelAlertas={abrirPanelAlertas}
              errorMsgs={errorMsgs}
              mensajes={mensajes}
              messagesRef={messagesRef}
              msgEndRef={msgEndRef}
              openViewer={openViewer}
            />

            <BotComposer
              attachedFile={attachedFile}
              clearAttached={clearAttached}
              composerRef={composerRef}
              draft={draft}
              emojiBtnRef={emojiBtnRef}
              emojiOpen={emojiOpen}
              emojiPopRef={emojiPopRef}
              fileInputRef={fileInputRef}
              insertAtCursor={insertAtCursor}
              isConsultaManualBlockedByTemplatePending={isConsultaManualBlockedByTemplatePending}
              isWindowExpired={isWindowExpired}
              mode={mode}
              onAttachClick={onAttachClick}
              onFilePicked={onFilePicked}
              onKeyDownDraft={onKeyDownDraft}
              selectedConsultasPendientes={selectedConsultasPendientes}
              sendManual={sendManual}
              sendingMedia={sendingMedia}
              setDraft={setDraft}
              setEmojiOpen={setEmojiOpen}
            />
          </>
        )}
      </main>

      <MediaViewerModal open={viewerOpen} onClose={closeViewer} item={viewerItem} />

      <BotEventosModal
        open={eventosOpen}
        onClose={() => setEventosOpen(false)}
        eventos={eventos}
        resumen={eventosResumen}
        loading={loadingEventos}
        error={errorEventos}
        onRefresh={() => fetchEventos(false)}
        onMarkOne={(idEvento) => marcarEventoRevisado(idEvento)}
        onDeleteOne={(idEvento) => openEliminarAlerta(idEvento)}
        onAprobarComprobante={(idComprobante, idEvento) => aprobarComprobanteVenta(idComprobante, idEvento)}
        onRechazarComprobante={(idComprobante, idEvento) => rechazarComprobanteVenta(idComprobante, idEvento)}
        onOpenChat={(waId) => {
          setEventosOpen(false);
          openChat(waId);
        }}
      />

      <ComprobanteRevisionModal
        open={comprobanteConfirm.open}
        accion={comprobanteConfirm.accion}
        detalle={comprobanteConfirm.detalle}
        loadingDetalle={comprobanteConfirm.loadingDetalle}
        motivo={comprobanteConfirm.motivo}
        montoManual={comprobanteConfirm.montoManual}
        cantidadManual={comprobanteConfirm.cantidadManual}
        loading={comprobanteConfirmLoading}
        error={comprobanteConfirmError}
        onChangeCampo={setCampoComprobanteConfirm}
        onClose={cerrarConfirmacionComprobante}
        onConfirm={ejecutarAccionComprobante}
      />

      <GaleriaModal
        open={galeriaOpen}
        inactive={viewerOpen}
        onClose={closeGaleria}
        items={galleryItems}
        title={`Galería • ${selected?.nombre || "Sin nombre"}`}
        onOpenItem={(it) => onOpenGalleryItem(it)}
      />

      <EditNombreModal
        open={modalEditOpen}
        waId={modalEditWa}
        currentName={chats.find((x) => x.id === modalEditWa)?.nombre || ""}
        loading={modalEditLoading}
        error={modalEditError}
        onClose={() => setModalEditOpen(false)}
        onSave={saveNombre}
      />

      <EditEtiquetaModal
        open={modalTagOpen}
        waId={modalTagWa}
        currentEtiquetaId={chats.find((x) => x.id === modalTagWa)?.etiqueta_id || null}
        currentEtiquetaNombre={chats.find((x) => x.id === modalTagWa)?.etiqueta || ""}
        etiquetas={etiquetas}
        loading={modalTagLoading || loadingEtiquetas}
        error={modalTagError || errorEtiquetas}
        onClose={() => setModalTagOpen(false)}
        onSave={saveEtiqueta}
        onRefreshEtiquetas={fetchEtiquetas}
        onLabelsChanged={refreshEtiquetasYChats}
      />

      <ConfirmActionModal
        open={modalEliminarAlertaOpen}
        title="Eliminar alerta"
        description="La alerta va a desaparecer del panel. No se aprueba, no se rechaza y no se envía ningún mensaje por WhatsApp."
        confirmText="Eliminar alerta"
        cancelText="Cancelar"
        danger
        loading={modalEliminarAlertaLoading}
        error={modalEliminarAlertaError}
        onClose={() => {
          if (modalEliminarAlertaLoading) return;
          setModalEliminarAlertaOpen(false);
          setModalEliminarAlertaId(null);
          setModalEliminarAlertaError("");
        }}
        onConfirm={doEliminarAlerta}
      />

      <ConfirmActionModal
        open={modalVaciarOpen}
        title="Vaciar chat"
        description={`Esto va a borrar TODOS los mensajes del chat (${modalVaciarWa}).`}
        confirmText="Vaciar"
        danger
        loading={modalVaciarLoading}
        error={modalVaciarError}
        onClose={() => setModalVaciarOpen(false)}
        onConfirm={doVaciarChat}
      />

      <ConfirmActionModal
        open={modalEliminarOpen}
        title="Eliminar contacto"
        description={`Esto va a borrar el contacto + chat + vistos (${modalEliminarWa}).`}
        confirmText="Eliminar"
        danger
        loading={modalEliminarLoading}
        error={modalEliminarError}
        onClose={() => setModalEliminarOpen(false)}
        onConfirm={doEliminarContacto}
      />
    </div>
  );
};

export default BotPanel;