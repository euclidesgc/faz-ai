/** Regras puras do portão: as checagens da coluna que o board roda quando a IA tenta sair dela. */

import type { BoardState, Card, ColumnCheck } from './model';

export type { ColumnCheck };

/** `move`: a IA tenta mover o card para a frente; `review`: a IA pede a revisão da pessoa. */
export type GateKind = 'move' | 'review';
export type GateResult = 'running' | 'passed' | 'failed' | 'interrupted';

/**
 * O portão vale só para a IA (a pessoa arrasta o card sem passar por ele), saindo para a frente de uma coluna com
 * checagens ou pedindo a revisão nela. O card `verifying` não reentra: um pedido repetido não abre um segundo portão.
 */
export function gateApplies(state: BoardState, card: Card, kind: GateKind, targetColumnId: string | null, byAi: boolean): boolean {
  if (!byAi) return false;
  if (card.status !== 'running' && card.status !== 'ready') return false;
  const current = state.columns.find((c) => c.id === card.columnId);
  if (!current || current.checks.length === 0) return false;
  if (kind === 'review') return true;
  const target = state.columns.find((c) => c.id === targetColumnId);
  if (!target || target.id === current.id || target.workflowId !== current.workflowId) return false;
  return target.position > current.position && target.category !== 'cancelled';
}

/** Escapa um argumento para o shell com aspas simples (o `'` interno vira `'\''`); não expande `$` nem crase. */
export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Troca `{base}` pela branch de base e `{changed_files}` pela lista dos arquivos alterados, cada nome entre aspas
 * simples. Lista vazia vira texto vazio: quem escreve o comando decide o que fazer sem arquivos.
 */
export function expandCommand(command: string, vars: { base: string; changedFiles: string[] }): string {
  const files = vars.changedFiles.map(shellQuote).join(' ');
  const base = shellQuote(vars.base);
  // uma passada só: um arquivo chamado `{base}` não pode ter o marcador trocado depois, já dentro das aspas dele, o que
  // tiraria a base das aspas. A função de troca impede que um `$&` no nome seja lido como padrão do replace
  return command.replace(/\{(changed_files|base)\}/g, (_, name: string) => (name === 'base' ? base : files));
}

/** O fim da saída de uma checagem: as últimas linhas, limitadas também em caracteres (o que a IA precisa ler). */
export function tailOf(output: string, maxLines = 40, maxChars = 4000): string {
  const lines = output.replace(/\s+$/, '').split('\n');
  let tail = lines.slice(-maxLines).join('\n');
  if (tail.length > maxChars) tail = tail.slice(tail.length - maxChars);
  return tail;
}
