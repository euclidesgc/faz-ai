import { executorProfile, type AiExecutor } from './providers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { admitExecution, type StrictExecutionRequest, type ExecutionAdmissionDecision } from '../../shared/executionAdmission';
import { resolveCommand } from '../cliResolve';
import { headlessCommand, tmpArg, type HeadlessCommand, type HeadlessInput } from '../headless';
import { boardOnlyMcpConfig } from '../execution';
import { canonical, CapabilityEvidenceStore } from './capabilityEvidence';

export class AdmissionBlockedError extends Error {
  constructor(readonly decision: ExecutionAdmissionDecision) {
    super(
      `Execução bloqueada pela admissão: ${decision.reasons.map((r) => (r.capability ? `${r.code}/${r.capability}` : r.code)).join(', ')}.`,
    );
    this.name = 'AdmissionBlockedError';
  }
}
interface AdmissionOptions {
  pathEnv(): string | undefined;
  homeDir: string;
  evidence: CapabilityEvidenceStore;
  /** Hash de políticas gerenciadas e de fontes relevantes, coletado pelo verificador. Ausência não é prova. */
  environmentEvidence(): { state: 'complete'; digest: string } | { state: 'unknown' };
  now?(): number;
}
export interface AdmittedExecution {
  input: HeadlessInput;
  decision: ExecutionAdmissionDecision;
  /** Revalida identidade/argumentos/arquivos antes de cada tentativa e antes de liberar o launcher. */
  command(command: HeadlessCommand): HeadlessCommand;
}
function digestFile(file: string): string {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd);
    const buffer = Buffer.alloc(1024 * 1024);
    let count: number;
    while ((count = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, count));
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
      throw new Error('Binário alterado durante a conferência.');
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

/** Uma fonte de decisão para o gateway; não transforma metadados recebidos do cliente em prova. */
export class ExecutionAdmission {
  constructor(private readonly options: AdmissionOptions) {}
  binding(
    executor: AiExecutor,
    profileId: string,
    input: HeadlessInput,
    cwd: string,
  ): { binding: string; executable: string; environmentComplete: boolean } {
    const profile = executorProfile(executor);
    const template = headlessCommand(profile, { ...input, prompt: '<prompt-da-execucao>', structured: true });
    const executable = resolveCommand(
      template.command,
      template.env?.PATH ?? this.options.pathEnv(),
      this.options.homeDir,
      template.lookup,
    );
    if (!executable) throw new Error('Executor indisponível para admissão.');
    const real = fs.realpathSync(executable);
    const environment = this.options.environmentEvidence();
    const context = {
      version: 1,
      providerRevision: 1,
      platform: process.platform,
      arch: process.arch,
      hostRuntime: process.versions.node,
      profileId,
      tool: profile.base,
      ...(profile.kind !== 'builtin' ? { profileConfig: profile.config } : {}),
      executable: real,
      binary: digestFile(real),
      permission: input.permission,
      invocation: template,
      cwd: fs.realpathSync(cwd),
      additionalDirectories: (input.addDirs ?? []).map((d) => fs.realpathSync(path.resolve(cwd, d))),
      environment: { ...process.env, ...(this.options.pathEnv() ? { PATH: this.options.pathEnv() } : {}), ...template.env },
      environmentEvidence: environment,
    };
    return {
      executable: real,
      binding: createHash('sha256').update(canonical(context)).digest('hex'),
      environmentComplete: environment.state === 'complete' && /^[a-f0-9]{64}$/.test(environment.digest),
    };
  }
  /**
   * Só leitura para a prévia: mesma decisão pura e mesmas evidências locais, sem exigir as definições MCP
   * nem lançar. O vínculo é o de um comando sem MCP; com MCP ativo ele não coincide e a razão aparece.
   */
  preview(executor: AiExecutor, profileId: string, request: StrictExecutionRequest, cwd: string): ExecutionAdmissionDecision {
    const now = this.options.now?.() ?? Date.now();
    const permission = 'board' as const;
    const tool = executorProfile(executor).base;
    const preliminary = admitExecution(tool, permission, request, '', [], now);
    try {
      if (preliminary.reasons.some((r) => r.code !== 'capability-not-verified')) return preliminary;
      const input: HeadlessInput = {
        prompt: '',
        permission,
        structured: true,
        exec: {
          agent: '',
          agentDefinition: null,
          mcpBlocked: [],
          model: null,
          delegates: [],
          tools: preliminary.tools,
          deniedTools: preliminary.deniedTools,
          toolSet: 'explicit',
          mcpTools: preliminary.mcpTools,
          mcpAllowed: [],
          mcpConfig: '{"mcpServers":{}}',
        },
      };
      const bound = this.binding(executor, profileId, input, cwd);
      const decision = admitExecution(tool, permission, request, bound.binding, this.options.evidence.load(bound.binding), now);
      if (!bound.environmentComplete) {
        decision.state = 'blocked';
        decision.reasons.push({ code: 'environment-not-verified' });
      }
      return decision;
    } catch {
      preliminary.reasons.push({ code: 'executor-unavailable' });
      return preliminary;
    }
  }
  prepare(executor: AiExecutor, profileId: string, input: HeadlessInput, cwd: string, request: StrictExecutionRequest): AdmittedExecution {
    if (!profileId.trim() || profileId.length > 240 || profileId.includes('\0')) throw new Error('Identidade de perfil inválida.');
    const profile = structuredClone(executorProfile(executor));
    const tool = profile.base;
    const preliminary = admitExecution(tool, input.permission, request, '', [], this.options.now?.() ?? Date.now());
    if (preliminary.reasons.some((r) => r.code !== 'capability-not-verified')) throw new AdmissionBlockedError(preliminary);
    // O contexto da CLI fica fechado, mesmo sem MCP: nunca recorrer ao arquivo do usuário implicitamente.
    const source = JSON.parse(
      input.exec?.mcpConfig ?? (input.boardServer ? boardOnlyMcpConfig(input.boardServer) : '{"mcpServers":{}}'),
    ) as { mcpServers?: Record<string, unknown> };
    const names = request.mcpServers.filter((s) => preliminary.activeMcpIds.includes(s.artifactId)).map((s) => s.name);
    if (preliminary.mcpTools.some((name) => name.startsWith('mcp__faz-ai__'))) names.unshift('faz-ai');
    const servers: Record<string, unknown> = {};
    for (const name of names) {
      const definition = source.mcpServers?.[name];
      if (!definition || typeof definition !== 'object' || Array.isArray(definition))
        throw new Error('Definição MCP obrigatória indisponível na preparação da execução.');
      servers[name] = definition;
    }
    const effective: HeadlessInput = structuredClone({
      ...input,
      exec: {
        agent: '',
        agentDefinition: null,
        mcpBlocked: [],
        model: null,
        ...input.exec,
        delegates: [],
        tools: preliminary.tools,
        deniedTools: preliminary.deniedTools,
        toolSet: 'explicit',
        mcpTools: preliminary.mcpTools,
        mcpAllowed: names.filter((n) => n !== 'faz-ai'),
        mcpConfig: JSON.stringify({ mcpServers: servers }),
      },
    });
    if (effective.exec!.agent && !effective.exec!.agentDefinition)
      throw new Error('Agente obrigatório precisa de definição do board; descoberta nativa não é permitida.');
    if (effective.exec!.agentDefinition) {
      const definition = effective.exec!.agentDefinition;
      if (![definition.name, definition.description, definition.prompt].every((value) => typeof value === 'string'))
        throw new Error('Definição do agente inválida para admissão.');
      // Não transportar campos nativos extras de permissões, skills, MCP ou modelo: a política da sessão é única.
      effective.exec!.agentDefinition = {
        name: definition.name,
        description: definition.description,
        prompt: definition.prompt,
        tools: [...preliminary.tools],
        disallowedTools: [...preliminary.deniedTools],
      };
    }
    const bound = this.binding(profile, profileId, effective, cwd);
    const decision = admitExecution(
      tool,
      input.permission,
      request,
      bound.binding,
      this.options.evidence.load(bound.binding),
      this.options.now?.() ?? Date.now(),
    );
    if (!bound.environmentComplete) {
      decision.state = 'blocked';
      decision.reasons.push({ code: 'environment-not-verified' });
      decision.capabilities = decision.capabilities.map((c) =>
        c.capability === 'artifacts' ? { ...c, state: 'unknown', reason: 'incomplete' } : c,
      );
    }
    if (decision.state !== 'admitted') throw new AdmissionBlockedError(decision);
    return {
      input: effective,
      decision,
      command: (command) => {
        if (this.binding(profile, profileId, effective, cwd).binding !== bound.binding)
          throw new Error('O executor ou o ambiente mudou após a admissão.');
        const expected = headlessCommand(profile, { ...effective, structured: command.format !== 'text' });
        if (
          (command.command !== expected.command && command.command !== bound.executable) ||
          command.args.length !== expected.args.length ||
          canonical(command.env) !== canonical(expected.env) ||
          command.stdin !== expected.stdin ||
          command.format !== expected.format ||
          canonical(command.projectMcp) !== canonical(expected.projectMcp) ||
          canonical(command.tempFiles) !== canonical(expected.tempFiles) ||
          canonical(command.lookup) !== canonical(expected.lookup) ||
          command.noShell !== expected.noShell
        )
          throw new Error('O comando mudou após a admissão.');
        for (let i = 0; i < expected.args.length; i++) {
          const wanted = expected.args[i]!;
          const actual = command.args[i]!;
          const file = Object.keys(expected.tempFiles ?? {}).find((name) => wanted === tmpArg(name));
          if (file ? fs.readFileSync(actual, 'utf8') !== expected.tempFiles![file] : wanted !== actual)
            throw new Error('Uma restrição obrigatória mudou após a admissão.');
        }
        return { ...command, command: bound.executable };
      },
    };
  }
}
