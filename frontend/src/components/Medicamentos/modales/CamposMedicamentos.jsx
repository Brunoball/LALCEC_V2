import React from 'react';
import '../../Global/Global_css/Global_TabbedForms.css';
export function Campo({ label, value, onChange, options, textarea, type='text', required=false, min, step, placeholder, wide=false, disabled=false }) {
  const attrs = { value: value ?? '', onChange: (event) => onChange(event.target.value), required, disabled };
  const active = options || type === 'date' || String(value ?? '').length > 0;
  return <label className={`entity-field entity-floating-field ${wide ? 'entity-field--wide' : ''} ${textarea ? 'is-textarea' : ''} ${active ? 'is-active' : ''}`}><span>{label}{required ? ' *' : ''}</span>
    {options ? <select {...attrs}>{options.map((item) => <option key={item.value} value={item.value}>{String(item.label).toLocaleUpperCase('es-AR')}</option>)}</select>
      : textarea ? <textarea {...attrs} placeholder={placeholder || ' '} rows={3} />
      : <input {...attrs} type={type} min={min} step={step} placeholder={placeholder || ' '} />}
  </label>;
}
export function Campos({ children }) { return <div className="entity-form"><div className="entity-form__grid">{children}</div></div>; }
export const op = (value, label) => ({ value: String(value), label });
