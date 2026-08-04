import React from "react";

export default function SummaryCards({
  title = "Resumen",
  ariaLabel,
  items = [],
  variant = "default",
  className = "",
  actions,
}) {
  if (!items.length) return null;

  const variantClass =
    variant === "footer" ? "global-summaryCards--footer" : "";

  return (
    <section
      className={`global-summaryCards ${variantClass} ${className}`.trim()}
      aria-label={ariaLabel || title}
    >
      <strong className="global-summaryCards__title">{title}</strong>
      <div className="global-summaryCards__list">
        {items.map((item) => {
          const hasDetail = item.detail !== undefined && item.detail !== null;

          return (
            <article
              className={`global-summaryCards__item ${
                hasDetail ? "" : "global-summaryCards__item--simple"
              }`.trim()}
              key={item.key || item.label}
            >
              <span className="global-summaryCards__label">{item.label}</span>
              {hasDetail ? (
                <small className="global-summaryCards__detail">
                  {item.detail}
                </small>
              ) : null}
              <b className="global-summaryCards__value">{item.value}</b>
            </article>
          );
        })}
      </div>
      {actions ? (
        <div className="global-summaryCards__actions">{actions}</div>
      ) : null}
    </section>
  );
}
