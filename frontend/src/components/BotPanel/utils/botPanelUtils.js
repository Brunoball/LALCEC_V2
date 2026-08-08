export const fmtHora = (ts) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

/** Fecha corta + hora para la lista de chats: DD/MM HH:MM */
export const fmtFechaHoraLista = (ts) => {
  if (!Number.isFinite(Number(ts))) return "";
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
};

/** Fecha completa para tooltips: DD/MM/AAAA HH:MM */
export const fmtFechaHoraCompleta = (ts) => {
  if (!Number.isFinite(Number(ts))) return "";
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

export const fmtDateKey = (ts) => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const isSameDay = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

export const fmtFechaSeparador = (ts) => {
  if (!Number.isFinite(ts)) return "";

  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;

  if (isSameDay(ts, now)) return "Hoy";
  if (isSameDay(ts, yesterday)) return "Ayer";

  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
};


export const toTs = (value) => {
  if (!value) return null;
  const s = String(value).trim();

  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!m) {
    const d = new Date(s);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const min = Number(m[5]);
  const sec = Number(m[6] ?? 0);

  return new Date(year, month, day, hour, min, sec).getTime();
};

export const normStr = (v) => String(v ?? "").trim();

export const buildConsultaTemplateText = (respuesta, fallback = "Te escribimos desde LALCEC.") => {
  const body = normStr(respuesta) || fallback;
  return `Hola 👋

Te respondemos desde LALCEC San Francisco.

${body}

Si necesitás continuar, respondé este mensaje y te seguimos ayudando.`;
};

export const CONSULTA_TEMPLATE_VARIABLE_PLACEHOLDER =
  "Acá se va a insertar la respuesta que escribas abajo.";

export const EMOJIS_RAPIDOS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊",
  "😍", "🥰", "😘", "😎", "🤔", "😢", "😭", "😡",
  "👍", "👎", "👌", "👏", "🙌", "🙏", "💪", "👋",
  "❤️", "💚", "💙", "💛", "🔥", "✨", "🎉", "✅",
  "❌", "⚠️", "📌", "📎", "📷", "📄", "💬", "📞",
  "💰", "💳", "🧾", "📅", "⏰", "🚚", "📦", "🏫",
];

// ✅ Plantilla aprobada en WhatsApp.
// Habilita el envío de consulta_manual_fuera_24h cuando la ventana de 24hs está expirada.
export const CONSULTA_MANUAL_TEMPLATE_ENABLED = true;

export const pickNombre = (c) => {
  const candidates = [
    c?.nombre,
    c?.nombre_contacto,
    c?.contacto_nombre,
    c?.nombre_db,
    c?.name,
    c?.full_name,
    c?.display_name,
    c?.perfil_nombre,
  ];
  for (const v of candidates) {
    const s = normStr(v);
    if (s) return s;
  }
  return "";
};

export const pickModo = (c) => {
  const m = normStr(c?.modo);
  return m === "manual" ? "manual" : "bot";
};

export const mapEmisorToSide = (emisor) => {
  const e = normStr(emisor).toLowerCase();
  if (e === "usuario" || e === "user") return "left";
  if (e === "bot") return "rightbot";
  return "right"; // Admin/Panel
};

export const MS_24H = 24 * 60 * 60 * 1000;

export function calcWindow(ventana24hTs, nowTs) {
  if (!ventana24hTs || !Number.isFinite(ventana24hTs)) {
    return { valid: false, remainingMs: 0, remainingHours: 0, expireAt: null };
  }
  const expireAt = ventana24hTs + MS_24H;
  const remainingMs = expireAt - nowTs;
  const valid = remainingMs > 0;
  const remainingHours = valid
    ? Math.max(0, Math.ceil(remainingMs / 3600000))
    : 0;

  return {
    valid,
    remainingMs: Math.max(0, remainingMs),
    remainingHours,
    expireAt,
  };
}

export const isImageMime = (mime) => /^image\//i.test(String(mime || ""));
export const isPdfMime = (mime) =>
  String(mime || "").toLowerCase() === "application/pdf";

export const inferMimeFromUrl = (url) => {
  const u = String(url || "").toLowerCase();
  if (!u) return "";
  if (u.includes(".pdf")) return "application/pdf";
  if (u.includes(".png")) return "image/png";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".gif")) return "image/gif";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  return "";
};

export const inferNameFromUrl = (url) => {
  try {
    const u = String(url || "");
    const clean = u.split("?")[0];
    const parts = clean.split("/");
    return parts[parts.length - 1] || "archivo";
  } catch {
    return "archivo";
  }
};

export const fmtBytes = (n) => {
  const v = Number(n || 0);
  if (!v) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

/* =========================
   ✅ MODAL VISOR (IMG / PDF)
========================= */
