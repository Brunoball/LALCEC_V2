export const toUpperText = (value) =>
  String(value ?? "").toLocaleUpperCase("es-AR");

export const uppercaseConfigText = (form) => ({
  ...form,
  nombre: toUpperText(form?.nombre),
  descripcion: toUpperText(form?.descripcion),
});

export const uppercaseProductText = (form) => ({
  ...form,
  codigo: toUpperText(form?.codigo),
  nombre: toUpperText(form?.nombre),
  descripcion: toUpperText(form?.descripcion),
});

export const uppercaseSaleText = (form) => ({
  ...form,
  comprador_nombre: toUpperText(form?.comprador_nombre),
  comprador_documento: toUpperText(form?.comprador_documento),
  comprador_contacto: toUpperText(form?.comprador_contacto),
  observaciones: toUpperText(form?.observaciones),
});
