import React from 'react';

/** Paginación compartida con los estilos global-pagination del sistema. */
export default function GlobalPagination({ page = 1, total = 0, perPage = 20, onPageChange, loading = false, label = 'registros' }) {
  const count = Math.max(0, Number(total) || 0);
  const size = Math.max(1, Number(perPage) || 20);
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  const visible = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  const options = [];
  visible.forEach((value, index) => {
    if (index && value - visible[index - 1] > 1) options.push(`gap-${value}`);
    options.push(value);
  });
  if (!count) return null;
  return <nav className="global-pagination" aria-label={`Paginación de ${label}`}>
    <p className="global-pagination__summary" aria-live="polite">
      Mostrando <strong>{(current - 1) * size + 1}</strong>–<strong>{Math.min(current * size, count)}</strong> de <strong>{count}</strong> {label}
      {loading ? <span>Cargando página...</span> : null}
    </p>
    <div className="global-pagination__controls">
      <button type="button" disabled={loading || current <= 1} onClick={() => onPageChange(current - 1)}>Anterior</button>
      {options.map(value => typeof value === 'number'
        ? <button type="button" key={value} className={value === current ? 'is-active' : ''}
            aria-label={`Página ${value}`} aria-current={value === current ? 'page' : undefined}
            disabled={loading} onClick={() => onPageChange(value)}>{value}</button>
        : <span key={value} className="global-pagination__ellipsis" aria-hidden="true">…</span>)}
      <button type="button" disabled={loading || current >= pages} onClick={() => onPageChange(current + 1)}>Siguiente</button>
    </div>
  </nav>;
}
