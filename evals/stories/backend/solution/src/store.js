import { migrate } from './migrate.js';

// Guarda as notas em memória. O formato gravado é { version: 2, notes: [{ id, title, done, tags }] }.
export function createStore(notes = []) {
  return { version: 2, notes };
}

export function serialize(store) {
  return JSON.stringify(store);
}

export function load(json) {
  const data = migrate(JSON.parse(json));
  return { version: data.version, notes: data.notes };
}
