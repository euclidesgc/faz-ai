import type { RunnerPermission } from '../../shared/runner';
import type { AiProfile } from '../../shared/aiProfiles';
import { executorProfile, type AiExecutor } from './providers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  admitExecution,
  type ExecutionTransport,
  type StrictExecutionRequest,
  type ExecutionAdmissionDecision,
} from '../../shared/executionAdmission';
import { isAcpProfile } from '../../shared/aiProfiles';
import { resolveCommand } from '../cliResolve';
import { acpAgent } from './acp/agents';
import { acpCommand, type AcpAgent } from './acp/provider';
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
/** O comando de um agente ACP como o gateway o inicia. */
export interface AcpBuiltCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}
export interface AdmittedExecution {
  input: HeadlessInput;
  decision: ExecutionAdmissionDecision;
  transport: ExecutionTransport;
  /** Revalida identidade/argumentos/arquivos antes de cada tentativa e antes de liberar o launcher. */
  command(command: HeadlessCommand): HeadlessCommand;
  /** O mesmo para o agente ACP: o comando e os argumentos do catálogo, sem arquivo temporário nem formato. */
  acpCommand(command: AcpBuiltCommand): AcpBuiltCommand;
}
/** O agente do catálogo de um perfil ACP; lança se o id não existe (o gateway recusa pelo mesmo motivo). */
export function admissionAgent(profile: AiProfile): AcpAgent | null {
  if (!isAcpProfile(profile)) return null;
  const agent = acpAgent(String(profile.config.acpAgent));
  if (!agent) throw new Error(`Agente ACP desconhecido: ${String(profile.config.acpAgent)}.`);
  return agent;
}
export const admissionTransport = (profile: AiProfile): ExecutionTransport => (isAcpProfile(profile) ? 'acp' : 'cli');
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

/** Entrada canônica do vínculo de isolamento: as flags de isolamento não dependem do conteúdo por execução. */
export function isolationInput(permission: RunnerPermission): HeadlessInput {
  return {
    prompt: '',
    permission,
    structured: true,
    exec: {
      agent: '',
      agentDefinition: null,
      mcpBlocked: [],
      model: null,
      tools: ['Read'],
      deniedTools: ['Agent', 'Task', 'SendMessage', 'ListAgents'],
      toolSet: 'explicit',
      mcpTools: ['mcp__allowed__allowed'],
      mcpAllowed: ['allowed'],
      mcpConfig: '{"mcpServers":{"allowed":{}}}',
    },
  };
}

/** Uma fonte de decisão para o gateway; não transforma metadados recebidos do cliente em prova. */
export class ExecutionAdmission {
  constructor(private readonly options: AdmissionOptions) {}
  binding(
    executor: AiExecutor,
    profileId: string,
    input: HeadlessInput,
    cwd: string | null,
  ): { binding: string; executable: string; environmentComplete: boolean } {
    const profile = executorProfile(executor);
    const agent = admissionAgent(profile);
    // no ACP o vínculo é o comando e os argumentos do agente do catálogo: não há flags de isolamento,
    // arquivo temporário nem formato de saída; o modelo do card entra nos argumentos quando o agente aceita
    const template = agent
      ? { transport: 'acp' as const, agent: agent.id, ...acpCommand(agent, { ...input, prompt: '<prompt-da-execucao>' }) }
      : headlessCommand(profile, { ...input, prompt: '<prompt-da-execucao>', structured: true });
    const executable = resolveCommand(
      template.command,
      ('env' in template ? template.env?.PATH : undefined) ?? this.options.pathEnv(),
      this.options.homeDir,
      'lookup' in template ? template.lookup : undefined,
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
      // cwd nulo = vínculo de isolamento: a prova roda numa fixture e vale para qualquer pasta de projeto
      ...(cwd === null
        ? { scope: 'isolation' }
        : {
            cwd: fs.realpathSync(cwd),
            additionalDirectories: (input.addDirs ?? []).map((d) => fs.realpathSync(path.resolve(cwd, d))),
          }),
      environment: {
        ...process.env,
        ...(this.options.pathEnv() ? { PATH: this.options.pathEnv() } : {}),
        ...('env' in template ? template.env : {}),
      },
      environmentEvidence: environment,
    };
    return {
      executable: real,
      binding: createHash('sha256').update(canonical(context)).digest('hex'),
      environmentComplete: environment.state === 'complete' && /^[a-f0-9]{64}$/.test(environment.digest),
    };
  }
  /**
   * Vínculo das evidências de isolamento: identidade do executor, binário, flags de isolamento, ambiente e
   * políticas gerenciadas, sem pasta de projeto nem listas por execução (ferramentas, MCP, diretórios).
   * Os recibos são produzidos pelo verificador numa fixture com este mesmo vínculo.
   */
  isolationBinding(executor: AiExecutor, profileId: string, permission: RunnerPermission) {
    return this.binding(executor, profileId, isolationInput(permission), null);
  }
  /** Digest das políticas gerenciadas lidas pelo host; vazio quando a leitura não foi completa. */
  environmentDigest(): string {
    const e = this.options.environmentEvidence();
    return e.state === 'complete' ? e.digest : '';
  }
  /**
   * Só leitura para a prévia: mesma decisão pura e mesmas evidências locais, sem exigir as definições MCP
   * nem lançar. O vínculo é o de um comando sem MCP; com MCP ativo ele não coincide e a razão aparece.
   */
  preview(executor: AiExecutor, profileId: string, request: StrictExecutionRequest, _cwd: string): ExecutionAdmissionDecision {
    const now = this.options.now?.() ?? Date.now();
    const permission = 'board' as const;
    const profile = executorProfile(executor);
    const tool = profile.base;
    const transport = admissionTransport(profile);
    const preliminary = admitExecution(tool, permission, request, '', [], now, transport);
    try {
      if (preliminary.reasons.some((r) => r.code !== 'capability-not-verified')) return preliminary;
      const bound = this.isolationBinding(executor, profileId, permission);
      const decision = admitExecution(tool, permission, request, bound.binding, this.options.evidence.load(bound.binding), now, transport);
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
    const transport = admissionTransport(profile);
    const preliminary = admitExecution(tool, input.permission, request, '', [], this.options.now?.() ?? Date.now(), transport);
    if (preliminary.reasons.some((r) => r.code !== 'capability-not-verified')) throw new AdmissionBlockedError(preliminary);
    // O contexto da CLI fica fechado, mesmo sem MCP: nunca recorrer ao arquivo do usuário implicitamente.
    const source = JSON.parse(
      input.exec?.mcpConfig ?? (input.boardServer ? boardOnlyMcpConfig(input.boardServer) : '{"mcpServers":{}}'),
    ) as { mcpServers?: Record<string, unknown> };
    const names = request.mcpServers.filter((s) => preliminary.activeMcpIds.includes(s.artifactId)).map((s) => s.name);
    // no ACP o servidor do board é o canal por onde o card responde cada pedido de permissão: não é
    // uma ferramenta nativa (o agente não tem lista de allow), então entra sempre que a execução o traz
    if (preliminary.mcpTools.some((name) => name.startsWith('mcp__faz-ai__')) || (transport === 'acp' && source.mcpServers?.['faz-ai']))
      names.unshift('faz-ai');
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
        tools: preliminary.tools,
        deniedTools: preliminary.deniedTools,
        toolSet: 'explicit',
        mcpTools: preliminary.mcpTools,
        mcpAllowed: names.filter((n) => n !== 'faz-ai'),
        mcpConfig: JSON.stringify({ mcpServers: servers }),
      },
    });
    // o transporte ACP não tem descoberta nativa de agente: o agente já segue pelo pedido
    if (transport === 'acp') effective.exec!.agent = '';
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
    const isolation = this.isolationBinding(profile, profileId, input.permission);
    const decision = admitExecution(
      tool,
      input.permission,
      request,
      isolation.binding,
      this.options.evidence.load(isolation.binding),
      this.options.now?.() ?? Date.now(),
      transport,
    );
    if (!bound.environmentComplete) {
      decision.state = 'blocked';
      decision.reasons.push({ code: 'environment-not-verified' });
      decision.capabilities = decision.capabilities.map((c) =>
        c.capability === 'artifacts' ? { ...c, state: 'unknown', reason: 'incomplete' } : c,
      );
    }
    if (decision.state !== 'admitted') throw new AdmissionBlockedError(decision);
    const rebound = () => {
      if (this.binding(profile, profileId, effective, cwd).binding !== bound.binding)
        throw new Error('O executor ou o ambiente mudou após a admissão.');
    };
    return {
      input: effective,
      decision,
      transport,
      acpCommand: (command) => {
        if (transport !== 'acp') throw new Error('A admissão é de uma CLI de uma passada, não de um agente ACP.');
        rebound();
        const expected = acpCommand(admissionAgent(profile)!, effective);
        if (
          (command.command !== expected.command && command.command !== bound.executable) ||
          canonical(command.args) !== canonical(expected.args) ||
          canonical(command.env) !== canonical(undefined)
        )
          throw new Error('O comando do agente mudou após a admissão.');
        return { ...command, command: bound.executable };
      },
      command: (command) => {
        if (transport !== 'cli') throw new Error('A admissão é de um agente ACP, não de uma CLI de uma passada.');
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
