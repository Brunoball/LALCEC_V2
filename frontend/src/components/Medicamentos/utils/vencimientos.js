import { fechaHoy } from './medicamentosUtils';

/** Fechas YYYY-MM-DD tratadas como días de calendario; sin desfasajes UTC/local. */
export const diasRestantes = (fechaObjetivo, hoy = fechaHoy()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaObjetivo || ''))) return null;
  const [y, m, d] = String(fechaObjetivo).split('-').map(Number);
  const [hy, hm, hd] = hoy.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
};
export const tonoVencimiento = (fechaObjetivo, hoy = fechaHoy()) => {
  const dias = diasRestantes(fechaObjetivo, hoy);
  if (dias === null) return 'neutral';
  if (dias < 0) return 'danger';
  if (dias <= 30) return 'warning';
  return 'safe';
};
