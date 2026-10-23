import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModelOption } from '../../../../shared/models';
import { runCli } from '../../../cliRun';
import { kimiHome } from '../../../mcp/clientConfig';
import { parseKimiModels } from '../../../models';
import { kimiProvider } from '../../providers/kimi';
import { cliDriver, installSteps } from '../cli';

/**
 * Se o Kimi Code está autenticado. A CLI não tem `auth status` (2.1.1): o sinal é a existência de um
 * arquivo de credenciais OAuth em `credentials/` da pasta de dados ($KIMI_CODE_HOME ou ~/.kimi-code).
 * A sonda só roda com a CLI presente, então a pasta ausente é "nunca entrou na conta" (false), e só
 * um erro de leitura deixa a dúvida (null).
 */
export function kimiSignedIn(homeDir: string, dataDir?: string): boolean | null {
  const dir = path.join(dataDir || kimiHome(homeDir), 'credentials');
  try {
    return fs.readdirSync(dir).some((n) => n.endsWith('.json'));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? false : null;
  }
}

/** Os modelos que o Kimi Code oferece (`kimi provider list --json`); vazio com erro ou sem a CLI. */
export async function kimiModels(executable: string, pathEnv: string | undefined): Promise<ModelOption[]> {
  const run = await runCli(executable, ['provider', 'list', '--json'], pathEnv);
  return run.code === 0 ? parseKimiModels(run.stdout) : [];
}

/** Kimi Code pela CLI: o npm global é o instalador nos dois sistemas. */
export const kimiCliDriver = cliDriver({
  tool: 'kimi',
  provider: kimiProvider,
  docs: 'https://www.kimi.com/code/docs/en/',
  install: { unix: installSteps('npm install -g @moonshot-ai/kimi-code'), windows: installSteps('npm install -g @moonshot-ai/kimi-code') },
  // a cópia do perfil pode apontar outra pasta de dados pelo próprio ambiente
  signedIn: async (probe) => kimiSignedIn(probe.homeDir, probe.env?.KIMI_CODE_HOME),
  listModels: kimiModels,
});
