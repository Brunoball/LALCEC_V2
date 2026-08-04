import React, { useEffect, useRef, useState } from "react";
import DataTableSkeleton from "./DataTableSkeleton";

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
  loading = false,
  loadingLabel = "Cargando registros...",
  skeletonActionColumn = true,
  skeletonRows = 6,
}) {
  const bodyRef = useRef(null);
  const [hasVerticalScroll, setHasVerticalScroll] = useState(false);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;

    let animationFrame = 0;
    const updateScrollbar = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const hasOverflow = body.scrollHeight > body.clientHeight + 1;
        const width = hasOverflow
          ? Math.max(0, body.offsetWidth - body.clientWidth)
          : 0;
        setHasVerticalScroll(hasOverflow);
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

  const actionColumnIndex =
    typeof skeletonActionColumn === "number"
      ? skeletonActionColumn
      : skeletonActionColumn
        ? Math.max(0, columns.length - 1)
        : -1;

  return (
    <div
      className={`global-divTable ${hasVerticalScroll ? "has-y-scroll" : ""} ${className}`.trim()}
      role="table"
      aria-label={ariaLabel}
      aria-busy={loading}
      style={{ "--global-table-scrollbar-width": `${scrollbarWidth}px` }}
    >
      {loading ? (
        <span className="mov-skeletonStatus" role="status" aria-live="polite">
          {loadingLabel}
        </span>
      ) : null}
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
        {loading ? (
          <DataTableSkeleton
            actionColumnIndex={actionColumnIndex}
            columnCount={columns.length}
            gridClassName={gridClassName}
            rows={skeletonRows}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
