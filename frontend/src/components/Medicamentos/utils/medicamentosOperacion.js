/** Reusar la clave tras un error de red: el servidor puede haber confirmado la escritura. */
export function operacionConClave(ref, payload) {
  const fingerprint = JSON.stringify(payload);
  if (ref.current?.fingerprint !== fingerprint) {
    const uuid = typeof window !== 'undefined' && window.crypto?.randomUUID?.();
    const random = uuid || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    ref.current = { fingerprint, key: `med-${random}` };
  }
  return { ...payload, _idempotency_key: ref.current.key };
}
