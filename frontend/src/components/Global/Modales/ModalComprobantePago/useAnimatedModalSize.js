/**
 * Compatibilidad con los modales existentes.
 *
 * Antes este hook medía y animaba el alto del modal ante cada cambio de
 * contenido. Eso generaba pequeños saltos visuales y trabajo de layout extra.
 * Los modales ahora dejan que el navegador resuelva su tamaño de forma natural.
 */
export default function useAnimatedModalSize() {
  // Intencionalmente sin animación de tamaño.
}
