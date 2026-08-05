const SESSION_STORAGE_KEY = "gestion_socios_session";
export const AUTH_SESSION_CHANGED_EVENT = "gestion_socios_auth_changed";

let authChangeScheduled = false;

function notifyAuthSessionChanged() {
  if (typeof window === "undefined" || authChangeScheduled) return;

  authChangeScheduled = true;
  const notify = () => {
    authChangeScheduled = false;
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(notify);
  } else {
    setTimeout(notify, 0);
  }
}

function removeLegacyPersistentSession() {
  try {
    // Versiones anteriores guardaban el token en localStorage, por lo que la
    // sesión sobrevivía al cierre de la pestaña. Se elimina esa copia para
    // que "Recordar cuenta" nunca implique ingresar automáticamente.
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // El navegador puede bloquear el almacenamiento; no debe romper la app.
  }
}

function readSessionStorage() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function getSession() {
  removeLegacyPersistentSession();

  const session = readSessionStorage();
  if (!session?.token) return null;

  if (session.expira_en) {
    const expiresAt = Date.parse(session.expira_en);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
  }

  return session;
}

export function isAuthenticated() {
  return Boolean(getSession()?.token);
}

export function canWrite() {
  return getSession()?.usuario?.rol === "admin";
}

export function saveSession(session) {
  removeLegacyPersistentSession();
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notifyAuthSessionChanged();
}

export function clearSession() {
  let hadSession = false;
  try {
    hadSession = sessionStorage.getItem(SESSION_STORAGE_KEY) !== null;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // No impide completar el cierre de sesión en la interfaz.
  }
  removeLegacyPersistentSession();
  if (hadSession) notifyAuthSessionChanged();
}

export function openAuthenticatedTab(path) {
  const targetUrl = new URL(path, window.location.origin).toString();
  const newTab = window.open("about:blank", "_blank");

  if (!newTab) return false;

  try {
    const session = getSession();
    if (session?.token) {
      newTab.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session),
      );
    }

    // La nueva pestaña ya tiene su propia copia de la sesión; se corta el
    // acceso a la pestaña original antes de cargar el panel.
    newTab.opener = null;
    newTab.location.replace(targetUrl);
  } catch {
    // Si el navegador restringe alguna operación sobre about:blank, la
    // navegación igualmente continúa y el panel validará la sesión.
    newTab.location.href = targetUrl;
  }

  return true;
}
