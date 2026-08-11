export function normalizeSearchQuery(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value) {
  return normalizeSearchQuery(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
}

export function matchesEverySearchTerm(value, query) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) return true;

  const searchableText = normalizeSearchText(value);
  return terms.every((term) => searchableText.includes(term));
}
