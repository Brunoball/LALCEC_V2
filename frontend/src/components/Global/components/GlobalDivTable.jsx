import React, { useEffect, useRef, useState } from "react";

/**
 * Estructura global para tablas construidas con divs.
 *
 * El encabezado queda fuera del contenedor desplazable para que la barra
 * vertical empiece debajo de él. El gutter se calcula solo cuando el cuerpo
 * realmente tiene overflow, manteniendo alineadas sus columnas.
 */
export default function GlobalDivTable({
  ariaLabel,
  bodyClassName = "",
  children,
  className = "",
  columns = [],
  gridClassName = "",
}) {
  const bodyRef = useRef(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;

    let animationFrame = 0;
    const updateScrollbar = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const hasVerticalScroll = body.scrollHeight > body.clientHeight + 1;
        const width = hasVerticalScroll
          ? Math.max(0, body.offsetWidth - body.clientWidth)
          : 0;
        setScrollbarWidth(width);
      });
    };

    updateScrollbar();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollbar);
    const mutationObserver = new MutationObserver(updateScrollbar);

    resizeObserver?.observe(body);
    mutationObserver.observe(body, { childList: true, subtree: true });
    window.addEventListener("resize", updateScrollbar);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateScrollbar);
    };
  }, []);

  return (
    <div
      className={`global-divTable ${scrollbarWidth ? "has-y-scroll" : ""} ${className}`.trim()}
      role="table"
      aria-label={ariaLabel}
      style={{ "--global-table-scrollbar-width": `${scrollbarWidth}px` }}
    >
      <div
        className={`mov-gridTable mov-gridTable--head global-divTable__head ${gridClassName}`.trim()}
        role="row"
      >
        {columns.map((column, index) => (
          <div
            className="mov-gridCell--head"
            key={typeof column === "string" ? column : index}
          >
            {column}
          </div>
        ))}
      </div>

      <div
        ref={bodyRef}
        className={`mov-tableWrap global-divTable__wrap global-divTable__body ${bodyClassName}`.trim()}
        role="rowgroup"
      >
        {children}
      </div>
    </div>
  );
}
