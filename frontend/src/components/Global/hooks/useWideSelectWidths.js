import { useEffect } from 'react';
import '../Global_css/Global_SelectWidths.css';

// A partir de 1600 px, cada select toma el ancho de su opción más larga.
// En pantallas escaladas (Windows/zoom del navegador), el ancho CSS puede ser
// menor que la resolución real. Solo contemplamos esa diferencia cuando el
// viewport CSS conserva el encabezado de escritorio (>= 1500 px).
const isWideDesktop = () => {
  const cssWidth = window.innerWidth;
  const physicalWidth = cssWidth * (window.devicePixelRatio || 1);
  return cssWidth >= 1600 || (cssWidth >= 1500 && physicalWidth >= 1600);
};

export default function useWideSelectWidths() {
  useEffect(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return undefined;

    const managed = new Set();
    let frame = 0;
    let disposed = false;

    const clear = () => {
      managed.forEach(element => {
        element.style.removeProperty('--global-select-option-width');
        element.removeAttribute('data-wide-select-width');
      });
      managed.clear();
    };

    const apply = (element, width) => {
      element.style.setProperty('--global-select-option-width', `${width}px`);
      element.setAttribute('data-wide-select-width', '');
      managed.add(element);
    };

    const update = () => {
      frame = 0;
      clear();
      if (disposed) return;

      const isWide = isWideDesktop();
      document.documentElement.toggleAttribute('data-wide-selects-active', isWide);
      if (!isWide) return;

      document.querySelectorAll('select').forEach(select => {
        // El ancho por la opción más larga es exclusivo de los filtros/selectores
        // de las secciones. Los modales (CrudModal, ModalEliminarGlobal y otros)
        // utilizan su distribución responsive original, incluso en >1600 px.
        // closest() también cubre los modales montados con createPortal.
        if (select.closest('[role="dialog"], [aria-modal="true"], .entity-modal-overlay, .gdel-overlay')) return;
        if (!select.getClientRects().length) return;

        const style = window.getComputedStyle(select);
        const number = value => parseFloat(value) || 0;
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const spacing = number(style.letterSpacing);
        let longest = 0;

        Array.from(select.options).forEach(option => {
          let value = option.label || option.textContent || '';
          if (style.textTransform === 'uppercase') value = value.toLocaleUpperCase('es-AR');
          if (style.textTransform === 'lowercase') value = value.toLocaleLowerCase('es-AR');
          if (style.textTransform === 'capitalize') value = value.replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('es-AR'));
          longest = Math.max(longest, context.measureText(value).width + Math.max(0, Array.from(value).length - 1) * spacing);
        });

        // La flecha nativa usa espacio adicional incluso con padding-right.
        const nativeArrow = style.appearance !== 'none' && !select.multiple && select.size <= 1;
        const width = Math.ceil(longest + number(style.paddingLeft) + number(style.paddingRight)
          + number(style.borderLeftWidth) + number(style.borderRightWidth)
          + (nativeArrow ? 30 : 0) + 6);

        apply(select, width);

        // Los estilos de cada módulo suelen restringir el label a 90/120/150 px.
        // Si no ampliamos también el wrapper, el select se corta o se desborda.
        const parent = select.parentElement;
        if (parent?.matches('label, .module-filter, .entity-field')) apply(parent, width);
      });
    };

    const schedule = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(update);
    };

    // Se actualiza al cargar catálogos, cambiar opciones, abrir modales o
    // variar el ancho/zoom. No observamos "style" para evitar bucles propios.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'label', 'size', 'multiple'],
    });
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(schedule);
    schedule();

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      clear();
      document.documentElement.removeAttribute('data-wide-selects-active');
    };
  }, []);
}
