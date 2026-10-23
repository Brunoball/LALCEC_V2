// Stack compartido: un Escape cierra únicamente el modal de primer plano.
// Se registra al abrir, no al montar (los modales suelen estar siempre montados).
const abiertos = [];

export function registerOpenModal(id) {
  const index = abiertos.indexOf(id);
  if (index !== -1) abiertos.splice(index, 1);
  abiertos.push(id);
}

export function unregisterOpenModal(id) {
  const index = abiertos.lastIndexOf(id);
  if (index !== -1) abiertos.splice(index, 1);
}

export function isTopOpenModal(id) {
  return abiertos[abiertos.length - 1] === id;
}
