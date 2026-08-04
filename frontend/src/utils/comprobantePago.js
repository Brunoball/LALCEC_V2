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
  }).format(Number(value || 0));

const date = (value) => {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(parsed);
};

export const normalizePaymentReceipt = (source = {}) => {
  const safeSource = source && typeof source === "object" ? source : {};
  const operation =
    safeSource.operacion && typeof safeSource.operacion === "object"
      ? safeSource.operacion
      : safeSource;
  const lines = (operation.lineas || safeSource.lineas || []).map((line, index) => ({
    id: line.id || line.id_linea || `${index}-${line.periodo || line.concepto || "linea"}`,
    socio: line.socio || operation.socios_label || operation.socio || "—",
    categoria: line.categoria || operation.categorias_label || "—",
    periodo: line.periodo || line.descripcion || line.concepto || "—",
    montoBase: Number(line.monto_base ?? line.monto ?? 0),
    descuento: Number(
      line.porcentaje_descuento_familiar ?? line.porcentaje_descuento ?? 0,
    ),
    monto: Number(line.monto ?? 0),
  }));

  return {
    organizacion: safeSource.organizacion || operation.organizacion || "",
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
    socios:
      operation.socios_label || operation.socio || safeSource.socios || "—",
    modalidad:
      operation.modalidad_label ||
      operation.modalidad ||
      operation.concepto ||
      "Pago de cuotas",
    medio:
      operation.medio_pago ||
      (operation.estado === "CONDONADO" ? "CONDONACIÓN" : "—"),
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

export const paymentReceiptHtml = (source, options = {}) => {
  const receipt = normalizePaymentReceipt(source);
  const outputLabel = options.pdf
    ? "Guardar como PDF"
    : "Imprimir comprobante";
  const rows = receipt.lineas
    .map(
      (line) => `
        <tr>
          <td><strong>${htmlEscape(line.socio)}</strong></td>
          <td>${htmlEscape(line.categoria)}</td>
          <td>${htmlEscape(line.periodo)}</td>
          <td class="number">${htmlEscape(money(line.montoBase))}</td>
          <td class="number">${htmlEscape(`${line.descuento}%`)}</td>
          <td class="number"><strong>${htmlEscape(money(line.monto))}</strong></td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${htmlEscape(receipt.titulo)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #2f2724; background: #fff; }
        .receipt { max-width: 900px; margin: 0 auto; }
        .head { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #3a2e2b; }
        h1 { margin: 0 0 5px; font-size: 23px; }
        p { margin: 3px 0; color: #6f625e; }
        .meta { text-align: right; }
        .status { display: inline-block; margin-top: 6px; padding: 5px 9px; border-radius: 999px; color: #6d4613; background: #f4e4ca; font-size: 11px; font-weight: 700; }
        .summary { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 12px; margin: 18px 0; }
        .summary div { min-width: 0; padding: 12px; border: 1px solid #eadfd4; border-radius: 10px; background: #fbf8f4; }
        .summary span { display: block; margin-bottom: 4px; color: #806f68; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
        .summary strong { display: block; overflow-wrap: anywhere; font-size: 14px; }
        table { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 11px; }
        th { padding: 9px 8px; color: #fff; background: #3a2e2b; text-align: left; }
        td { padding: 9px 8px; border-bottom: 1px solid #e5ddd7; vertical-align: top; }
        .number { text-align: right; white-space: nowrap; }
        .note { margin-top: 18px; padding: 11px 12px; border: 1px solid #eadfd4; border-radius: 9px; color: #5d514c; font-size: 11px; }
        .total { display: flex; justify-content: flex-end; align-items: baseline; gap: 12px; margin-top: 18px; font-size: 12px; }
        .total strong { font-size: 22px; }
        .print-actions { display: flex; gap: 8px; margin: 0 auto 16px; max-width: 900px; }
        .print-actions button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 8px; color: #fff; background: #3a2e2b; font-weight: 700; cursor: pointer; }
        @media print { .print-actions { display: none; } }
      </style>
    </head>
    <body>
      <div class="print-actions"><button type="button" onclick="window.print()">${outputLabel}</button></div>
      <main class="receipt">
        <header class="head">
          <div>
            <h1>${htmlEscape(receipt.organizacion || receipt.titulo)}</h1>
            <p>${htmlEscape(receipt.titulo)}</p>
          </div>
          <div class="meta">
            <p>${htmlEscape(date(receipt.fecha))}</p>
            ${receipt.codigo ? `<p>N.º ${htmlEscape(receipt.codigo)}</p>` : ""}
            <span class="status">${htmlEscape(receipt.estado)}</span>
          </div>
        </header>
        <section class="summary">
          <div><span>Socio/s</span><strong>${htmlEscape(receipt.socios)}</strong></div>
          <div><span>Modalidad</span><strong>${htmlEscape(receipt.modalidad)}</strong></div>
          <div><span>Medio</span><strong>${htmlEscape(receipt.medio)}</strong></div>
          <div><span>Total</span><strong>${htmlEscape(money(receipt.monto))}</strong></div>
        </section>
        <table>
          <thead><tr><th>Socio</th><th>Categoría</th><th>Período</th><th class="number">Base</th><th class="number">Desc.</th><th class="number">Pagado</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">No hay líneas de detalle disponibles.</td></tr>'}</tbody>
        </table>
        ${receipt.motivoCondonacion ? `<p class="note"><strong>Motivo:</strong> ${htmlEscape(receipt.motivoCondonacion)}</p>` : ""}
        ${receipt.observaciones ? `<p class="note"><strong>Observaciones:</strong> ${htmlEscape(receipt.observaciones)}</p>` : ""}
        <div class="total"><span>Total registrado</span><strong>${htmlEscape(money(receipt.monto))}</strong></div>
      </main>
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

const pdfTextCommand = (
  x,
  y,
  size,
  value,
  { bold = false, color = "0.19 0.15 0.14" } = {},
) =>
  `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfSafeText(value)}) Tj ET`;

const compactPdfText = (value, limit) => {
  const text = String(value ?? "—").trim() || "—";
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
};

const paymentReceiptPdfContent = (receipt, pageLines, page, totalPages) => {
  const commands = [];
  const dark = "0.23 0.18 0.17";
  const accent = "0.73 0.16 0.20";
  const muted = "0.46 0.40 0.38";

  commands.push(`q ${dark} rg 40 760 515 52 re f Q`);
  commands.push(
    pdfTextCommand(
      55,
      792,
      17,
      compactPdfText(receipt.organizacion || receipt.titulo, 42),
      { bold: true, color: "1 1 1" },
    ),
  );
  commands.push(
    pdfTextCommand(55, 774, 9, receipt.titulo, { color: "0.94 0.90 0.87" }),
  );
  commands.push(
    pdfTextCommand(430, 791, 9, date(receipt.fecha), {
      bold: true,
      color: "1 1 1",
    }),
  );
  commands.push(
    pdfTextCommand(
      430,
      775,
      8,
      `Página ${page} de ${totalPages}`,
      { color: "0.94 0.90 0.87" },
    ),
  );

  commands.push("q 0.98 0.96 0.94 rg 40 690 515 54 re f Q");
  const summaries = [
    [55, "SOCIO/S", compactPdfText(receipt.socios, 27)],
    [220, "MODALIDAD", compactPdfText(receipt.modalidad, 20)],
    [350, "MEDIO", compactPdfText(receipt.medio, 16)],
    [455, "TOTAL", money(receipt.monto)],
  ];
  summaries.forEach(([x, label, value]) => {
    commands.push(pdfTextCommand(x, 725, 7, label, { bold: true, color: muted }));
    commands.push(pdfTextCommand(x, 706, 10, value, { bold: true }));
  });

  commands.push(`q ${dark} rg 40 648 515 24 re f Q`);
  [
    [48, "SOCIO"],
    [160, "CATEGORÍA"],
    [275, "PERÍODO"],
    [390, "BASE"],
    [455, "DESC."],
    [505, "PAGADO"],
  ].forEach(([x, label]) => {
    commands.push(
      pdfTextCommand(x, 656, 7.5, label, { bold: true, color: "1 1 1" }),
    );
  });

  let rowY = 628;
  pageLines.forEach((line, index) => {
    if (index % 2 === 1) {
      commands.push(`q 0.985 0.975 0.965 rg 40 ${rowY - 6} 515 20 re f Q`);
    }
    commands.push(pdfTextCommand(48, rowY, 7.5, compactPdfText(line.socio, 19), { bold: true }));
    commands.push(pdfTextCommand(160, rowY, 7.5, compactPdfText(line.categoria, 19)));
    commands.push(pdfTextCommand(275, rowY, 7.5, compactPdfText(line.periodo, 19)));
    commands.push(pdfTextCommand(390, rowY, 7.5, money(line.montoBase)));
    commands.push(pdfTextCommand(455, rowY, 7.5, `${line.descuento}%`));
    commands.push(
      pdfTextCommand(505, rowY, 7.5, money(line.monto), {
        bold: true,
        color: accent,
      }),
    );
    commands.push(`q 0.90 0.87 0.85 RG 40 ${rowY - 9} m 555 ${rowY - 9} l S Q`);
    rowY -= 22;
  });

  if (page === totalPages) {
    const totalY = Math.max(62, rowY - 18);
    commands.push(`q ${accent} rg 365 ${totalY - 10} 190 38 re f Q`);
    commands.push(
      pdfTextCommand(380, totalY + 4, 8, "TOTAL REGISTRADO", {
        bold: true,
        color: "1 1 1",
      }),
    );
    commands.push(
      pdfTextCommand(475, totalY + 2, 13, money(receipt.monto), {
        bold: true,
        color: "1 1 1",
      }),
    );
  }

  if (receipt.codigo) {
    commands.push(
      pdfTextCommand(40, 32, 7.5, `Operación: ${receipt.codigo}`, {
        color: muted,
      }),
    );
  }
  commands.push(
    pdfTextCommand(445, 32, 7.5, receipt.estado, { bold: true, color: accent }),
  );

  return commands.join("\n");
};

export const downloadPaymentReceiptPdf = (source) => {
  try {
    const receipt = normalizePaymentReceipt(source);
    const detailLines = receipt.lineas.length
      ? receipt.lineas
      : [
          {
            socio: receipt.socios,
            categoria: "—",
            periodo: receipt.modalidad,
            montoBase: receipt.montoBase,
            descuento: 0,
            monto: receipt.monto,
          },
        ];
    const linesPerPage = 22;
    const pages = [];
    for (let index = 0; index < detailLines.length; index += linesPerPage) {
      pages.push(detailLines.slice(index, index + linesPerPage));
    }

    const objects = [null];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] =
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    const pageReferences = [];
    pages.forEach((pageLines, index) => {
      const pageObject = 5 + index * 2;
      const contentObject = pageObject + 1;
      const content = paymentReceiptPdfContent(
        receipt,
        pageLines,
        index + 1,
        pages.length,
      );
      pageReferences.push(`${pageObject} 0 R`);
      objects[pageObject] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
        `/Contents ${contentObject} 0 R >>`;
      objects[contentObject] =
        `<< /Length ${pdfByteLength(content)} >>\nstream\n${content}\nendstream`;
    });
    objects[2] =
      `<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pages.length} >>`;

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
