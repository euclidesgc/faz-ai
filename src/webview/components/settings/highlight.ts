const HIGHLIGHT_MS = 2000;

/**
 * Rola até o elemento e destaca por ~2s (classe `fazai-highlight`, ver styles.css). Usada depois de
 * `goToSection`/`ui.openSettings` trocarem de aba. Mantém exatamente `scrollIntoView({ block: 'start' })`
 * (sem `behavior: 'smooth'`) para não quebrar o teste existente de `settings.test.tsx`.
 */
export function scrollToAndHighlight(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.classList.add('fazai-highlight');
  const clear = () => el.classList.remove('fazai-highlight');
  el.addEventListener('animationend', clear, { once: true });
  // segurança: com prefers-reduced-motion a animação é desligada no CSS, então não há animationend
  setTimeout(clear, HIGHLIGHT_MS + 200);
}
