import { escapeHtml } from './html.js';

function renderTask(task) {
  const classes = task.done ? 'task task--done' : 'task';
  const checked = task.done ? ' aria-checked="true"' : '';
  return `<li class="${classes}" data-id="${escapeHtml(task.id)}" data-done="${task.done ? 'true' : 'false'}"${checked}>${escapeHtml(task.title)}</li>`;
}

export function renderTaskList(tasks) {
  if (tasks.length === 0) return '<p class="empty">Nenhuma tarefa</p>';
  return `<ul class="task-list" role="list">${tasks.map(renderTask).join('')}</ul>`;
}
