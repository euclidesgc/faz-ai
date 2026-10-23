import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { toolModeEntry } from '../../../../shared/aiTools';
import { resolveCommand } from '../../../cliResolve';
import { geminiCliProvider } from '../../providers/gemini';
import { cliExecutor, installSteps } from '../cli';
import type { ProcessBinding, ToolDriver } from '../types';
import { geminiApiDriver } from './api';

/**
 * Os arquivos de configuração gerenciada do Gemini CLI (geminicli.com/docs/reference/configuration): as
 * configurações e os padrões do sistema (que a home isolada não substitui: elas valem por cima do settings do
 * board) e as políticas do administrador. As variáveis que as movem entram no vínculo pelo ambiente.
 */
export function geminiSystemFiles(platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  const dir =
    platform === 'darwin'
      ? '/Library/Application Support/GeminiCli'
      : platform === 'win32'
        ? 'C:\\ProgramData\\gemini-cli'
        : '/etc/gemini-cli';
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  return [
    env.GEMINI_CLI_SYSTEM_SETTINGS_PATH || join(dir, 'settings.json'),
    env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH || join(dir, 'system-defaults.json'),
    join(dir, 'policies'),
  ];
}

/** O digest do que está nesses caminhos (ausente conta como ausente); entra no vínculo do Gemini pela CLI. */
export function geminiSystemDigest(files: readonly string[] = geminiSystemFiles()): string {
  const hash = createHash('sha256');
  const add = (file: string): void => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      hash.update(`${file}\0ausente\0`);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`${file}\0pasta\0`);
      for (const name of fs.readdirSync(file).sort()) add(path.join(file, name));
    } else {
      hash.update(`${file}\0`);
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
  };
  for (const file of files) add(file);
  return hash.digest('hex');
}

/**
 * Gemini CLI pela linha de comando de uma passada (`gemini -p`, história 8): o mesmo binário do modo ACP. O
 * comando, a home isolada e o leitor são do provider (`providers/gemini.ts`); aqui ficam o que a conexão
 * precisa (instalador, login por chave, modelos pela API) e a execução, que entrega a chave do cofre ao
 * processo só no ambiente. As sondas com sentinelas estão no verificador do host (`capabilityVerifier.ts`).
 */
export const geminiCliDriver: ToolDriver = {
  tool: 'gemini',
  mode: 'cli',
  command: 'gemini',
  locate: (pathEnv, homeDir) => resolveCommand('gemini', pathEnv, homeDir),
  versionArgs: ['--version'],
  docs: 'https://geminicli.com/docs/get-started/installation/',
  // o npm global é o instalador nos dois sistemas (a página lista também o Homebrew e o MacPorts; conferida em
  // 2026-10-23)
  install: () => installSteps('npm install -g @google/gemini-cli'),
  // a chave do cofre (a mesma dos três modos) vai no ambiente de cada execução (`GEMINI_API_KEY`); o Conectar
  // a confere pela API, lendo os modelos (`apiModels`), como no modo API
  auth: { kind: 'api-key', docs: 'https://aistudio.google.com/apikey' },
  // sem comando de status: a chave no cofre conta como login; sem ela, "não verificado" (a pessoa pode ter a
  // própria `GEMINI_API_KEY` no ambiente, que a CLI usa quando o cofre não tem chave)
  signedIn: async (probe) => (probe.hasApiKey ? true : null),
  // a CLI não tem comando que liste modelos (0.65.0): a lista é a da API, com a mesma chave e o mesmo leitor do
  // modo API
  apiModels: (apiKey) => geminiApiDriver.apiModels!(apiKey),
  measure: geminiCliProvider.measure,
  enforcement: toolModeEntry('gemini', 'cli')!.enforcement,
  transport: 'cli',
  // o executor de CLI de sempre (o comando e o leitor vêm do provider do perfil); a diferença é a chave, que
  // entra no comando só depois de montado: o gateway confere o comando (sem ela) e o `spawn` do host a põe no
  // ambiente do processo, na variável que o provider declarou. Sem chave no cofre, vale a do ambiente da pessoa
  run: (input, ctx) => {
    const apiKey = ctx.apiKey;
    return cliExecutor.run(input, {
      ...ctx,
      spawn: (command, cwd, out, control) => ctx.spawn(apiKey && command.apiKeyEnv ? { ...command, apiKey } : command, cwd, out, control),
    });
  },
  // o vínculo é o comando inteiro com a saída estruturada (o settings da home incluído) e o digest da
  // configuração gerenciada do sistema, que vale por cima da home do board; a chave não entra (trocá-la não
  // invalida as provas, como no ACP)
  bindingContext: (input, ctx) => {
    const tool = cliExecutor.bindingContext(input, ctx) as ProcessBinding;
    return { ...tool, invocation: { ...tool.invocation, systemSettings: geminiSystemDigest() } };
  },
};
