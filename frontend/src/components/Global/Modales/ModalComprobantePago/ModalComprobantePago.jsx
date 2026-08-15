import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faPrint } from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../CrudModal";
import {
  normalizePaymentReceipt,
  normalizePaymentReceipts,
} from "../../../_shared/utils/comprobantePago";
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

  const summaryReceipt = normalizePaymentReceipt(comprobante);
  const receipts = normalizePaymentReceipts(comprobante);
  const receipt = receipts[0] || summaryReceipt;
  const receiptCount = receipts.length;
  const isBatch = receiptCount > 1;
  const isWaiver = receipts.every((item) => item.estado === "CONDONADO");
  const total = receipts.reduce(
    (amount, item) => amount + Number(item.monto || 0),
    0,
  );

  return (
    <CrudModal
      open={open}
      title={
        isBatch
          ? isWaiver
            ? `Registro de ${receiptCount} condonaciones`
            : `Registro de ${receiptCount} pagos`
          : isWaiver
            ? "Registro de condonación"
            : "Registro de pagos"
      }
      subtitle={
        isBatch
          ? "Se generó un comprobante individual por cada pago."
          : receipt.codigo
            ? `Operación ${receipt.codigo}`
            : "La operación fue registrada correctamente."
      }
      onClose={onClose}
      hideCancel
      hideSubmit
      closeOnBackdrop={false}
      modalClassName="payment-receipt-modal"
    >
      <section
        className="payment-receipt-info-summary"
        aria-label="Información del comprobante"
      >
        <article>
          <span>
            {isBatch
              ? "Comprobantes"
              : receipt.tipoEntidad === "EMPRESA"
                ? "Empresa"
                : "Socio"}
          </span>
          <strong>
            {isBatch
              ? `${receiptCount} comprobantes · uno por página`
              : receipt.socios}
          </strong>
        </article>
        <article>
          <span>Fecha de pago</span>
          <strong>{date(receipt.fecha)}</strong>
        </article>
      </section>

      <section className="payment-receipt-success" role="status">
        <h2>
          {isBatch
            ? `¡${receiptCount} ${
                isWaiver ? "condonaciones realizadas" : "pagos realizados"
              } con éxito!`
            : `¡${
                isWaiver ? "Condonación realizada" : "Pago realizado"
              } con éxito!`}
        </h2>
        <p>
          {loading
            ? "Estamos completando los datos del comprobante."
            : isBatch
              ? "Al imprimir o descargar el PDF, cada pago ocupará una página separada."
              : "Podés generar el comprobante ahora mismo."}
        </p>
      </section>

      <div className="payment-receipt-footer">
        <div className="payment-receipt-total-pill">
          <span>Total:</span>
          <strong>{money(total)}</strong>
        </div>

        <div className="payment-receipt-actions">
          <button
            className="mov-btn mov-btn--ghost payment-receipt-actions__close"
            type="button"
            onClick={onClose}
          >
            Cerrar
          </button>
          <button
            className="mov-btn payment-receipt-actions__print"
            type="button"
            onClick={onPrint}
          >
            <FontAwesomeIcon icon={faPrint} />
            {isBatch ? "Comprobantes" : "Comprobante"}
          </button>
          <button
            className="mov-btn payment-receipt-actions__pdf"
            type="button"
            onClick={onExportPdf}
          >
            <FontAwesomeIcon icon={faFilePdf} />
            PDF
          </button>
        </div>
      </div>
    </CrudModal>
  );
}
