// Guarda as notas em memória. O formato gravado é { version: 1, notes: [{ id, title, done }] }.
export function createStore(notes = []) {
  return { version: 1, notes };
}

export function serialize(store) {
  return JSON.stringify(store);
}

export function load(json) {
  const data = JSON.parse(json);
  return { version: data.version, notes: data.notes };
}
