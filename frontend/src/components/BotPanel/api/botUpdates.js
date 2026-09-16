import { botPanelGet } from "./botApi";

// Un solo monitor por pestaña. Principal y el panel se suscriben a cambios;
// una respuesta sin novedades no vuelve a descargar chats ni mensajes.
const subscribers = new Set();
let timer = null;
let running = false;
let controller = null;
let latest = null;
let failures = 0;
let refreshRequested = false;
let generation = 0;

const interval = () => Math.max(
  document.visibilityState === "hidden" ? 30000 : 4000,
  failures ? Math.min(60000, 4000 * (2 ** failures)) : 0,
);

function schedule(delay) {
  window.clearTimeout(timer);
  timer = null;
  if (subscribers.size && navigator.onLine !== false) {
    timer = window.setTimeout(checkUpdates, delay);
  }
}

async function checkUpdates() {
  if (running || !subscribers.size || navigator.onLine === false) return;
  running = true;
  refreshRequested = false;
  const currentGeneration = generation;
  const currentController = new AbortController();
  controller = currentController;
  const timeout = window.setTimeout(() => currentController.abort(), 12000);
  try {
    const data = await botPanelGet("panel_global_hash", {
      ...(latest?.hash ? { hash: latest.hash } : {}),
    }, { signal: currentController.signal });
    if (generation !== currentGeneration) return;
    if (!data.hash || (!data.unchanged && !data.chat_hashes)) {
      throw new Error("Actualizá los archivos del backend del bot para consultar novedades.");
    }
    if (!data.unchanged) latest = data;
    // Si la descarga de un consumidor falla, conserva su versión anterior y
    // vuelve a intentarlo en el próximo ciclo aunque el hash no haya cambiado.
    const results = await Promise.allSettled([...subscribers].map(async (subscriber) => {
      if (!latest || subscriber.hash === latest.hash || !subscribers.has(subscriber)) return;
      const snapshot = latest;
      try {
        await subscriber.onChange(snapshot);
        if (generation === currentGeneration && subscribers.has(subscriber)) subscriber.hash = snapshot.hash;
      } catch (error) {
        if (subscribers.has(subscriber)) subscriber.onError?.(error);
        throw error;
      }
    }));
    failures = results.some((result) => result.status === "rejected") ? failures + 1 : 0;
  } catch (error) {
    if (generation === currentGeneration) {
      failures += 1;
      for (const subscriber of subscribers) {
        subscriber.hash = null;
        subscriber.onError?.(error);
      }
    }
  } finally {
    window.clearTimeout(timeout);
    if (controller === currentController) controller = null;
    running = false;
    schedule(refreshRequested && failures === 0 ? 250 : interval());
  }
}

// Una acción del usuario pide comprobar la señal; no se repiten mutaciones.
export function requestBotRefresh() {
  refreshRequested = true;
  if (!running) schedule(failures ? interval() : 250);
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") requestBotRefresh();
  else if (!running) schedule(interval());
}

function onOnline() {
  failures = 0;
  requestBotRefresh();
}

function onOffline() {
  window.clearTimeout(timer);
  controller?.abort();
}

export function subscribeBotUpdates(onChange, onError) {
  const subscriber = { onChange, onError, hash: null };
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    requestBotRefresh();
  }
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      generation += 1;
      window.clearTimeout(timer);
      timer = null;
      controller?.abort();
      latest = null;
      failures = 0;
      refreshRequested = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
  };
}
