const withoutTrailingSlash = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const BASE_URL = withoutTrailingSlash(
  process.env.REACT_APP_API_URL || "http://localhost:3001/routes",
);

// Ruta interna del frontend. Se abre en otra pestaña desde el menú principal.
export const BOT_PANEL_ROUTE = "/panel-bot";

// Una sola raíz configurable para todo el backend del bot.
// En producción puede sobrescribirse con REACT_APP_BOT_PANEL_BASE_URL.
export const BOT_PANEL_BASE_URL = withoutTrailingSlash(
  process.env.REACT_APP_BOT_PANEL_BASE_URL ||
    "https://cooperadora.ipet50.edu.ar/api/bot_wp/funciones/Panel",
);

// Se mantienen las variables anteriores por compatibilidad con despliegues existentes.
export const BOT_PANEL_ENDPOINTS_URL = withoutTrailingSlash(
  process.env.REACT_APP_BOT_PANEL_URL ||
    `${BOT_PANEL_BASE_URL}/endpoints`,
);

export const BOT_PANEL_PUNTOS_URL = withoutTrailingSlash(
  process.env.REACT_APP_BOT_PANEL_PUNTOS_URL ||
    `${BOT_PANEL_BASE_URL}/puntos`,
);

export default BASE_URL;


// cd backend /  php -c "C:\php\php.ini" -S localhost:3001

//usuario: admin_socio
//contraseña: @Socios_2026
