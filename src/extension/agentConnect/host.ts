// Como a tela de Conectar agentes inicia um agente nesta máquina: com o PATH do shell de login (o editor aberto
// pelo Dock não tem o PATH do terminal) e sem as variáveis da sessão do Claude Code que abriu o editor.
import { spawn } from 'node:child_process';
import { INHERITED_SESSION_ENV, launchSpec } from '../spawn';
import type { AgentSpawn } from './protocol';

/** O ambiente de um agente: o do editor, com o PATH do terminal e o que o agente pede, sem a sessão do Claude Code. */
export function agentEnv(pathEnv: string | undefined, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...extra };
  for (const key of INHERITED_SESSION_ENV) delete env[key];
  return env;
}

/** Inicia agentes com o PATH que `pathEnv` devolver na hora (ele muda quando a pessoa instala algo). */
export function agentSpawn(pathEnv: () => string | undefined): AgentSpawn {
  return (command, args, extra, cwd) => {
    const spec = launchSpec(command, args);
    return spawn(spec.file, spec.args, {
      cwd,
      env: agentEnv(pathEnv(), extra),
      shell: spec.shell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  };
}
