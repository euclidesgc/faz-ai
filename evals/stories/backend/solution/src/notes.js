export function addNote(store, title) {
  const id = String(store.notes.length + 1);
  const note = { id, title, done: false, tags: [] };
  store.notes.push(note);
  return note;
}

export function addTag(store, id, tag) {
  const note = store.notes.find((n) => n.id === id);
  if (!note) throw new Error(`Nota não encontrada: ${id}`);
  const normalizada = String(tag).trim().toLowerCase();
  if (normalizada === '') throw new Error('Etiqueta vazia');
  if (note.tags.includes(normalizada)) return note;
  if (note.tags.length >= 5) throw new Error('Limite de 5 etiquetas');
  note.tags.push(normalizada);
  return note;
}
