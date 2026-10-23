// O vínculo de isolamento como a admissão o calculava antes do contrato de execução (épica "ferramenta
// por modo", história 6), congelado aqui. A história 6 passou a montar a parte da ferramenta pelo driver
// (`bindingContext`); o hash precisa sair igual, senão toda prova gravada perderia a validade. Esta cópia
// não deve acompanhar refatorações da admissão: ela é a régua. Só muda junto com uma mudança de formato
// deliberada do vínculo (o `version` do contexto), com o registro de decisão que a explica.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { bindingEnvironment } from '../../src/extension/ai/admission';
import { acpAgent } from '../../src/extension/ai/acp/agents';
import { acpCommand, acpSessionMode } from '../../src/extension/ai/acp/provider';
import { canonical } from '../../src/extension/ai/capabilityEvidence';
import { executorProfile, type AiExecutor } from '../../src/extension/ai/providers';
import { resolveCommand } from '../../src/extension/cliResolve';
import { headlessCommand, type HeadlessInput } from '../../src/extension/headless';
import { isAcpProfile, isReadyCli } from '../../src/shared/aiProfiles';

export interface ReferenceOptions {
  pathEnv: string | undefined;
  homeDir: string;
  environmentEvidence: { state: 'complete'; digest: string } | { state: 'unknown' };
}

/** O hash que a admissão da história 3 (formato 2) dava para o executor, o perfil, a entrada e a pasta. */
export function referenceBinding(
  executor: AiExecutor,
  profileId: string,
  input: HeadlessInput,
  cwd: string | null,
  options: ReferenceOptions,
): string {
  const profile = executorProfile(executor);
  const agent = isAcpProfile(profile) ? acpAgent(String(profile.config.acpAgent)) : null;
  if (isAcpProfile(profile) && !agent) throw new Error('agente desconhecido');
  const template = agent
    ? {
        transport: 'acp' as const,
        agent: agent.id,
        ...acpCommand(agent, { ...input, prompt: '<prompt-da-execucao>' }),
        sessionMode: acpSessionMode(agent, input) ?? 'padrao',
      }
    : headlessCommand(profile, { ...input, prompt: '<prompt-da-execucao>', structured: true });
  const executable = resolveCommand(
    template.command,
    ('env' in template ? template.env?.PATH : undefined) ?? options.pathEnv,
    options.homeDir,
    'lookup' in template ? template.lookup : undefined,
  );
  if (!executable) throw new Error('Executor indisponível para admissão.');
  const real = fs.realpathSync(executable);
  const context = {
    version: 2,
    providerRevision: 1,
    platform: process.platform,
    arch: process.arch,
    hostRuntime: process.versions.node,
    profileId,
    tool: profile.base,
    ...(!isReadyCli(profile) ? { profileConfig: profile.config } : {}),
    executable: real,
    binary: createHash('sha256').update(fs.readFileSync(real)).digest('hex'),
    invocation: template,
    ...(cwd === null
      ? { scope: 'isolation' }
      : {
          cwd: fs.realpathSync(cwd),
          additionalDirectories: (input.addDirs ?? []).map((d) => fs.realpathSync(path.resolve(cwd, d))),
        }),
    environment: bindingEnvironment(process.env, options.pathEnv, 'env' in template ? template.env : undefined),
    environmentEvidence: options.environmentEvidence,
  };
  return createHash('sha256').update(canonical(context)).digest('hex');
}
