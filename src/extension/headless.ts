// A fachada de montagem do comando da CLI. Quem sabe montar o comando de cada ferramenta é o provider
// dela (`ai/providers/`); aqui ficam só as perguntas que o resto do board faz sobre isso.
import { aiToolInfo, type AiTool } from '../shared/harness';
import type { RunnerPermission } from '../shared/runner';
import { providerFor } from './ai/providers';

export { tmpArg, type HeadlessCommand, type HeadlessInput } from './ai/provider';
export { CURSOR_TOOLS, cursorModelId } from './ai/providers/cursor';

import type { HeadlessCommand, HeadlessInput } from './ai/provider';

/** Por que o board não pode executar a ferramenta com esta permissão; null quando pode. */
export function headlessUnsupported(tool: AiTool, permission: RunnerPermission, uid = process.getuid?.()): string | null {
  // o Claude Code recusa pular as permissões rodando como root (contêiner, WSL como root)
  if (tool === 'claude' && permission === 'full' && uid === 0)
    return 'O Claude Code não roda "Sem restrições" como root (comum em contêineres e no WSL como root), e o modo autônomo usa esse nível. Rode o editor com um usuário comum, ou escolha "Board e arquivos" em Configurações → Harness de IA → Execução pela conversa.';
  if (providerFor(tool).command({ prompt: '', permission })) return null;
  return `O ${aiToolInfo(tool).label}, quando roda em segundo plano, não pede aprovação de nada e não aceita limites por linha de comando. Para chamá-lo pelo board, escolha "Sem restrições" em Configurações → Harness de IA → Execução pela conversa.`;
}

export function headlessCommand(tool: AiTool, input: HeadlessInput): HeadlessCommand | { unsupported: string } {
  return providerFor(tool).command(input) ?? { unsupported: headlessUnsupported(tool, input.permission)! };
}
