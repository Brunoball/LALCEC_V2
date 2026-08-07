import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChevronDown,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../../Global/Modales/CrudModal";
import { FloatingField } from "../../Global/Formularios/TabbedForm";
import "./CuotasModal.css";

function PaymentYearChip({ value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="cuotas-year-chip" ref={containerRef}>
      <button
        type="button"
        className={open ? "is-open" : ""}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Año ${value}`}
      >
        <FontAwesomeIcon icon={faCalendarDays} />
        <span>{value}</span>
        <i aria-hidden="true" />
      </button>

      {open ? (
        <div className="cuotas-year-chip__menu" role="listbox">
          {options.map((year) => {
            const selected = String(year) === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? "is-selected" : ""}
                key={year}
                onClick={() => {
                  onChange(String(year));
                  setOpen(false);
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ModalPagoCuota({
  paymentOpen,
  paymentMode,
  tipo,
  paymentForm,
  entityLabel,
  closePayment,
  submitPayment,
  saving,
  selectedMonthIds,
  family,
  familyPendingMembers,
  contextLoading,
  paymentTotal,
  money,
  selectedPartner,
  principal,
  familyExpanded,
  setFamilyExpanded,
  setPaymentForm,
  updatePaymentDate,
  paymentYearOptions,
  updatePaymentYear,
  paymentPeriodAmount,
  availableMonthIds,
  allAvailableMonthsSelected,
  toggleAllPaymentMonths,
  monthOptions,
  paymentPeriods,
  togglePaymentMonth,
  catalogos,
  updateBatchAmount,
}) {
  return (
    <CrudModal
      open={paymentOpen}
      title={
        paymentMode === "multiple"
          ? "Registrar pagos seleccionados"
          : tipo === "PERSONA"
            ? selectedPartner?.denominacion || principal?.denominacion || "Pago de socio"
            : "Pago de empresa"
      }
      subtitle={
        paymentMode === "multiple" ? (
          `Se registrarán ${paymentForm.pagos.length} cuotas en una sola operación.`
        ) : (
          <span className="cuotas-payment-header-meta">
            {tipo === "EMPRESA" ? (
              <strong title={selectedPartner?.denominacion || ""}>
                {selectedPartner?.denominacion || `Sin ${entityLabel}`}
              </strong>
            ) : null}
            <span>
              {selectedPartner?.documento
                ? `${tipo === "EMPRESA" ? "CUIT" : "DNI"} ${selectedPartner.documento}`
                : `${tipo === "EMPRESA" ? "CUIT" : "DNI"} no informado`}
            </span>
            <span>
              Categoría {principal?.categoria || selectedPartner?.categoria || "SIN CATEGORÍA"}
            </span>
            <span>
              Cuota {money(
                principal?.monto_sugerido || selectedPartner?.monto_sugerido || 0,
              )}
            </span>
          </span>
        )
      }
      onClose={closePayment}
      onSubmit={submitPayment}
      saving={saving}
      loading={paymentMode === "single" && contextLoading}
      loadingLabel="Cargando datos del pago..."
      loadingText="Consultando los meses disponibles y la información del grupo familiar."
      submitLabel={
        paymentMode === "multiple"
          ? `Registrar ${paymentForm.pagos.length} pagos`
          : selectedMonthIds.length > 1
            ? `Registrar ${selectedMonthIds.length} cuotas`
            : paymentForm.aplicar_familia && family
              ? `Registrar pago familiar (${familyPendingMembers.length})`
              : "Registrar pago"
      }
      submitDisabled={
        contextLoading ||
        (paymentMode === "single" && !selectedMonthIds.length) ||
        !(paymentTotal > 0)
      }
      wide
      closeOnBackdrop={false}
      footerStart={
        <div className="cuotas-payment-footer-total">
          <span>Total a pagar</span>
          <strong>{money(paymentTotal)}</strong>
          <small>
            {paymentMode === "multiple"
              ? `${paymentForm.pagos.length} cuotas seleccionadas`
              : `${selectedMonthIds.length} ${selectedMonthIds.length === 1 ? "mes seleccionado" : "meses seleccionados"}`}
          </small>
        </div>
      }
      modalClassName={`cuotas-payment-modal cuotas-modal--payment ${paymentMode === "multiple" ? "cuotas-modal--batch" : ""}`.trim()}
    >
      {paymentMode === "single" ? (
        <>
          {tipo === "PERSONA" ? (
            <div className="cuotas-payment-top-context">
              {family ? (
                <section
                  className="cuotas-family-card"
                  aria-label="Grupo familiar del socio"
                >
                  <div className="cuotas-family-card__head">
                    <div className="cuotas-family-card__identity">
                      <span className="cuotas-family-card__icon" aria-hidden="true">
                        <FontAwesomeIcon icon={faUsers} />
                      </span>
                      <div>
                        <span>Grupo familiar</span>
                        <strong>{family.nombre}</strong>
                        <small>
                          {family.cantidad_integrantes} integrantes · Descuento vigente {Number(
                            family.porcentaje_descuento || 0,
                          ).toFixed(2)}%
                        </small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`cuotas-family-expand-btn ${familyExpanded ? "is-open" : ""}`.trim()}
                      onClick={() => setFamilyExpanded((current) => !current)}
                      aria-expanded={familyExpanded}
                      aria-controls="cuotas-family-members-list"
                    >
                      <span>
                        {familyExpanded
                          ? "Ocultar integrantes"
                          : "Ver integrantes"}
                      </span>
                      <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                    </button>
                  </div>

                  <label className="cuotas-family-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(paymentForm.aplicar_familia)}
                      disabled={
                        familyPendingMembers.length < 2 ||
                        selectedMonthIds.length !== 1
                      }
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          aplicar_familia: event.target.checked,
                        }))
                      }
                      aria-label="Aplicar pago a todo el grupo familiar"
                    />
                    <span>
                      <strong>Aplicar pago a todo el grupo familiar</strong>
                      <small>
                        {selectedMonthIds.length > 1
                          ? "Para cobrar varios meses, las cuotas se registran únicamente para el socio seleccionado."
                          : `Está seleccionado por defecto. Al desmarcarlo, se registra únicamente la cuota de ${
                              principal?.denominacion ||
                              selectedPartner?.denominacion ||
                              "este socio"
                            }.`}
                      </small>
                    </span>
                  </label>

                  <div
                    className={`cuotas-family-members-shell ${familyExpanded ? "is-open" : ""}`.trim()}
                    aria-hidden={!familyExpanded}
                  >
                    <div
                      id="cuotas-family-members-list"
                      className="cuotas-family-members"
                    >
                      {family.integrantes.map((member) => (
                        <article
                          key={member.id_socio}
                          className={member.puede_pagar ? "" : "is-unavailable"}
                        >
                          <div>
                            <strong>{member.denominacion}</strong>
                            <span>
                              {member.documento || "SIN DNI"} · {member.categoria || "SIN CATEGORÍA"}
                            </span>
                          </div>
                          <div>
                            {member.puede_pagar ? (
                              <>
                                <strong>{money(member.monto_sugerido)}</strong>
                                <small>Base {money(member.monto_base)}</small>
                              </>
                            ) : (
                              <strong>
                                {member.pagado ? "YA PAGADO" : "NO DISPONIBLE"}
                              </strong>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          <div
            className={`cuotas-payment-main-row ${tipo !== "PERSONA" ? "is-date-only" : ""}`.trim()}
          >
            <section
              className="cuotas-period-group cuotas-period-selector"
              aria-label="Meses a pagar"
            >
              <header>
                <div>
                  <span>Meses disponibles</span>
                </div>
                <div className="cuotas-period-selector__actions">
                  <PaymentYearChip
                    value={paymentForm.anio}
                    options={paymentYearOptions}
                    onChange={updatePaymentYear}
                    disabled={contextLoading || !paymentForm.id_socio}
                  />
                  <div
                    className="cuotas-period-amount"
                    aria-label={`Importe ${money(paymentPeriodAmount)}`}
                  >
                    <span>Importe</span>
                    <strong>
                      {contextLoading ? "Consultando…" : money(paymentPeriodAmount)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="cuotas-select-all"
                    onClick={toggleAllPaymentMonths}
                    disabled={contextLoading || !availableMonthIds.length}
                  >
                    {allAvailableMonthsSelected
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </button>
                </div>
              </header>

              <div
                className={`cuotas-month-grid ${contextLoading ? "is-loading" : ""}`}
                aria-busy={contextLoading}
              >
                {monthOptions.map((item) => {
                  const monthId = String(item.id_mes);
                  const period = paymentPeriods[monthId];
                  const selected = selectedMonthIds.includes(monthId);
                  const paid = Boolean(period?.paid);
                  const unavailable = Boolean(period?.unavailable);
                  const disabled = contextLoading || paid || unavailable;

                  return (
                    <button
                      type="button"
                      key={`${paymentForm.anio}-${monthId}`}
                      className={`${selected ? "is-selected" : ""} ${paid ? "is-paid" : ""} ${unavailable ? "is-unavailable" : ""} ${disabled && !contextLoading ? "is-disabled" : ""}`.trim()}
                      onClick={() => togglePaymentMonth(monthId)}
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${item.nombre} ${paymentForm.anio}: ${paid ? "pagado" : unavailable ? "no disponible" : selected ? "seleccionado" : "disponible"}`}
                    >
                      <strong>{item.nombre}</strong>
                      <small>{paymentForm.anio}</small>
                      <span>
                        {paid
                          ? "Pagado"
                          : unavailable
                            ? "No disponible"
                            : selected
                              ? "Seleccionado"
                              : "Disponible"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="cuotas-payment-date-card">
              <div className="cuotas-payment-date-card__header">
                <span>Datos del pago</span>
                <small>Completá la fecha, el monto y el medio de pago.</small>
              </div>

              <div className="cuotas-payment-date-card__fields">
                <FloatingField
                  label="Fecha de pago *"
                  active={Boolean(paymentForm.fecha_pago)}
                >
                  <input
                    type="date"
                    value={paymentForm.fecha_pago}
                    onChange={(event) => updatePaymentDate(event.target.value)}
                    aria-label="Fecha de pago *"
                  />
                </FloatingField>

                {selectedMonthIds.length <= 1 &&
                !(paymentForm.aplicar_familia && family) ? (
                  <FloatingField label="Monto *" active>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={paymentForm.monto}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          monto: event.target.value,
                        }))
                      }
                      aria-label="Monto *"
                      placeholder="0,00"
                    />
                  </FloatingField>
                ) : null}

                <FloatingField label="Medio de pago *" active>
                  <select
                    value={paymentForm.id_medio_pago}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        id_medio_pago: event.target.value,
                      }))
                    }
                    aria-label="Medio de pago *"
                  >
                    <option value="">Seleccionar...</option>
                    {(catalogos.medios_pago || []).map((item) => (
                      <option key={item.id_medio_pago} value={item.id_medio_pago}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </FloatingField>
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="entity-form__grid cuotas-payment-grid cuotas-payment-grid--multiple">
            <FloatingField
              label="Fecha de pago *"
              active={Boolean(paymentForm.fecha_pago)}
            >
              <input
                type="date"
                value={paymentForm.fecha_pago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    fecha_pago: event.target.value,
                  }))
                }
                aria-label="Fecha de pago *"
              />
            </FloatingField>
            <FloatingField
              label="Medio de pago *"
              active
            >
              <select
                value={paymentForm.id_medio_pago}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    id_medio_pago: event.target.value,
                  }))
                }
                aria-label="Medio de pago *"
              >
                <option value="">Seleccionar...</option>
                {(catalogos.medios_pago || []).map((item) => (
                  <option key={item.id_medio_pago} value={item.id_medio_pago}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </FloatingField>
          </div>
    
          <section
            className="cuotas-batch-list"
            aria-label="Pagos seleccionados"
          >
            <header>
              <div>
                <span>Selección múltiple</span>
                <strong>
                  {paymentForm.pagos.length} cuotas listas para registrar
                </strong>
              </div>
              <strong>{money(paymentTotal)}</strong>
            </header>
            <div>
              {paymentForm.pagos.map((payment, index) => (
                <article
                  key={`${payment.id_socio}-${payment.anio}-${payment.mes}`}
                >
                  <span className="cuotas-batch-list__index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <strong>{payment.denominacion}</strong>
                    <span>
                      {payment.documento || "—"} ·{" "}
                      {payment.categoria || "SIN CATEGORÍA"} · {payment.mes}/
                      {payment.anio}
                    </span>
                    {payment.familia ? (
                      <small>
                        {payment.familia} ·{" "}
                        {Number(
                          payment.porcentaje_descuento_familiar || 0,
                        ).toFixed(2)}
                        % de descuento
                      </small>
                    ) : null}
                  </div>
                  <label>
                    <span>Monto</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={payment.monto}
                      onChange={(event) =>
                        updateBatchAmount(index, event.target.value)
                      }
                      aria-label={`Monto de ${payment.denominacion}`}
                    />
                  </label>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </CrudModal>
  );
}
