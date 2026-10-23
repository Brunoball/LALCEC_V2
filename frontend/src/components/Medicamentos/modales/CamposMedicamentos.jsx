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
export function Campos({ children }) { return <div className="entity-form med-fields"><div className="entity-form__grid med-fields__row">{children}</div></div>; }
export const op = (value, label) => ({ value: String(value), label });
