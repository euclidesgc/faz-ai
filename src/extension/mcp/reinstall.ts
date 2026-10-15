import { aiToolInfo, ALL_AI_TOOLS, type AiTool } from '../../shared/harness';
import { runCli } from '../cliProbe';
import { resolveCommand } from '../cliResolve';
import { registeredServer } from '../requirements';
import { isBoardBridge, registerClients, type RegisterOptions, type Registration } from './clientConfig';

/**
 * Roda os comandos de CLI que um registro pede (`Registration.run`), em ordem. Um passo marcado com
 * `mayFail` (a remoção do registro anterior) pode falhar ou nem existir; os outros lançam com a linha
 * para a pessoa rodar à mão no terminal.
 */
export async function runRegistrationSteps(done: Registration[], pathEnv: string | undefined, homeDir: string): Promise<void> {
  for (const step of done.flatMap((d) => d.run ?? [])) {
    const exe = resolveCommand(step.command, pathEnv, homeDir);
    const manual = `${step.command} ${step.args.map((a) => (/[\s"{}]/.test(a) ? `'${a}'` : a)).join(' ')}`;
    if (!exe) {
      if (step.mayFail) continue;
      throw new Error(`A linha de comando "${step.command}" não foi encontrada. Rode no terminal: ${manual}`);
    }
    const r = await runCli(exe, step.args, pathEnv);
    if (r.code !== 0 && !step.mayFail)
      throw new Error(
        `"${step.command}" não conseguiu registrar o servidor (${(r.stderr || r.stdout).trim()}). Rode no terminal: ${manual}`,
      );
  }
}

/**
 * Ferramentas em que o board está registrado no global: só nelas a atualização da extensão refaz o
 * registro. O Cursor nunca entra (o registro dele é o do projeto, refeito a cada abertura da pasta), um
 * registro só no projeto não conta (a ativação não mexe em arquivo do projeto da pessoa) e um "faz-ai"
 * que não aponta para uma ponte do board é da pessoa: fica como está.
 */
export function userRegisteredTools(workspaceDir: string, homeDir: string): AiTool[] {
  return ALL_AI_TOOLS.filter((tool) => {
    if (tool === 'cursor') return false;
    const found = registeredServer(tool, workspaceDir, homeDir);
    return found?.scope === 'user' && isBoardBridge(found.args[0]);
  });
}

/**
 * Refaz o registro global do board nas ferramentas em que ele já está: o que a ferramenta guarda (o
 * comando, a ponte) pode ter mudado com a extensão. Não lança: a falha de uma ferramenta (CLI fora do
 * PATH, JSON inválido) vai para `log` e as outras seguem; a faixa de requisitos continua apontando o
 * registro velho. Devolve as ferramentas refeitas.
 */
export async function reinstallUserServers(o: RegisterOptions & { pathEnv?: string; log: (message: string) => void }): Promise<AiTool[]> {
  const done: AiTool[] = [];
  for (const tool of userRegisteredTools(o.workspaceDir, o.homeDir)) {
    try {
      await runRegistrationSteps(registerClients([tool], o), o.pathEnv, o.homeDir);
      done.push(tool);
    } catch (e) {
      o.log(
        `Faz AI: não foi possível refazer o registro do board no ${aiToolInfo(tool).label}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return done;
}
