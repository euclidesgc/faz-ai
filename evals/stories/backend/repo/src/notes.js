export function addNote(store, title) {
  const id = String(store.notes.length + 1);
  const note = { id, title, done: false };
  store.notes.push(note);
  return note;
}
