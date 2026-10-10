import React from 'react';
export function Campo({ label, value, onChange, options, textarea, type='text', required=false, min, step, placeholder, wide=false, disabled=false }) {
  const attrs = { value: value ?? '', onChange: (event) => onChange(event.target.value), required, disabled };
  return <label className={`entity-field ${wide ? 'entity-field--wide' : ''}`}><span>{label}</span>
    {options ? <select {...attrs}>{options.map((item) => <option key={item.value} value={item.value}>{String(item.label).toLocaleUpperCase('es-AR')}</option>)}</select>
      : textarea ? <textarea {...attrs} placeholder={placeholder} rows={3} />
      : <input {...attrs} type={type} min={min} step={step} placeholder={placeholder} />}
  </label>;
}
export function Campos({ children }) { return <div className="entity-form"><div className="entity-form__grid">{children}</div></div>; }
export const op = (value, label) => ({ value: String(value), label });
