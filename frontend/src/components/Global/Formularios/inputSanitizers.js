export function onlyDigits(value, maxLength = null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return Number.isInteger(maxLength) && maxLength >= 0
    ? digits.slice(0, maxLength)
    : digits;
}

export function withoutDigits(value) {
  return String(value ?? "").replace(/[0-9]/g, "");
}

export function upperWithoutDigits(value) {
  return withoutDigits(value).toLocaleUpperCase("es-AR");
}
