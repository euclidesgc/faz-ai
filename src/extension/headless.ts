// A fachada de montagem do comando da CLI. Quem sabe montar o comando de cada ferramenta é o provider
// dela (`ai/providers/`); aqui ficam só as perguntas que o resto do board faz sobre isso.
import type { AiTool } from '../shared/harness';
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
  return null;
}

export function headlessCommand(tool: AiTool, input: HeadlessInput): HeadlessCommand {
  return providerFor(tool).command(input);
}
