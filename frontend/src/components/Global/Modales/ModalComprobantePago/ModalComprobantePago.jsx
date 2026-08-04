import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faFilePdf,
  faPrint,
} from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../../components/CrudModal";
import { normalizePaymentReceipt } from "../../../../utils/comprobantePago";
import "./ModalComprobantePago.css";

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(value || 0));

const date = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${String(value).slice(0, 10)}T00:00:00Z`),
      )
    : "—";

export default function ModalComprobantePago({
  open,
  comprobante,
  loading = false,
  onClose,
  onPrint,
  onExportPdf,
}) {
  if (!open || !comprobante) return null;

  const receipt = normalizePaymentReceipt(comprobante);
  const isWaiver = receipt.estado === "CONDONADO";

  return (
    <CrudModal
      open={open}
      title={isWaiver ? "Condonación realizada" : "Pago realizado"}
      subtitle={`${isWaiver ? "La condonación" : "El cobro"} se registró correctamente. Podés generar el comprobante ahora o hacerlo más tarde desde el listado.`}
      onClose={onClose}
      hideCancel
      hideSubmit
      modalClassName="payment-receipt-modal"
    >
      <div className="payment-receipt-success" role="status">
        <span className="payment-receipt-success__icon">
          <FontAwesomeIcon icon={faCheck} />
        </span>
        <div>
          <strong>
            ¡Listo! {isWaiver ? "La condonación" : "El pago"} fue registrado.
          </strong>
          <span>
            {loading
              ? "Estamos completando los datos oficiales del comprobante."
              : receipt.codigo
                ? `Operación ${receipt.codigo}`
                : "Comprobante disponible"}
          </span>
        </div>
      </div>

      <section className="payment-receipt-summary" aria-label="Resumen del pago">
        <article>
          <span>Socio/s</span>
          <strong>{receipt.socios}</strong>
        </article>
        <article>
          <span>Fecha</span>
          <strong>{date(receipt.fecha)}</strong>
        </article>
        <article>
          <span>Medio de pago</span>
          <strong>{receipt.medio}</strong>
        </article>
        <article className="payment-receipt-summary__total">
          <span>{isWaiver ? "Total cobrado" : "Total pagado"}</span>
          <strong>{money(receipt.monto)}</strong>
        </article>
      </section>

      <div className="payment-receipt-detail">
        <div>
          <span>Concepto</span>
          <strong>{receipt.modalidad}</strong>
        </div>
        <div>
          <span>Detalle</span>
          <strong>
            {receipt.lineas.length} concepto
            {receipt.lineas.length === 1 ? "" : "s"} incluido
            {receipt.lineas.length === 1 ? "" : "s"}
          </strong>
        </div>
      </div>

      <div className="payment-receipt-actions">
        <button
          className="mov-btn payment-receipt-actions__print"
          type="button"
          onClick={onPrint}
        >
          <FontAwesomeIcon icon={faPrint} />
          Imprimir
        </button>
        <button
          className="mov-btn payment-receipt-actions__pdf"
          type="button"
          onClick={onExportPdf}
        >
          <FontAwesomeIcon icon={faFilePdf} />
          Exportar PDF
        </button>
        <button
          className="mov-btn mov-btn--ghost payment-receipt-actions__close"
          type="button"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>

      <p className="payment-receipt-help">
        “Exportar PDF” descarga directamente el comprobante en formato PDF.
      </p>
    </CrudModal>
  );
}
