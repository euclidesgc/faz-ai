import { escapeHtml } from './html.js';

// Componente de exemplo: funções puras que recebem dados e devolvem uma string HTML.
export function renderCard({ id, title, body }) {
  return `<article class="card" data-id="${escapeHtml(id)}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
}
