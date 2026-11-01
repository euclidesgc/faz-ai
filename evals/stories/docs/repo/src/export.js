// Exporta as tarefas como CSV (separador vírgula, aspas dobradas quando o texto tem vírgula, aspas ou quebra de linha).
function cell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(tasks) {
  const lines = tasks.map((t) => [t.id, t.title, t.done ? 'sim' : 'não'].map(cell).join(','));
  return ['id,titulo,concluida', ...lines].join('\n') + '\n';
}
