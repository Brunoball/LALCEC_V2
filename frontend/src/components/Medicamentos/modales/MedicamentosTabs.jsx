import React, { useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import '../../Global/Global_css/Global_TabbedForms.css';

export function MedSection({ icon, children }) {
  return <h3 className="med-section-title"><FontAwesomeIcon icon={icon} aria-hidden="true" />{children}</h3>;
}

export default function MedicamentosTabs({ tabs, children, disabled = false }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const panels = React.Children.toArray(children);
  const revealInvalid = (event) => {
    const field = event.target;
    if (field.form?.querySelector(':invalid') !== field) return;
    const panel = field.closest('[data-med-panel]');
    if (!panel?.hidden) return;
    event.preventDefault();
    flushSync(() => setActive(Number(panel.dataset.medPanel)));
    requestAnimationFrame(() => { field.focus(); field.reportValidity(); });
  };
  if (tabs.length === 1) return <><MedSection icon={tabs[0].icon}>{tabs[0].label}</MedSection>{panels}</>;
  return <div className="med-tabbed-form" onInvalidCapture={revealInvalid}>
    <div className="entity-form-tabs" role="tablist" aria-label="Secciones del formulario">
      {tabs.map((tab, index) => <button type="button" role="tab" key={tab.label}
        id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index}
        tabIndex={active === index ? 0 : -1} disabled={disabled}
        className={`entity-form-tab ${active === index ? 'is-active' : ''}`}
        onClick={() => setActive(index)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setActive(next);
          document.getElementById(`${id}-tab-${next}`)?.focus();
        }}><FontAwesomeIcon icon={tab.icon} aria-hidden="true" /><span>{tab.label}</span></button>)}
    </div>
    {panels.map((panel, index) => <div key={index} role="tabpanel" id={`${id}-panel-${index}`}
      aria-labelledby={`${id}-tab-${index}`} data-med-panel={index} hidden={active !== index}
      className="med-tab-panel">{panel}</div>)}
  </div>;
}
