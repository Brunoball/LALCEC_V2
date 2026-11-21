const withoutTrailingSlash = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const BASE_URL = withoutTrailingSlash(
  process.env.REACT_APP_API_URL || "http://localhost:3001/routes",
);

export const isLocalFrontendRuntime = () => {
  if (typeof window === "undefined") return false;

  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
};

// Ruta interna del frontend para abrir el panel del bot.
export const BOT_PANEL_ROUTE = "/panel-bot";

// Única URL base para toda la API del bot.
// botApi.js agrega automáticamente /endpoints o /puntos según la acción.
export const BOT_URL = withoutTrailingSlash(
  process.env.REACT_APP_BOT_URL ||
    "https://lalcec.3devsnet.com/api/bot_whatsapp/funciones/Panel",
);

export default BASE_URL;

// php -c "C:\\php\\php.ini" -S localhost:3001
// npx playwright test --project=chromium --workers=1 --reporter=list

//https://lalcec.3devsnet.com/api/routes
//http://localhost:3001/routes


