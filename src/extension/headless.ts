// A fachada de montagem do comando da CLI. Quem sabe montar o comando de cada ferramenta é o provider
// dela (`ai/providers/`); aqui ficam só as perguntas que o resto do board faz sobre isso.
import { isAiBase } from '../shared/harness';
import { activeProfile, isAcpProfile, type AiProfile } from '../shared/aiProfiles';
import type { AiTool } from '../shared/harness';
import type { Board } from '../shared/model';
import type { RunnerPermission } from '../shared/runner';
import { providerFor, executorProfile, type AiExecutor } from './ai/providers';

export { tmpArg, type HeadlessCommand, type HeadlessInput } from './ai/provider';
export { CURSOR_TOOLS, cursorModelId } from './ai/providers/cursor';

import type { HeadlessCommand, HeadlessInput } from './ai/provider';

/** Por que o board não pode executar a ferramenta com esta permissão; null quando pode. */
export function headlessUnsupported(executor: AiExecutor, permission: RunnerPermission, uid = process.getuid?.()): string | null {
  if (typeof executor === 'string' && !isAiBase(executor)) return 'Perfil de CLI ainda não disponível para execução.';
  const profile = executorProfile(executor);
  const tool = profile.base;
  // no ACP a permissão é respondida pelo board a cada pedido do agente: o perfil não precisa de argumentos por nível
  if (isAcpProfile(profile)) return null;
  if (profile.kind === 'custom' && permission !== 'full' && !profile.config.permissionArgs?.[permission]?.length)
    return 'O perfil não declara argumentos para esta permissão restrita.';
  // o Claude Code recusa pular as permissões rodando como root (contêiner, WSL como root)
  if (tool === 'claude' && permission === 'full' && uid === 0)
    return 'O Claude Code não roda "Sem restrições" como root (comum em contêineres e no WSL como root), e o modo autônomo usa esse nível. Rode o editor com um usuário comum, ou escolha "Board e arquivos" em Configurações → Harness → Execução pela conversa.';
  return null;
}

/**
 * O perfil personalizado de CLI não passa na admissão por capacidades: o board não prova o que um comando qualquer
 * acessa (não é verificável, história 13) nem traduz as ferramentas do card para ele (`tool-mapping-unavailable`).
 * O "Trabalhar na fase" desliga antes do clique com este motivo, em vez de ligar e a execução ser recusada.
 */
export const CUSTOM_CLI_UNSUPPORTED =
  'O perfil personalizado de CLI não roda cards: o board não consegue provar o que ele acessa. Use um agente do catálogo pelo Conectar, em Configurações › Conectar agentes.';

/** O motivo de um perfil personalizado de CLI não rodar; null nos demais (o personalizado ACP antigo segue rodando). */
export function customCliUnsupported(profile: AiProfile): string | null {
  return profile.kind === 'custom' && !isAcpProfile(profile) ? CUSTOM_CLI_UNSUPPORTED : null;
}

/**
 * Por que cada perfil ligado não roda pelo board (`aiRunUnsupportedBy`) e, só quando nenhum ligado roda, o motivo
 * geral (`aiRunUnsupported`, o do padrão primeiro), que para o heartbeat. O board roda qualquer agente ligado ao
 * mesmo tempo: o padrão sem rodar não desliga os cards que escolheram o modelo de outro agente.
 */
export function runUnsupported(board: Pick<Board, 'aiTool' | 'aiProfiles' | 'runner'>): {
  aiRunUnsupported: string | null;
  aiRunUnsupportedBy: Record<AiTool, string>;
} {
  const by: Record<AiTool, string> = {};
  // o perfil padrão resolvido, não o id: um personalizado ou ACP como padrão não é "indisponível"
  const standard = activeProfile(board);
  const enabled = [standard, ...board.aiProfiles.filter((p) => p.enabled && p.id !== standard.id)];
  for (const p of enabled) {
    const reason = customCliUnsupported(p) ?? headlessUnsupported(p, board.runner.permission);
    if (reason) by[p.id] = reason;
  }
  const all = enabled.every((p) => by[p.id]);
  return { aiRunUnsupported: all ? (by[standard.id] ?? null) : null, aiRunUnsupportedBy: by };
}

export function headlessCommand(tool: AiExecutor, input: HeadlessInput): HeadlessCommand {
  return providerFor(tool).command(input);
}
