import React from "react";

export default function SalesSwitchField({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      className={`sales-stockControl ${checked ? "is-active" : ""}`}
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      aria-label={label}
    >
      <span className="sales-stockControl__copy">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="sales-stockControl__visual" aria-hidden="true">
        <span className="sales-stockControl__state">
          {checked ? "Sí" : "No"}
        </span>
        <span className="sales-stockControl__track">
          <span className="sales-stockControl__thumb" />
        </span>
      </span>
    </button>
  );
}
