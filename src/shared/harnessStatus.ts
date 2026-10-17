// O que falta no banco de artefatos do board para as execuções trabalharem com artefatos de forma
// controlada. Vira um item do Diagnóstico do ambiente e uma recomendação no aviso do topo do board:
// o board funciona sem isso, só sem o ganho de economia e precisão.
import { BOARD_MCP_NAME, missingSelections, selectedItems } from './harnessSelection';
import type { BoardState } from './model';

/**
 * `artifacts`: nenhuma skill, agente ou servidor MCP em modo "Pelo card": o planejamento não tem de
 * onde escolher. `agents`: nenhum agente do board, toda execução roda com o escopo cheio. `rules`:
 * regras enviadas ao board e ainda desligadas, à espera de revisão. `missing`: um artefato do board
 * sumiu da origem. `cursor`: no Cursor, a CLI não desliga nada, e há regras, servidores ou hooks do
 * projeto que entram no contexto sem passar pelo board.
 */
export type HarnessIssue = 'artifacts' | 'agents' | 'rules' | 'missing' | 'cursor';

export const HARNESS_ISSUES: HarnessIssue[] = ['artifacts', 'agents', 'rules', 'missing', 'cursor'];

type View = Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>;

/** Os problemas do harness deste board, na ordem em que o Diagnóstico os mostra; vazio quando está tudo em ordem. */
export function harnessIssues(s: View): HarnessIssue[] {
  const out: HarnessIssue[] = [];
  const agents = s.board.execProfiles.filter((p) => p.scope !== 'builtin');
  const perCard = selectedItems(s, 'skill', 'contextual').length + selectedItems(s, 'mcp', 'contextual').length + agents.length;
  if (perCard === 0) out.push('artifacts');
  if (agents.length === 0) out.push('agents');
  if (selectedItems(s, 'instructions', 'off').length > 0) out.push('rules');
  if (missingSelections(s).length > 0) out.push('missing');
  // só o que entra sozinho no contexto do Cursor: regras, servidores (menos o do board) e hooks do projeto
  if (
    s.board.aiTool === 'cursor' &&
    (s.harness.inventory.find((t) => t.tool === 'cursor')?.items ?? []).some(
      (i) => i.scope === 'project' && (i.kind === 'instructions' || i.kind === 'hook' || (i.kind === 'mcp' && i.name !== BOARD_MCP_NAME)),
    )
  )
    out.push('cursor');
  return out;
}
