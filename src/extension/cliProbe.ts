import { isCatalogProfile, type AiProfile } from '../shared/aiProfiles';
import { redactCredentialValues } from './credentials';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModelOption } from '../shared/models';
import { parseCursorModels, parseKimiModels } from './models';
import { kimiHome } from './mcp/clientConfig';
import { launchSpec } from './spawn';

export interface CliRun {
  /** código de saída; null quando o processo nem rodou ou passou do tempo */
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Roda um comando curto de consulta de uma CLI (status, lista de modelos) e devolve a saída. Nunca
 * rejeita: uma CLI que falha, some ou trava vira `code: null`, e quem chama trata como "não deu
 * para saber", não como erro do board.
 */
export function runCli(
  file: string,
  args: string[],
  pathEnv: string | undefined,
  timeoutMs = 20_000,
  /** pasta em que o comando roda; os de plugin do Claude Code acham o escopo de projeto por ela */
  cwd?: string,
  options: { env?: Record<string, string>; noShell?: boolean } = {},
): Promise<CliRun> {
  return new Promise((resolve) => {
    // no Windows, uma CLI instalada como .cmd só roda pelo shell, como nas execuções
    if (options.noShell && process.platform === 'win32' && /\.(cmd|bat)$/i.test(file))
      return resolve({ code: null, stdout: '', stderr: '' });
    const launch = options.noShell ? { file, args, shell: false } : launchSpec(file, args);
    execFile(
      launch.file,
      launch.args,
      {
        timeout: timeoutMs,
        ...(cwd ? { cwd } : {}),
        shell: launch.shell,
        windowsVerbatimArguments: launch.shell,
        // no Windows, o shell abriria uma janela do cmd.exe a cada consulta
        windowsHide: true,
        env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...options.env, NO_COLOR: '1', NO_OPEN_BROWSER: '1' },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number(err.code) : null) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Se a CLI do Cursor está autenticada (`cursor-agent status --format json`); null quando não deu para saber. */
export async function cursorSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  const run = await runCli(executable, ['status', '--format', 'json'], pathEnv);
  try {
    const v = JSON.parse(run.stdout) as { isAuthenticated?: unknown };
    return typeof v.isAuthenticated === 'boolean' ? v.isAuthenticated : null;
  } catch {
    return null;
  }
}

/** Se o Claude Code está autenticado (`claude auth status`, JSON com `loggedIn`); null quando não deu para saber. */
export async function claudeSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  const run = await runCli(executable, ['auth', 'status'], pathEnv);
  try {
    const v = JSON.parse(run.stdout) as { loggedIn?: unknown };
    return typeof v.loggedIn === 'boolean' ? v.loggedIn : null;
  } catch {
    return null;
  }
}

/** Os modelos da conta em uso no Cursor (`cursor-agent models`); vazio sem login ou com erro. */
export async function cursorModels(executable: string, pathEnv: string | undefined): Promise<ModelOption[]> {
  const run = await runCli(executable, ['models'], pathEnv);
  return run.code === 0 ? parseCursorModels(run.stdout) : [];
}

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

export interface ProfileProbeOptions {
  pathEnv?: string;
  cwd?: string;
}
/** Referências importadas ou cópias sem revisão nunca iniciam consultas. */
export function profileCanProbe(profile: AiProfile): boolean {
  return (
    profile.enabled &&
    profile.credentials?.review !== 'pending' &&
    (isCatalogProfile(profile) || (profile.credentials?.review === 'reviewed' && profile.credentials.available))
  );
}
async function runProfileQuery(profile: AiProfile, executable: string, args: string[], options: ProfileProbeOptions): Promise<CliRun> {
  if (!profileCanProbe(profile)) return { code: null, stdout: '', stderr: '' };
  return runCli(executable, args, options.pathEnv, 20000, options.cwd, {
    noShell: true,
    env: isCatalogProfile(profile) ? undefined : profile.config.env,
  });
}
/** Retorna somente a versão, nunca saída bruta que possa revelar credenciais. Não é prova de isolamento. */
export async function profileVersion(profile: AiProfile, executable: string, options: ProfileProbeOptions = {}): Promise<string | null> {
  const args = profile.kind === 'custom' ? (profile.config.versionArgs ?? '--version').trim().split(/\s+/).filter(Boolean) : ['--version'];
  if (!args.length) return null;
  const result = await runProfileQuery(profile, executable, args, options);
  if (result.code !== 0) return null;
  const safe = redactCredentialValues(result.stdout, profile.config);
  return /\bv?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)\b/.exec(safe)?.[1] ?? null;
}
export async function profileSignedIn(
  profile: AiProfile,
  executable: string,
  homeDir: string,
  options: ProfileProbeOptions = {},
): Promise<boolean | null> {
  if (!profileCanProbe(profile)) return null;
  // o agente ACP pronto não tem comando de status; o login pela tela (authMethods) é outra história da épica
  if (profile.kind === 'acp') return null;
  if (profile.kind === 'custom') {
    const args = profile.config.statusArgs?.trim().split(/\s+/).filter(Boolean);
    if (!args?.length) return null;
    const result = await runProfileQuery(profile, executable, args, options);
    return result.code === null ? null : result.code === 0;
  }
  if (profile.base === 'kimi') return kimiSignedIn(homeDir, profile.kind === 'copy' ? profile.config.env?.KIMI_CODE_HOME : undefined);
  const result = await runProfileQuery(
    profile,
    executable,
    profile.base === 'claude' ? ['auth', 'status'] : ['status', '--format', 'json'],
    options,
  );
  if (result.code === null) return null;
  try {
    const data = JSON.parse(result.stdout) as Record<string, unknown>;
    const field = profile.base === 'claude' ? data.loggedIn : data.isAuthenticated;
    return typeof field === 'boolean' ? field : null;
  } catch {
    return null;
  }
}
