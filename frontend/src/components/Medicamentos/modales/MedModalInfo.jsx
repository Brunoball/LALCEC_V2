import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';

/**
 * Ayuda contextual de los modales de Medicamentos.
 * El portal evita que el tooltip sea recortado por el overflow del header,
 * del contenedor global del modal o de las pestañas del formulario.
 * No modifica ni las reglas ni la estructura de los modales globales.
 */
export default function MedModalInfo({ children, info, icon }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const infoId = useId();
  const tips = (Array.isArray(info) ? info : [info]).filter(Boolean);

  useEffect(() => {
    if (!visible || !tips.length) return undefined;
    const reposition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(350, window.innerWidth - 24);
      const left = Math.max(12, Math.min(bounds.left + bounds.width / 2 - width / 2, window.innerWidth - width - 12));
      const below = bounds.bottom + 12;
      const above = below + Math.min(270, window.innerHeight * .52) > window.innerHeight - 12;
      setPosition({ left, width, ...(above ? { bottom: window.innerHeight - bounds.top + 10 } : { top: below }) });
    };
    reposition();
    const dismissOnOutsidePointer = event => {
      if (!triggerRef.current?.contains(event.target)) setVisible(false);
    };
    document.addEventListener('pointerdown', dismissOnOutsidePointer, true);
    // Captura el desplazamiento incluso cuando ocurre en el cuerpo del modal.
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePointer, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [visible, tips.length]);

  return <span className="med-modal-title-with-info">
    {icon ? <FontAwesomeIcon icon={icon} aria-hidden="true" className="med-modal-title-icon" /> : null}
    <span className="med-modal-title-label">{children}</span>
    {tips.length ? <span className="med-modal-info-trigger-wrap">
      <button ref={triggerRef} type="button" className="med-modal-info-trigger"
        aria-label="Ver información importante de este formulario" aria-describedby={visible ? infoId : undefined}
        aria-expanded={visible}
        onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)} onBlur={() => setVisible(false)}
        onClick={() => setVisible(true)}>
        <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
      </button>
      {visible && position && typeof document !== 'undefined' ? createPortal(
        <div id={infoId} role="tooltip" className="med-modal-info-popover" style={position}>
          {tips.map((tip, index) => <div className="med-modal-info-popover__text" key={index}>{tip}</div>)}
        </div>, document.body) : null}
    </span> : null}
  </span>;
}
