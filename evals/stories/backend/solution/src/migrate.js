export const CURRENT_VERSION = 2;

export function migrate(data) {
  if (data.version === 2) return data;
  if (data.version !== 1) throw new Error(`Versão não suportada: ${data.version}`);
  return { version: 2, notes: data.notes.map((note) => ({ ...note, tags: note.tags ?? [] })) };
}
