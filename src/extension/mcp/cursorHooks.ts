// Registro do hook do board no ~/.cursor/hooks.json global, refeito ao atualizar a extensão. A
// entrada do board é reconhecida pelo nome do script; os hooks da pessoa não são tocados.
import * as fs from 'node:fs';
import * as path from 'node:path';

export const CURSOR_HOOK_EVENTS = ['preToolUse', 'beforeMCPExecution', 'subagentStart', 'beforeReadFile'] as const;
const SCRIPT_NAME = 'cursor-hook.js';

interface HooksFile {
  version?: number;
  hooks?: Record<string, { command?: unknown }[] | undefined>;
  [k: string]: unknown;
}

const hooksFile = (homeDir: string): string => path.join(homeDir, '.cursor', 'hooks.json');
const quote = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;
const isBoard = (e: { command?: unknown }): boolean => typeof e?.command === 'string' && e.command.includes(SCRIPT_NAME);

function read(file: string): HooksFile | null | 'invalid' {
  if (!fs.existsSync(file)) return null;
  try {
    const j: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof j === 'object' && j !== null && !Array.isArray(j) ? (j as HooksFile) : 'invalid';
  } catch {
    return 'invalid';
  }
}

export function installCursorHook(o: {
  homeDir: string;
  scriptPath: string;
  nodeCommand?: string;
}): 'created' | 'updated' | 'unchanged' | 'invalid' {
  const file = hooksFile(o.homeDir);
  const current = read(file);
  // arquivo da pessoa que não é JSON: não sobrescrever; segue sem a garantia
  if (current === 'invalid') return 'invalid';
  const command = `${quote(o.nodeCommand ?? 'node')} ${quote(o.scriptPath)}`;
  const before = JSON.stringify(current);
  const next: HooksFile = { version: 1, ...current, hooks: { ...current?.hooks } };
  for (const ev of CURSOR_HOOK_EVENTS) {
    const others = (next.hooks![ev] ?? []).filter((e) => !isBoard(e));
    next.hooks![ev] = [...others, { command }];
  }
  if (JSON.stringify(next) === before) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return current ? 'updated' : 'created';
}

/** Tira só a entrada do board; true se havia. */
export function uninstallCursorHook(homeDir: string): boolean {
  const file = hooksFile(homeDir);
  const current = read(file);
  if (!current || current === 'invalid' || !current.hooks) return false;
  let removed = false;
  for (const [ev, list] of Object.entries(current.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((e) => !isBoard(e));
    if (kept.length !== list.length) {
      removed = true;
      if (kept.length) current.hooks[ev] = kept;
      else delete current.hooks[ev];
    }
  }
  if (removed) fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n');
  return removed;
}

/**
 * O hook do board está pronto para garantir a execução? null quando sim; senão o motivo, em português.
 * Ausente (script apagado, entrada fora do hooks.json, arquivo ilegível) ou desatualizado (a entrada
 * aponta para outro script que não o desta versão da extensão) faz o perfil voltar para "parcial".
 */
export function cursorHookStatus(o: { homeDir: string; scriptPath: string }): string | null {
  if (!fs.existsSync(o.scriptPath)) return 'o script do hook do board não existe (reabra a janela para reinstalá-lo)';
  const current = read(hooksFile(o.homeDir));
  if (current === 'invalid') return '~/.cursor/hooks.json não é um JSON válido';
  if (!current?.hooks) return 'o hook do board não está registrado em ~/.cursor/hooks.json';
  for (const ev of CURSOR_HOOK_EVENTS) {
    const entries = (current.hooks[ev] ?? []).filter(isBoard);
    if (!entries.length) return `o hook do board não está registrado para ${ev}`;
    if (!entries.some((e) => (e.command as string).includes(o.scriptPath)))
      return `o hook do board em ${ev} aponta para outro script (desatualizado); reabra a janela para atualizá-lo`;
  }
  return null;
}
