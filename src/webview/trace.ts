import type { TraceEntry } from '../shared/trace';
import { hasHost, onConnectionChange, postToHost } from './vscode';

// O rastreio do lado da tela: o que a pessoa clicou, mudou ou apertou, quanto cada ação levou para o host
// confirmar e os erros de JavaScript. As linhas vão em lote para o host (`ui.trace`), que as grava no mesmo
// arquivo das mensagens, das mudanças e das ferramentas MCP: a sequência inteira de uma ação fica junta.

/** Quanto tempo as linhas da tela esperam para ir num lote só ao host. */
const FLUSH_MS = 500;
const MAX_LABEL = 80;

let batch: TraceEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  timer = null;
  if (!batch.length) return;
  const entries = batch;
  batch = [];
  postToHost({ type: 'ui.trace', entries });
}

/** Junta uma linha do rastreio da tela; sem host (testes, a página solta no Vite) não faz nada. */
export function traceUi(entry: Omit<TraceEntry, 'at' | 'src'>): void {
  if (!hasHost) return;
  batch.push({ at: Date.now(), src: 'ui', ...entry });
  timer ??= setTimeout(flush, FLUSH_MS);
}

/** O que identifica o controle para quem lê o rastreio: o papel, o rótulo e onde ele está (o card, o diálogo). */
function describe(el: Element): Record<string, string> {
  const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
  const raw =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el instanceof HTMLInputElement ? el.labels?.[0]?.textContent || el.name || el.placeholder : '') ||
    el.textContent ||
    '';
  const label = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
  const out: Record<string, string> = { role, label };
  const dialog = el.closest('[role="dialog"]');
  const title = dialog?.querySelector('h1, h2, h3, [class*="Title"]')?.textContent?.trim();
  if (title) out.dialog = title.slice(0, MAX_LABEL);
  const tab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
  if (tab) out.tab = tab.slice(0, MAX_LABEL);
  return out;
}

const CLICKABLE =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="switch"], [role="radio"], summary, label, input, select';

/**
 * Liga o rastreio da tela, uma vez, na abertura: cliques e mudanças de controle (sem o texto digitado, só o
 * tamanho), atalhos de teclado, erros de JavaScript, rejeições sem tratamento, `console.error` e a ligação com o host.
 */
export function installUiTrace(): void {
  if (!hasHost) return;
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (el) traceUi({ ev: 'click', data: describe(el) });
    },
    true,
  );
  document.addEventListener(
    'change',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))
        return traceUi({ ev: 'change', data: { ...describe(el), checked: String(el.checked) } });
      if (el instanceof HTMLSelectElement) return traceUi({ ev: 'change', data: { ...describe(el), value: el.value } });
      // texto digitado não entra no rastreio: só que o campo mudou e o tamanho
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        traceUi({ ev: 'change', data: { ...describe(el), length: String(el.value.length) } });
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' && !(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && !((e.metaKey || e.ctrlKey) && e.key.length === 1))
        return;
      const key = [e.metaKey && 'Meta', e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.key].filter(Boolean).join('+');
      traceUi({ ev: 'key', data: { key, ...(e.target instanceof Element ? describe(e.target) : {}) } });
    },
    true,
  );
  window.addEventListener('error', (e) =>
    traceUi({ ev: 'js.error', ok: false, err: e.message, data: { at: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack } }),
  );
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    traceUi({
      ev: 'js.rejection',
      ok: false,
      err: reason instanceof Error ? reason.message : String(reason),
      data: reason instanceof Error ? { stack: reason.stack } : undefined,
    });
  });
  // o aviso do React (chave repetida, estado em componente desmontado) só aparece no console: vai também para o rastreio
  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    traceUi({ ev: 'console.error', ok: false, err: args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ') });
    consoleError(...args);
  };
  onConnectionChange((online) => traceUi({ ev: online ? 'online' : 'offline' }));
  traceUi({ ev: 'open', data: { url: location.pathname, width: String(window.innerWidth), height: String(window.innerHeight) } });
}
