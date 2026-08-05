const withoutTrailingSlash = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const BASE_URL = withoutTrailingSlash(
  process.env.REACT_APP_API_URL || "http://localhost:3001/routes",
);

// Ruta interna del frontend para abrir el panel del bot.
export const BOT_PANEL_ROUTE = "/panel-bot";

// Única URL base para toda la API del bot.
// botApi.js agrega automáticamente /endpoints o /puntos según la acción.
export const BOT_URL = withoutTrailingSlash(
  process.env.REACT_APP_BOT_URL ||
    "https://lalcec.3devsnet.com/api/bot_whatshapp/funciones/Panel",
);

export default BASE_URL;

// php -c "C:\\php\\php.ini" -S localhost:3001
