// A fachada de montagem do comando da CLI. Quem sabe montar o comando de cada ferramenta é o provider
// dela (`ai/providers/`); aqui ficam só as perguntas que o resto do board faz sobre isso.
import { isAiBase } from '../shared/harness';
import { isAcpProfile } from '../shared/aiProfiles';
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

export function headlessCommand(tool: AiExecutor, input: HeadlessInput): HeadlessCommand {
  return providerFor(tool).command(input);
}
