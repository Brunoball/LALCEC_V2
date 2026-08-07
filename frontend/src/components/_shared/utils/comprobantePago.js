const htmlEscape = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[character],
  );

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const date = (value) => {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(parsed);
};

const firstValue = (...values) =>
  values.find((value) => String(value ?? "").trim() !== "") ?? "";

const uniqueValues = (values) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

const compact = (value, limit = 92) => {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
};

export const normalizePaymentReceipt = (source = {}) => {
  const safeSource = source && typeof source === "object" ? source : {};
  const operation =
    safeSource.operacion && typeof safeSource.operacion === "object"
      ? safeSource.operacion
      : safeSource;
  const rawLines = operation.lineas || safeSource.lineas || [];
  const lines = (Array.isArray(rawLines) ? rawLines : []).map((line, index) => ({
    id:
      line.id ||
      line.id_linea ||
      `${index}-${line.periodo || line.concepto || "linea"}`,
    socio:
      line.socio ||
      line.denominacion ||
      operation.socios_label ||
      operation.socio ||
      "—",
    categoria:
      line.categoria || operation.categorias_label || operation.categoria || "—",
    periodo: line.periodo || line.descripcion || line.concepto || "—",
    montoBase: Number(line.monto_base ?? line.monto ?? 0),
    descuento: Number(
      line.porcentaje_descuento_familiar ?? line.porcentaje_descuento ?? 0,
    ),
    monto: Number(line.monto ?? 0),
    domicilio: firstValue(
      line.domicilio_2,
      line.domicilio,
      line.direccion,
      operation.domicilio_2,
      operation.domicilio,
      operation.direccion,
    ),
    cobrador: firstValue(line.cobrador, operation.cobrador),
    medio: firstValue(line.medio_pago, operation.medio_pago),
  }));

  const socios =
    operation.socios_label ||
    operation.socio ||
    safeSource.socios ||
    uniqueValues(lines.map((line) => line.socio)).join(" · ") ||
    "—";

  return {
    organizacion:
      safeSource.organizacion ||
      operation.organizacion ||
      "LALCEC San Francisco",
    codigo:
      operation.codigo_operacion ||
      safeSource.codigo_operacion ||
      safeSource.codigo ||
      "",
    titulo:
      operation.estado === "CONDONADO"
        ? "Comprobante de condonación"
        : "Comprobante de pago",
    estado: operation.estado || "PAGADO",
    fecha: operation.fecha_pago || operation.fecha || "",
    socios,
    modalidad:
      operation.modalidad_label ||
      operation.modalidad ||
      operation.concepto ||
      "Pago de cuotas",
    medio:
      operation.medio_pago ||
      (operation.estado === "CONDONADO" ? "CONDONACIÓN" : "—"),
    domicilio: firstValue(
      operation.domicilio_2,
      operation.domicilio,
      operation.direccion,
      lines[0]?.domicilio,
    ),
    cobrador: firstValue(operation.cobrador, lines[0]?.cobrador),
    tipoEntidad: String(
      operation.tipo_entidad || operation.tipo || safeSource.tipo_entidad || "",
    ).toUpperCase(),
    montoBase: Number(
      operation.monto_base ??
        lines.reduce((total, line) => total + line.montoBase, 0),
    ),
    monto: Number(
      operation.monto ?? lines.reduce((total, line) => total + line.monto, 0),
    ),
    observaciones: operation.observaciones || "",
    motivoCondonacion: operation.motivo_condonacion || "",
    lineas: lines,
  };
};

const receiptDisplayData = (source) => {
  const receipt = normalizePaymentReceipt(source);
  const categories = uniqueValues(receipt.lineas.map((line) => line.categoria));
  const periods = uniqueValues(receipt.lineas.map((line) => line.periodo));
  const amounts = uniqueValues(
    receipt.lineas.map((line) => Number(line.monto || line.montoBase || 0)),
  ).map(Number);
  const isCompany = receipt.tipoEntidad === "EMPRESA";
  const hasSeveralPeople = uniqueValues(
    receipt.lineas.map((line) => line.socio),
  ).length > 1;
  const unitAmount = amounts.length === 1 ? amounts[0] : 0;
  const amountDetail =
    unitAmount > 0 && unitAmount !== receipt.monto
      ? `${money(unitAmount)} · Total ${money(receipt.monto)}`
      : money(receipt.monto);

  return {
    receipt,
    entityLabel: isCompany
      ? "Empresa"
      : hasSeveralPeople
        ? "Socios"
        : "Afiliado",
    copyEntityLabel: isCompany
      ? "Empresa"
      : hasSeveralPeople
        ? "Socios"
        : "Nombre y Apellido",
    people: compact(receipt.socios, 116),
    address: compact(receipt.domicilio || "Domicilio no registrado", 94),
    category: compact(categories.join(" · ") || "—", 68),
    periods: compact(periods.join(", ") || receipt.modalidad, 112),
    amountDetail,
    paymentLabel: receipt.cobrador ? "Cobrador" : "Medio de pago",
    paymentValue: compact(receipt.cobrador || receipt.medio || "—", 54),
    state: receipt.estado || "PAGADO",
  };
};

const receiptBodyHtml = (source) => {
  const data = receiptDisplayData(source);
  const { receipt } = data;

  return `
    <div class="receipt-position">
      <section class="old-receipt" aria-label="${htmlEscape(receipt.titulo)}">
        <div class="old-receipt__main">
          <p><strong>${htmlEscape(data.entityLabel)}:</strong> ${htmlEscape(data.people)}</p>
          <p><strong>Domicilio:</strong> ${htmlEscape(data.address)}</p>
          <p><strong>Categoría / Monto:</strong> ${htmlEscape(data.category)} / ${htmlEscape(data.amountDetail)}</p>
          <p><strong>Período:</strong> ${htmlEscape(data.periods)}</p>
          <p><strong>${htmlEscape(data.paymentLabel)}:</strong> ${htmlEscape(data.paymentValue)}</p>
          <p><strong>Estado:</strong> ${htmlEscape(data.state)}</p>
          <p class="old-receipt__notice">Por consultas comunicarse al 03564-15205778</p>
          <p class="old-receipt__notice">Las cuotas adeudadas se cobrarán al valor actualizado al momento del pago.</p>
        </div>
        <div class="old-receipt__copy">
          <p><strong>${htmlEscape(data.copyEntityLabel)}:</strong> ${htmlEscape(data.people)}</p>
          <p><strong>Categoría / Monto:</strong> ${htmlEscape(data.category)} / ${htmlEscape(data.amountDetail)}</p>
          <p><strong>Período:</strong> ${htmlEscape(data.periods)}</p>
          <p><strong>${htmlEscape(data.paymentLabel)}:</strong> ${htmlEscape(data.paymentValue)}</p>
          <p><strong>Estado:</strong> ${htmlEscape(data.state)}</p>
          <div class="old-receipt__meta">
            <span>${htmlEscape(date(receipt.fecha))}</span>
            ${receipt.codigo ? `<span>N.º ${htmlEscape(receipt.codigo)}</span>` : ""}
          </div>
        </div>
      </section>
    </div>`;
};

export const paymentReceiptHtml = (source, options = {}) => {
  const receipt = normalizePaymentReceipt(source);
  const outputLabel = options.pdf
    ? "Guardar como PDF"
    : "Imprimir comprobante";

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${htmlEscape(receipt.titulo)}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        html, body { width: 100%; min-height: 100%; }
        body {
          margin: 0;
          color: #111827;
          background: #eef1f4;
          font-family: Arial, sans-serif;
        }
        .print-actions {
          position: fixed;
          top: 18px;
          left: 18px;
          z-index: 5;
        }
        .print-actions button {
          min-height: 40px;
          padding: 0 16px;
          border: 0;
          border-radius: 8px;
          color: #fff;
          background: #f97316;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 20px -12px rgba(15, 23, 42, .7);
        }
        .sheet {
          width: 210mm;
          height: 297mm;
          margin: 18px auto;
          position: relative;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 16px 40px -24px rgba(15, 23, 42, .55);
        }
        .receipt-position {
          width: 210mm;
          height: 70mm;
          position: absolute;
          top: 33%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(90deg);
          transform-origin: center center;
        }
        .old-receipt {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 65mm;
          border: 1px solid #d1d5db;
          background: #fff;
        }
        .old-receipt p {
          margin: 0 0 5px;
          font-size: 13px;
          line-height: 1.28;
        }
        .old-receipt__main {
          min-width: 0;
          padding: 13mm 8mm 7mm 20mm;
        }
        .old-receipt__copy {
          min-width: 0;
          padding: 16mm 6mm 7mm 10mm;
          border-left: 1px dashed #9ca3af;
          position: relative;
        }
        .old-receipt__notice {
          font-size: 11.5px !important;
        }
        .old-receipt__meta {
          position: absolute;
          right: 6mm;
          bottom: 5mm;
          left: 10mm;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: #6b7280;
          font-size: 9px;
        }
        @media print {
          body { background: #fff; }
          .print-actions { display: none; }
          .sheet { margin: 0; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button type="button" onclick="window.print()">${outputLabel}</button>
      </div>
      <main class="sheet">${receiptBodyHtml(source)}</main>
    </body>
  </html>`;
};

export const openPaymentReceipt = (source, options = {}) => {
  const popup = window.open("", "_blank", "width=980,height=760");
  if (!popup) return false;

  popup.document.open();
  popup.document.write(paymentReceiptHtml(source, options));
  popup.document.close();
  popup.focus();

  if (options.openPrintDialog) {
    window.setTimeout(() => popup.print(), 250);
  }
  return true;
};

const pdfSafeText = (value) => {
  const replacements = {
    "\u00a0": " ",
    "–": "-",
    "—": "-",
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
  };

  return String(value ?? "")
    .replace(/[\u00a0–—‘’“”…]/g, (character) => replacements[character])
    .normalize("NFC")
    .split("")
    .map((character) => (character.charCodeAt(0) <= 255 ? character : "?"))
    .join("")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
};

const pdfByteLength = (value) => String(value).length;

const pdfBinary = (objects) => {
  let result = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdfByteLength(result);
    result += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdfByteLength(result);
  result += `xref\n0 ${objects.length}\n`;
  result += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    result += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  result += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Uint8Array(
    Array.from(result, (character) => character.charCodeAt(0) & 0xff),
  );
};

const pdfText = (x, y, size, value, { bold = false } = {}) =>
  `BT /${bold ? "F2" : "F1"} ${size} Tf 0.07 0.09 0.12 rg ${x} ${y} Td (${pdfSafeText(value)}) Tj ET`;

const pdfLabelValue = (commands, x, y, label, value, maxLength) => {
  commands.push(pdfText(x, y, 9.5, `${label}:`, { bold: true }));
  commands.push(
    pdfText(
      x + Math.min(112, label.length * 5.4 + 12),
      y,
      9.5,
      compact(value, maxLength),
    ),
  );
};

const paymentReceiptPdfContent = (source) => {
  const data = receiptDisplayData(source);
  const { receipt } = data;
  const commands = [];

  commands.push("q 0.82 0.84 0.87 RG 0.8 w 32 205 778 190 re S Q");
  commands.push("q 0.62 0.65 0.69 RG [5 4] 0 d 600 205 m 600 395 l S Q");

  let y = 360;
  pdfLabelValue(commands, 58, y, data.entityLabel, data.people, 75);
  y -= 23;
  pdfLabelValue(commands, 58, y, "Domicilio", data.address, 72);
  y -= 23;
  pdfLabelValue(
    commands,
    58,
    y,
    "Categoría / Monto",
    `${data.category} / ${data.amountDetail}`,
    70,
  );
  y -= 23;
  pdfLabelValue(commands, 58, y, "Período", data.periods, 78);
  y -= 23;
  pdfLabelValue(commands, 58, y, data.paymentLabel, data.paymentValue, 55);
  y -= 23;
  pdfLabelValue(commands, 58, y, "Estado", data.state, 24);
  commands.push(pdfText(58, 224, 8.5, "Por consultas comunicarse al 03564-15205778"));
  commands.push(
    pdfText(
      58,
      211,
      8.1,
      "Las cuotas adeudadas se cobrarán al valor actualizado al momento del pago.",
    ),
  );

  let copyY = 360;
  pdfLabelValue(commands, 620, copyY, data.copyEntityLabel, data.people, 28);
  copyY -= 27;
  pdfLabelValue(
    commands,
    620,
    copyY,
    "Categoría / Monto",
    `${data.category} / ${data.amountDetail}`,
    28,
  );
  copyY -= 27;
  pdfLabelValue(commands, 620, copyY, "Período", data.periods, 31);
  copyY -= 27;
  pdfLabelValue(commands, 620, copyY, data.paymentLabel, data.paymentValue, 24);
  copyY -= 27;
  pdfLabelValue(commands, 620, copyY, "Estado", data.state, 18);

  commands.push(pdfText(620, 220, 7.5, date(receipt.fecha)));
  if (receipt.codigo) {
    commands.push(pdfText(720, 220, 7.5, `N.º ${compact(receipt.codigo, 18)}`));
  }

  return commands.join("\n");
};

export const downloadPaymentReceiptPdf = (source) => {
  try {
    const receipt = normalizePaymentReceipt(source);
    const content = paymentReceiptPdfContent(source);
    const objects = [
      null,
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>",
      `<< /Length ${pdfByteLength(content)} >>\nstream\n${content}\nendstream`,
    ];

    const blob = new Blob([pdfBinary(objects)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeCode = String(receipt.codigo || receipt.fecha || "pago")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    anchor.href = url;
    anchor.download = `comprobante_pago_${safeCode || "pago"}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
};
