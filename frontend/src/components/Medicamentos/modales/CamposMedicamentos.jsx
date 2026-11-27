import React from 'react';
import '../../Global/Global_css/Global_TabbedForms.css';
export function Campo({ label, value, onChange, options, textarea, blurOnEnter=false, type='text', required=false, min, max, step, maxLength, placeholder, wide=false, disabled=false, money=false, quantity=false, className='', onAddOption }) {
  const attrs = { value: value ?? '', onChange: (event) => { if (onAddOption && event.target.value === '__MED_AGREGAR__') onAddOption(); else onChange(event.target.value); }, required, disabled };
  // Importes y cantidades mantienen el label arriba; 0,00 y 0 son placeholders, no valores.
  const active = money || quantity || options || type === 'date' || String(value ?? '').length > 0;
  return <label className={`entity-field entity-floating-field med-field ${className} ${wide ? 'entity-field--wide' : ''} ${textarea ? 'is-textarea' : ''} ${money ? 'med-field--money has-placeholder-on-float' : ''} ${quantity ? 'med-field--quantity has-placeholder-on-float' : ''} ${active ? 'is-active' : ''}`}><span>{label}{required ? ' *' : ''}</span>
    {options ? <select {...attrs}>{onAddOption && !disabled ? <option value="__MED_AGREGAR__">+ AGREGAR OPCIÓN...</option> : null}{options.map((item) => <option key={item.value} value={item.value}>{String(item.label).toLocaleUpperCase('es-AR')}</option>)}</select>
      : textarea ? <textarea {...attrs} maxLength={maxLength} placeholder={placeholder || ' '} rows={3}
        onKeyDown={event => {
          if (blurOnEnter && event.key === 'Enter' && !event.nativeEvent?.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }} />
      : <input {...attrs} type={type} min={min} max={max} step={step} maxLength={maxLength} placeholder={money ? '0,00' : quantity ? '0' : (placeholder || ' ')} />}
  </label>;
}
/** Número y unidad de dosis en una única caja; la abreviatura es editable. */
export function CampoDosis({ label, value, unidad, onChange, onUnidadChange, disabled = false, required = false }) {
  return <div className={`entity-field entity-floating-field med-dosis-field ${String(value ?? '').length > 0 ? 'is-active' : ''}`}>
    <span className="med-dosis-label" id="med-dosis-label">{label}{required ? ' *' : ''}</span>
    <div className="med-dosis-control">
      <input id="med-dosis-cantidad" type="text" autoComplete="off" aria-labelledby="med-dosis-label" required={required}
        maxLength={100} value={value ?? ''} disabled={disabled} placeholder="Ej.: 500"
        onChange={e => onChange(e.target.value)} />
      <input type="text" className="med-dosis-unidad" aria-label="Unidad de dosis" title="Unidad de dosis (editable)"
        autoComplete="off" maxLength={20} value={unidad ?? ''} disabled={disabled} placeholder="MG"
        onChange={e => onUnidadChange(e.target.value.toUpperCase())} />
    </div>
  </div>;
}
export function Campos({ children }) { return <div className="entity-form med-fields"><div className="entity-form__grid med-fields__row">{children}</div></div>; }
export const op = (value, label) => ({ value: String(value), label });
