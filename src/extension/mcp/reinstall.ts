import { ALL_AI_TOOLS, type AiTool } from '../../shared/harness';
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
 * Ferramentas em que o board está registrado no global (escopo do usuário). O Cursor nunca entra (o
 * registro dele é o do projeto, refeito a cada abertura da pasta), um registro só no projeto não conta
 * (a ativação não mexe em arquivo do projeto da pessoa) e um "faz-ai" que não aponta para uma ponte do
 * board é da pessoa: fica como está.
 */
export function userRegisteredTools(workspaceDir: string, homeDir: string): AiTool[] {
  return ALL_AI_TOOLS.filter((tool) => {
    if (tool === 'cursor') return false;
    const found = registeredServer(tool, workspaceDir, homeDir);
    return found?.scope === 'user' && isBoardBridge(found.args[0]);
  });
}

/**
 * Ferramentas que a instalação automática deve registrar/atualizar no usuário: as de `wanted` (a do board
 * aberto) sem registro de usuário do board, mais as já registradas cuja versão gravada difere da atual
 * ou cuja ponte registrada não é a de hoje. Um registro de projeto é ignorado (conta como "sem registro
 * de usuário", mas nunca é tocado); o Cursor fica de fora.
 */
export function toolsNeedingInstall(
  workspaceDir: string,
  homeDir: string,
  bridgePath: string,
  wanted: AiTool[],
  installedVersion: string | null,
  currentVersion: string,
): AiTool[] {
  const registered = userRegisteredTools(workspaceDir, homeDir);
  const candidates = new Set<AiTool>([...registered, ...wanted.filter((t) => t !== 'cursor')]);
  return ALL_AI_TOOLS.filter((tool) => {
    if (!candidates.has(tool)) return false;
    if (!registered.includes(tool)) {
      // um "faz-ai" de usuário que não é a ponte do board é da pessoa: não sobrescreve
      const found = registeredServer(tool, workspaceDir, homeDir);
      return !(found?.scope === 'user');
    }
    const found = registeredServer(tool, workspaceDir, homeDir);
    return installedVersion !== currentVersion || found?.args[0] !== bridgePath;
  });
}

export interface EnsureResult {
  done: AiTool[];
  failed: { tool: AiTool; message: string }[];
}

/**
 * Instala ou atualiza o registro global do board nas ferramentas de `tools`. Não lança: a falha de uma
 * ferramenta (CLI fora do PATH, JSON inválido) vai em `failed`, com a linha para rodar à mão, e as
 * outras seguem.
 */
export async function ensureUserServers(
  o: RegisterOptions & { pathEnv?: string; installedVersion: string | null; currentVersion: string; wanted: AiTool[] },
): Promise<EnsureResult> {
  const result: EnsureResult = { done: [], failed: [] };
  for (const tool of toolsNeedingInstall(o.workspaceDir, o.homeDir, o.bridgePath, o.wanted, o.installedVersion, o.currentVersion)) {
    try {
      await runRegistrationSteps(registerClients([tool], o), o.pathEnv, o.homeDir);
      result.done.push(tool);
    } catch (e) {
      result.failed.push({ tool, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
