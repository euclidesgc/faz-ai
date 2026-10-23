import { isCatalogProfile, type AiProfile } from '../shared/aiProfiles';
import { redactCredentialValues } from './credentials';
import { runCli, type CliRun } from './cliRun';
import { driverOf } from './ai/drivers';

// as consultas por ferramenta moram nos drivers de conexão (`ai/drivers/`); ficam exportadas daqui para
// quem já as importava
export { runCli, type CliRun } from './cliRun';
export { claudeSignedIn } from './ai/drivers/claude/cli';
export { cursorModels, cursorSignedIn } from './ai/drivers/cursor/cli';
export { kimiModels, kimiSignedIn } from './ai/drivers/kimi/cli';

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
  const args =
    profile.kind === 'custom'
      ? (profile.config.versionArgs ?? '--version').trim().split(/\s+/).filter(Boolean)
      : [...(driverOf(profile)?.versionArgs ?? ['--version'])];
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
  if (profile.kind === 'custom') {
    const args = profile.config.statusArgs?.trim().split(/\s+/).filter(Boolean);
    if (!args?.length) return null;
    const result = await runProfileQuery(profile, executable, args, options);
    return result.code === null ? null : result.code === 0;
  }
  // a CLI pronta, a cópia dela e o agente ACP pronto: a sonda é a do driver da ferramenta no modo do
  // perfil (o agente ACP não tem comando de status e responde null; o login pela tela é a história 7)
  const driver = driverOf(profile);
  if (!driver) return null;
  return driver.signedIn({
    homeDir,
    query: (args) => runProfileQuery(profile, executable, args, options),
    ...(profile.kind === 'copy' && profile.config.env ? { env: profile.config.env } : {}),
  });
}
