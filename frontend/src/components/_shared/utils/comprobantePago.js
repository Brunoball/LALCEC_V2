import logoLalcec from "../../../imagenes/logo_lalcec_sf.png";

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
    idSocio:
      line.id_socio ??
      line.idSocio ??
      null,
    codigo: firstValue(
      line.codigo_operacion,
      line.numero_comprobante,
      line.codigo,
      line.id_pago,
    ),
    socio:
      line.socio ||
      line.denominacion ||
      operation.socios_label ||
      operation.socio ||
      "—",
    categoria:
      line.categoria || operation.categorias_label || operation.categoria || "—",
    periodo: line.periodo || line.descripcion || line.concepto || "—",
    montoBase: Number(line.monto_base ?? line.montoBase ?? line.monto ?? 0),
    descuento: Number(
      line.porcentaje_descuento_familiar ?? line.porcentaje_descuento ?? 0,
    ),
    monto: Number(line.monto ?? 0),
    saldoFavorAplicado: Number(
      line.monto_saldo_favor_aplicado ?? line.saldoFavorAplicado ?? 0,
    ),
    montoCobradoAhora: Number(
      line.monto_cobrado_ahora ??
        line.montoCobradoAhora ??
        Math.max(
          0,
          Number(line.monto ?? 0) -
            Number(line.monto_saldo_favor_aplicado ?? line.saldoFavorAplicado ?? 0),
        ),
    ),
    domicilio: Object.prototype.hasOwnProperty.call(line, "domicilio")
      ? firstValue(line.domicilio_alternativo, line.domicilio_2, line.domicilio)
      : firstValue(
          line.domicilio_alternativo,
          line.domicilio_2,
          line.direccion,
          operation.domicilio_alternativo,
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
      operation.domicilio_alternativo,
      operation.domicilio_2,
      operation.domicilio,
      operation.direccion,
      lines[0]?.domicilio,
    ),
    cobrador: firstValue(operation.cobrador, lines[0]?.cobrador),
    tipoEntidad: String(
      operation.tipo_entidad ||
        operation.tipoEntidad ||
        operation.tipo ||
        safeSource.tipo_entidad ||
        safeSource.tipoEntidad ||
        "",
    ).toUpperCase(),
    montoBase: Number(
      operation.monto_base ??
        operation.montoBase ??
        lines.reduce((total, line) => total + line.montoBase, 0),
    ),
    monto: Number(
      operation.monto ?? lines.reduce((total, line) => total + line.monto, 0),
    ),
    saldoFavorAplicado: Number(
      operation.monto_saldo_favor_aplicado ??
        operation.saldoFavorAplicado ??
        lines.reduce((total, line) => total + line.saldoFavorAplicado, 0),
    ),
    montoCobradoAhora: Number(
      operation.monto_cobrado_ahora ??
        operation.montoCobradoAhora ??
        (lines.length
          ? lines.reduce((total, line) => total + line.montoCobradoAhora, 0)
          : operation.monto ?? 0),
    ),
    observaciones: operation.observaciones || "",
    motivoCondonacion: operation.motivo_condonacion || "",
    lineas: lines,
  };
};

export const normalizePaymentReceipts = (source = {}) => {
  const explicitReceipts = Array.isArray(source)
    ? source
    : Array.isArray(source?.comprobantes)
      ? source.comprobantes
      : Array.isArray(source?.operacion?.comprobantes)
        ? source.operacion.comprobantes
        : null;

  if (explicitReceipts?.length) {
    return explicitReceipts.flatMap((receipt) =>
      normalizePaymentReceipts(receipt),
    );
  }

  const receipt = normalizePaymentReceipt(source);
  if (receipt.lineas.length <= 1) return [receipt];

  // Una operación puede contener varios períodos para la misma persona.
  // Eso sigue siendo un único pago/comprobante: agrupamos por socio y dejamos
  // los meses dentro del mismo comprobante. Si la operación incluye distintas
  // personas (selección múltiple o familia), cada una conserva su comprobante.
  const grouped = new Map();
  receipt.lineas.forEach((line) => {
    const partnerLabel = String(line.socio || receipt.socios || "—").trim() || "—";
    const partnerKey = line.idSocio != null && String(line.idSocio).trim() !== ""
      ? `ID:${String(line.idSocio)}`
      : `SOCIO:${partnerLabel}`;

    if (!grouped.has(partnerKey)) {
      grouped.set(partnerKey, {
        socio: partnerLabel,
        lineas: [],
      });
    }
    grouped.get(partnerKey).lineas.push(line);
  });

  return Array.from(grouped.values()).map((group, index) => {
    const firstLine = group.lineas[0] || {};
    return {
      ...receipt,
      codigo:
        grouped.size > 1 && receipt.codigo
          ? `${receipt.codigo}-${String(index + 1).padStart(2, "0")}`
          : receipt.codigo || firstLine.codigo || "",
      socios: group.socio,
      medio: firstLine.medio || receipt.medio,
      domicilio: firstLine.domicilio ?? receipt.domicilio,
      cobrador: firstLine.cobrador || receipt.cobrador,
      montoBase: group.lineas.reduce(
        (total, line) => total + Number(line.montoBase || line.monto || 0),
        0,
      ),
      monto: group.lineas.reduce(
        (total, line) => total + Number(line.monto || 0),
        0,
      ),
      saldoFavorAplicado: group.lineas.reduce(
        (total, line) => total + Number(line.saldoFavorAplicado || 0),
        0,
      ),
      montoCobradoAhora: group.lineas.reduce(
        (total, line) => total + Number(line.montoCobradoAhora || 0),
        0,
      ),
      lineas: group.lineas,
    };
  });
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
  const hasAppliedBalance = Number(receipt.saldoFavorAplicado || 0) > 0.004;
  const amountPaidNow = hasAppliedBalance
    ? Number(receipt.montoCobradoAhora || 0)
    : Number(receipt.monto || 0);
  const amountDetail = hasAppliedBalance
    ? money(amountPaidNow)
    : unitAmount > 0 && unitAmount !== receipt.monto
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
    address: receipt.domicilio ? compact(receipt.domicilio, 94) : "",
    category: compact(categories.join(" · ") || "—", 68),
    periods: compact(periods.join(" / ") || receipt.modalidad, 112),
    amountDetail,
    hasAppliedBalance,
    amountPaidNow,
    balanceApplied: Number(receipt.saldoFavorAplicado || 0),
    totalSettled: Number(receipt.monto || 0),
    paymentLabel: receipt.cobrador ? "Cobrador" : "Medio de pago",
    paymentValue: compact(receipt.cobrador || receipt.medio || "—", 54),
    state: receipt.estado || "PAGADO",
  };
};

const legacyReceiptDisplayData = (source) => {
  // `paymentReceiptHtml` ya trabaja con comprobantes normalizados. Evitamos
  // normalizarlos una segunda vez para conservar datos como `medio`.
  const receipt =
    source &&
    typeof source === "object" &&
    Array.isArray(source.lineas) &&
    (Object.prototype.hasOwnProperty.call(source, "medio") ||
      Object.prototype.hasOwnProperty.call(source, "tipoEntidad") ||
      Object.prototype.hasOwnProperty.call(source, "socios"))
      ? source
      : normalizePaymentReceipt(source);
  const lines = Array.isArray(receipt.lineas) ? receipt.lineas : [];
  const periods = uniqueValues(lines.map((line) => line.periodo));
  const amounts = lines.map((line) => Number(line.monto ?? line.montoBase ?? 0));
  const unitAmount = amounts.find((amount) => Number.isFinite(amount) && amount !== 0) || 0;
  const total = amounts.reduce(
    (sum, amount) => sum + (Number.isFinite(amount) ? amount : 0),
    0,
  );
  const status = String(receipt.estado || "PENDIENTE").toUpperCase();
  const firstLine = lines[0] || {};
  const balanceApplied = Number(receipt.saldoFavorAplicado || 0);
  const hasAppliedBalance = balanceApplied > 0.004;
  const totalSettled = Number(receipt.monto || total || 0);
  const amountPaidNow = hasAppliedBalance
    ? Number(
        receipt.montoCobradoAhora ??
          Math.max(0, totalSettled - balanceApplied),
      )
    : totalSettled;

  return {
    isCompany: receipt.tipoEntidad === "EMPRESA",
    denomination: receipt.socios || firstLine.socio || "—",
    address: receipt.domicilio || firstLine.domicilio || "",
    category: firstLine.categoria || "",
    paymentMethod: receipt.medio || firstLine.medio || "No especificado",
    periods: periods.length ? periods : [receipt.modalidad || "—"],
    unitAmount,
    total,
    hasAppliedBalance,
    amountPaidNow,
    balanceApplied,
    totalSettled,
    status,
  };
};

const LEGACY_RECEIPT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 0;
  }
  body {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    transform: rotate(90deg);
    transform-origin: top left;
    left: 70%;
    top: 0;
  }
  .gcuotas-contenedor {
    width: 210mm;
    margin: 10mm 0;
    page-break-after: always;
    box-sizing: border-box;
  }
  .gcuotas-comprobante {
    width: 100%;
    height: 100%;
    display: flex;
    box-sizing: border-box;
  }
  .gcuotas-talon-socio {
    width: 60%;
    padding-left: 12.5mm;
    padding-top: 13mm;
  }
  .gcuotas-talon-cobrador {
    width: 60mm;
    padding-left: 5.5mm;
    padding-top: 16mm;
  }
  p {
    margin-top: 5px;
    font-size: 13px;
  }
  .gcuotas-monto-unit {
    font-weight: 400 !important;
  }
  .gcuotas-total-wrap {
    font-weight: 700 !important;
  }
  .gcuotas-monto-total {
    font-weight: 400 !important;
  }
  .print-actions {
    position: fixed;
    top: 8mm;
    left: 8mm;
    z-index: 10;
    transform: rotate(-90deg);
    transform-origin: top left;
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
  }
  @media print {
    .print-actions {
      display: none !important;
    }
  }
`;

const legacyReceiptBodyHtml = (data) => {
  const amountDetail = data.hasAppliedBalance
    ? `<span class="gcuotas-monto-unit">$${data.amountPaidNow}</span>`
    : data.periods.length > 1
      ? `<span class="gcuotas-monto-unit">$${data.unitAmount}</span>
         &nbsp;&nbsp;
         <span class="gcuotas-total-wrap">
           Total <span class="gcuotas-monto-total">$${data.total}</span>
         </span>`
      : `<span class="gcuotas-monto-unit">$${data.unitAmount}</span>`;
  const amountLabel = data.hasAppliedBalance
    ? "Categoría / Monto abonado:"
    : "Categoría / Monto:";
  const balanceLines = data.hasAppliedBalance
    ? `<p><strong>Saldo a favor aplicado:</strong> ${htmlEscape(money(data.balanceApplied))}</p>
       <p><strong>Total de cuotas:</strong> ${htmlEscape(money(data.totalSettled))}</p>`
    : "";
  const statusLine =
    data.status === "PAGADO" || data.status === "CONDONADO"
      ? `<p><strong>Estado:</strong> ${htmlEscape(data.status)}</p>`
      : "";

  return `
    <div class="gcuotas-contenedor">
      <div class="gcuotas-comprobante">
        <div class="gcuotas-talon-socio">
          <p><strong>${data.isCompany ? "Empresa:" : "Afiliado:"}</strong> ${htmlEscape(data.denomination)}</p>
          <p><strong>Domicilio:</strong> ${htmlEscape(data.address)}</p>
          <p><strong>${amountLabel}</strong> ${htmlEscape(data.category)} / ${amountDetail}</p>
          ${balanceLines}
          <p><strong>Período:</strong> ${htmlEscape(data.periods.join(", "))}</p>
          <p><strong>Medio de Pago:</strong> ${htmlEscape(data.paymentMethod)}</p>
          ${statusLine}
          <p>Por consultas comunicarse al 03564-15205778</p>
          <p>Las cuotas adeudadas se cobrarán al valor actualizado al momento del pago.</p>
        </div>

        <div class="gcuotas-talon-cobrador">
          <p><strong>${data.isCompany ? "Empresa:" : "Nombre y Apellido:"}</strong> ${htmlEscape(data.denomination)}</p>
          <p><strong>${amountLabel}</strong> ${htmlEscape(data.category)} / ${amountDetail}</p>
          ${balanceLines}
          <p><strong>Período:</strong> ${htmlEscape(data.periods.join(", "))}</p>
          <p><strong>Medio de Pago:</strong> ${htmlEscape(data.paymentMethod)}</p>
          ${statusLine}
        </div>
      </div>
    </div>`;
};

const legacyReceiptDocumentHtml = ({ title, receipts, actionLabel = "" }) => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title || "Comprobantes de Pago")}</title>
    <style>${LEGACY_RECEIPT_STYLES}</style>
  </head>
  <body>
    ${
      actionLabel
        ? `<div class="print-actions"><button type="button" onclick="window.print()">${htmlEscape(actionLabel)}</button></div>`
        : ""
    }
    ${receipts.map((data) => legacyReceiptBodyHtml(data)).join("")}
  </body>
</html>`;

const printableAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const groupLegacyReceiptRecords = (records) => {
  const groups = new Map();

  records.forEach((item, index) => {
    const key = String(
      item.id_socio ??
        item.id_empresa ??
        item.documento ??
        item.denominacion ??
        `registro-${index}`,
    );
    const amount = printableAmount(
      item.monto ?? item.monto_sugerido ?? item.monto_base ?? 0,
    );
    const balanceApplied = printableAmount(
      item.monto_saldo_favor_aplicado ?? item.saldo_favor_aplicado ?? 0,
    );
    const amountPaidNow = printableAmount(
      item.monto_cobrado_ahora ?? Math.max(0, amount - balanceApplied),
    );
    const period = item.periodo_impresion || item.periodo || "—";
    const current = groups.get(key);

    if (current) {
      if (!current.periods.includes(period)) current.periods.push(period);
      current.total += amount;
      current.balanceApplied += balanceApplied;
      current.amountPaidNow += amountPaidNow;
      if (!current.unitAmount && amount) current.unitAmount = amount;
      return;
    }

    groups.set(key, {
      item,
      periods: [period],
      unitAmount: amount,
      total: amount,
      balanceApplied,
      amountPaidNow,
    });
  });

  return Array.from(groups.values());
};

const legacyReceiptDisplayDataFromRecordGroup = (
  { item, periods, unitAmount, total, balanceApplied, amountPaidNow },
  entityType,
) => {
  const isCompany = entityType === "EMPRESA";
  const denomination =
    item.denominacion ||
    (isCompany
      ? item.razon_social
      : `${item.apellido || ""} ${item.nombre || ""}`.trim()) ||
    "—";

  return {
    isCompany,
    denomination,
    address: item.domicilio || item.domicilio_2 || item.direccion || "",
    category: item.categoria || "",
    paymentMethod: item.medio_pago || item.medio_pago_preferido || "No especificado",
    periods,
    unitAmount,
    total,
    hasAppliedBalance: Number(balanceApplied || 0) > 0.004,
    amountPaidNow: Number(amountPaidNow || 0),
    balanceApplied: Number(balanceApplied || 0),
    totalSettled: Number(total || 0),
    status: String(item.estado || "PENDIENTE").toUpperCase(),
  };
};

export const printPaymentReceiptsBatch = ({ printWindow, records, entityType }) => {
  if (!printWindow || printWindow.closed) {
    throw new Error("No se pudo abrir la ventana de impresión.");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No hay comprobantes para los meses seleccionados.");
  }

  const groupedRecords = groupLegacyReceiptRecords(records);
  const receipts = groupedRecords.map((group) =>
    legacyReceiptDisplayDataFromRecordGroup(group, entityType),
  );

  printWindow.document.open();
  printWindow.document.write(
    legacyReceiptDocumentHtml({
      title: "Comprobantes de Pago",
      receipts,
    }),
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
  return groupedRecords.length;
};

export const paymentReceiptHtml = (source, options = {}) => {
  const normalizedReceipts = normalizePaymentReceipts(source);
  const receipt = normalizedReceipts[0] || normalizePaymentReceipt(source);
  const outputLabel = options.pdf
    ? "Guardar como PDF"
    : normalizedReceipts.length > 1
      ? "Imprimir comprobantes"
      : "Imprimir comprobante";
  const receipts = normalizedReceipts.map((item) => legacyReceiptDisplayData(item));

  return legacyReceiptDocumentHtml({
    title: receipt.titulo,
    receipts,
    actionLabel: outputLabel,
  });
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

const pdfColor = {
  ink: "0.10 0.13 0.17",
  muted: "0.48 0.52 0.57",
  orange: "0.98 0.45 0.09",
  orangeDark: "0.76 0.22 0.04",
  green: "0.02 0.47 0.34",
  white: "1 1 1",
};

const pdfText = (
  x,
  y,
  size,
  value,
  { bold = false, color = pdfColor.ink } = {},
) =>
  `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfSafeText(value)}) Tj ET`;

const pdfEstimatedWidth = (value, size, bold = false) =>
  String(value ?? "").length * size * (bold ? 0.58 : 0.53);

const pdfFittedText = (value, maxWidth, size = 9, bold = false) => {
  const text = String(value ?? "").trim() || "—";
  if (pdfEstimatedWidth(text, size, bold) <= maxWidth) return text;

  const averageCharacterWidth = size * (bold ? 0.58 : 0.53);
  const maxLength = Math.max(4, Math.floor(maxWidth / averageCharacterWidth));
  return compact(text, maxLength);
};

const pdfField = (
  commands,
  x,
  y,
  label,
  value,
  { width = 225, valueSize = 9.2 } = {},
) => {
  commands.push(
    pdfText(x, y, 7.1, String(label).toUpperCase(), {
      bold: true,
      color: pdfColor.muted,
    }),
  );
  commands.push(
    pdfText(
      x,
      y - 16,
      valueSize,
      pdfFittedText(value, width, valueSize, true),
      { bold: true },
    ),
  );
};

const bytesToBinaryString = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binary;
};

const dataUrlToBytes = (dataUrl) => {
  const base64 = String(dataUrl).split(",")[1] || "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

let receiptLogoPromise = null;

const loadReceiptLogo = () => {
  if (receiptLogoPromise) return receiptLogoPromise;

  receiptLogoPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 220;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(
          image,
          (size - width) / 2,
          (size - height) / 2,
          width,
          height,
        );

        resolve({
          bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)),
          width: size,
          height: size,
        });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = logoLalcec;
  });

  return receiptLogoPromise;
};

const paymentReceiptPdfContent = (source, { hasLogo = false } = {}) => {
  const data = receiptDisplayData(source);
  const { receipt } = data;
  const commands = [];

  // Tarjeta principal centrada en A4 apaisado. Se mantiene lejos de los bordes
  // para evitar cortes en visores e impresoras con márgenes no imprimibles.
  commands.push("q 0.98 0.45 0.09 rg 30 482 782 8 re f Q");
  commands.push("q 0.86 0.88 0.91 RG 0.8 w 30 104 782 386 re S Q");
  commands.push("q 0.97 0.98 0.99 rg 584 104 228 310 re f Q");
  commands.push("q 0.77 0.80 0.84 RG [4 4] 0 d 584 104 m 584 414 l S Q");
  commands.push("q 0.90 0.91 0.93 RG 0.7 w 30 414 m 812 414 l S Q");

  if (hasLogo) {
    commands.push("q 44 0 0 44 48 428 cm /Logo Do Q");
    commands.push("q 24 0 0 24 602 356 cm /Logo Do Q");
  } else {
    commands.push("q 1.00 0.97 0.93 rg 48 428 44 44 re f Q");
    commands.push(pdfText(59, 445, 11, "L", { bold: true, color: pdfColor.orange }));
  }

  commands.push(
    pdfText(105, 458, 15, receipt.organizacion || "LALCEC San Francisco", {
      bold: true,
    }),
  );
  commands.push(
    pdfText(105, 438, 8.5, "Gestión de socios · Comprobante institucional", {
      color: pdfColor.muted,
    }),
  );
  commands.push(
    pdfText(650, 458, 9, String(receipt.titulo || "Comprobante").toUpperCase(), {
      bold: true,
      color: pdfColor.orangeDark,
    }),
  );
  if (receipt.codigo) {
    const code = pdfFittedText(`N.º ${receipt.codigo}`, 155, 9, true);
    commands.push(pdfText(650, 438, 9, code, { bold: true }));
  }

  commands.push(
    pdfText(48, 390, 7.5, "ORIGINAL", { bold: true, color: pdfColor.orange }),
  );
  commands.push(
    pdfText(602, 390, 7.5, "COPIA", { bold: true, color: pdfColor.orange }),
  );

  pdfField(commands, 48, 362, data.entityLabel, data.people, { width: 500, valueSize: 10 });
  pdfField(commands, 48, 314, "Domicilio", data.address, { width: 500 });
  pdfField(commands, 48, 266, "Categoría", data.category, { width: 238 });
  pdfField(commands, 306, 266, "Período", data.periods, { width: 244 });
  pdfField(commands, 48, 218, data.paymentLabel, data.paymentValue, { width: 238 });
  pdfField(commands, 306, 218, "Estado", data.state, { width: 244 });

  commands.push("q 1.00 0.97 0.93 rg 48 132 510 54 re f Q");
  commands.push("q 0.99 0.79 0.61 RG 0.7 w 48 132 510 54 re S Q");
  commands.push(
    pdfText(64, 162, 7.8, "TOTAL ABONADO", {
      bold: true,
      color: pdfColor.orangeDark,
    }),
  );
  commands.push(
    pdfText(438, 151, 18, money(data.amountPaidNow), {
      bold: true,
      color: pdfColor.orange,
    }),
  );
  if (data.hasAppliedBalance) {
    commands.push(
      pdfText(64, 141, 7.1, `Saldo aplicado ${money(data.balanceApplied)} · Cuotas ${money(data.totalSettled)}`, {
        color: pdfColor.muted,
      }),
    );
  }

  commands.push(pdfText(634, 365, 10.5, "LALCEC", { bold: true }));
  pdfField(commands, 602, 326, data.copyEntityLabel, data.people, { width: 188, valueSize: 8.2 });
  pdfField(commands, 602, 282, "Categoría", data.category, { width: 188, valueSize: 8.2 });
  pdfField(commands, 602, 238, "Período", data.periods, { width: 188, valueSize: 8.2 });
  pdfField(commands, 602, 194, data.paymentLabel, data.paymentValue, { width: 188, valueSize: 8.2 });

  commands.push("q 1.00 0.97 0.93 rg 602 126 188 42 re f Q");
  commands.push(
    pdfText(614, 151, 7.2, "TOTAL", { bold: true, color: pdfColor.orangeDark }),
  );
  commands.push(
    pdfText(692, 143, 12, money(data.amountPaidNow), {
      bold: true,
      color: pdfColor.orange,
    }),
  );
  if (data.hasAppliedBalance) {
    commands.push(
      pdfText(614, 132, 6.4, pdfFittedText(`Saldo ${money(data.balanceApplied)} · Cuotas ${money(data.totalSettled)}`, 168, 6.4), {
        color: pdfColor.muted,
      }),
    );
  }

  commands.push(
    pdfText(602, 112, 7, date(receipt.fecha), { color: pdfColor.muted }),
  );
  if (receipt.codigo) {
    commands.push(
      pdfText(
        706,
        112,
        7,
        pdfFittedText(`N.º ${receipt.codigo}`, 84, 7),
        { color: pdfColor.muted },
      ),
    );
  }

  return commands.join("\n");
};

export const downloadPaymentReceiptPdf = async (source) => {
  try {
    const receipts = normalizePaymentReceipts(source);
    const receipt = receipts[0] || normalizePaymentReceipt(source);
    const logo = await loadReceiptLogo();
    const pageObjectNumbers = receipts.map((_, index) => 5 + index * 2);
    const imageObjectNumber = logo ? 5 + receipts.length * 2 : null;
    const resources = imageObjectNumber
      ? `/Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo ${imageObjectNumber} 0 R >>`
      : "/Font << /F1 3 0 R /F2 4 0 R >>";

    const objects = [
      null,
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageObjectNumbers
        .map((objectNumber) => `${objectNumber} 0 R`)
        .join(" ")}] /Count ${receipts.length} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ];

    receipts.forEach((item, index) => {
      const pageObjectNumber = pageObjectNumbers[index];
      const contentObjectNumber = pageObjectNumber + 1;
      const content = paymentReceiptPdfContent(item, {
        hasLogo: Boolean(logo),
      });

      objects[pageObjectNumber] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << ${resources} >> /Contents ${contentObjectNumber} 0 R >>`;
      objects[contentObjectNumber] =
        `<< /Length ${pdfByteLength(content)} >>\nstream\n${content}\nendstream`;
    });

    if (logo) {
      const imageStream = bytesToBinaryString(logo.bytes);
      objects[imageObjectNumber] =
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n${imageStream}\nendstream`;
    }

    const blob = new Blob([pdfBinary(objects)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeCode = String(receipt.codigo || receipt.fecha || "pago")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    anchor.href = url;
    anchor.download = `${
      receipts.length > 1 ? "comprobantes_pago" : "comprobante_pago"
    }_${safeCode || "pago"}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
};
