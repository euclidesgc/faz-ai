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
import { isAcpProfile, isReadyCli } from '../../shared/aiProfiles';
import { resolveCommand } from '../cliResolve';
import { acpAgent } from './acp/agents';
import { acpCommand, acpSessionMode, type AcpAgent } from './acp/provider';
import { executorOf, type ApiInvocation, type Executor } from './drivers';
import { headlessCommand, tmpArg, type HeadlessCommand, type HeadlessInput } from '../headless';
import { boardOnlyMcpConfig } from '../execution';
import { canonical, CapabilityEvidenceStore } from './capabilityEvidence';
import { INHERITED_SESSION_ENV } from '../spawn';

type ExecModel = NonNullable<HeadlessInput['exec']>['model'];
/** O transporte na mensagem de um validador chamado pelo transporte errado. */
const TRANSPORT_OF: Record<ExecutionTransport, string> = {
  cli: 'de uma CLI de uma passada',
  acp: 'de um agente ACP',
  api: 'do modo API',
};

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
  /** quem executa o perfil; o registro dos drivers por padrão (o teste troca, enquanto não há driver da API) */
  executorOf?(profile: AiProfile): Executor;
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
/**
 * O transporte que o perfil roda de fato: a mesma regra de `executorOf` (o transporte do executor), sem
 * lançar pelo agente desconhecido, porque a prévia e o Diagnóstico leem o transporte antes de montar o
 * vínculo (e é o vínculo que recusa o agente). O modo API vem do modo declarado: não há outro sinal no
 * perfil, e `isAcpProfile` nunca diz ACP para ele.
 */
export const admissionTransport = (profile: AiProfile): ExecutionTransport =>
  profile.mode === 'api' ? 'api' : isAcpProfile(profile) ? 'acp' : 'cli';
function digestFile(file: string): { digest: string; stat: fs.Stats } {
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
    return { digest: hash.digest('hex'), stat: after };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * As variáveis que o verificador neutraliza na fixture do Claude (provedor, chave, pasta de configuração,
 * pré-carga do Node): na execução real elas mudam o que a CLI carrega ou com quem ela fala.
 */
export const VERIFIER_OBSERVED_ENV = /^(ANTHROPIC_|CLAUDE_|AWS_|GOOGLE_|AZURE_|NODE_OPTIONS$|NODE_PATH$)/;
/**
 * Além das observadas, o que muda o comportamento da ferramenta sem passar pela linha de comando: o PATH,
 * as pastas da pessoa (configuração, dados, estado, cache; as do Windows), a rede (proxy e certificados),
 * a carga de bibliotecas nativas e as do Gemini (a ferramenta da épica). O resto do ambiente não muda o
 * isolamento.
 */
const RELEVANT_ENV =
  /^(PATH|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|XDG_(CONFIG|DATA|STATE|CACHE)_HOME|(HTTPS?|ALL|NO)_PROXY|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|SSL_CERT_(FILE|DIR)|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_[A-Z0-9_]+|GEMINI_[A-Z0-9_]*)$/;
/**
 * As `CLAUDE_CODE_*` que mudam o que a CLI faz (provedor, tráfego, memória dos diretórios adicionais,
 * shell). As demais são da sessão do Claude Code que abriu o editor (porta do SSE, caminho do
 * executável, ponto de entrada, ids) e mudam a cada sessão: ficam fora, senão a prova cairia a cada
 * reinício.
 */
const CLAUDE_CODE_BEHAVIOR =
  /^CLAUDE_CODE_(USE_BEDROCK|USE_VERTEX|USE_FOUNDRY|SKIP_BEDROCK_AUTH|SKIP_VERTEX_AUTH|SKIP_FOUNDRY_AUTH|DISABLE_NONESSENTIAL_TRAFFIC|ADDITIONAL_DIRECTORIES_CLAUDE_MD|MAX_OUTPUT_TOKENS|SHELL|SHELL_PREFIX|GIT_BASH_PATH|API_KEY_HELPER_TTL_MS|CLIENT_CERT|CLIENT_KEY|DISABLE_AUTO_MEMORY|SUBAGENT_MODEL)$/;
/**
 * Nome de variável que costuma guardar credencial: entra no vínculo só a presença, nunca o valor (nem
 * digest). Chave e token de sessão giram (`AWS_SESSION_TOKEN`, o token do login) sem mudar o isolamento,
 * e o vínculo não precisa do segredo para nada.
 */
const SENSITIVE_ENV = /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE/;

/**
 * O ambiente que entra no vínculo: o mesmo que a execução recebe (o do host, o PATH do shell e as
 * variáveis do comando, sem as da sessão do Claude Code que o spawn tira), filtrado às variáveis que
 * mudam o que a ferramenta carrega: o PATH e as pastas de configuração, as que o verificador observa e
 * as do próprio perfil. Uma variável volátil (terminal, sessão do editor, socket) não muda o vínculo,
 * então a prova sobrevive ao reinício do editor. De variável sensível entra só a presença: o vínculo só
 * é gravado como hash, e nem em memória a credencial entra nele.
 */
export function bindingEnvironment(
  base: NodeJS.ProcessEnv,
  pathEnv: string | undefined,
  own: Record<string, string> | undefined,
): Record<string, string> {
  const env: NodeJS.ProcessEnv = { ...base, ...(pathEnv ? { PATH: pathEnv } : {}), ...own };
  for (const name of INHERITED_SESSION_ENV) delete env[name];
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    // no Windows o ambiente não distingue maiúsculas: `Path` é o PATH
    const upper = name.toUpperCase();
    const ownVar = !!own && name in own;
    if (!ownVar && upper.startsWith('CLAUDE_CODE_') && !CLAUDE_CODE_BEHAVIOR.test(upper)) continue;
    if (!ownVar && !RELEVANT_ENV.test(upper) && !VERIFIER_OBSERVED_ENV.test(upper)) continue;
    out[name] = SENSITIVE_ENV.test(upper) ? '<definida>' : value;
  }
  return out;
}

/**
 * Entrada canônica do vínculo de isolamento: as flags de isolamento não dependem do conteúdo por execução.
 * O modelo só entra no modo API, em que a prova é de um modelo (o vínculo da CLI e do ACP é sem ele).
 */
export function isolationInput(permission: RunnerPermission, model: ExecModel = null): HeadlessInput {
  return {
    prompt: '',
    permission,
    structured: true,
    exec: {
      agent: '',
      agentDefinition: null,
      mcpBlocked: [],
      model,
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
  /**
   * Digest do binário por caminho real, guardado com o tamanho, o mtime e o inode lidos: a CLI tem centenas
   * de MB e o vínculo é calculado na prévia, em cada execução e a cada conferência do Diagnóstico (que
   * repete a cada 10 s enquanto falta login). Trocar o binário (atualização, reinstalação) muda pelo menos
   * um dos três e força a releitura.
   */
  private readonly digests = new Map<string, { size: number; mtimeMs: number; ino: number; digest: string }>();
  constructor(private readonly options: AdmissionOptions) {}
  private binaryDigest(file: string): string {
    const st = fs.statSync(file);
    const cached = this.digests.get(file);
    if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs && cached.ino === st.ino) return cached.digest;
    // a chave guardada é a do arquivo que foi de fato lido (o `digestFile` recusa o que mudou durante a leitura)
    const { digest, stat } = digestFile(file);
    this.digests.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, digest });
    return digest;
  }
  binding(
    executor: AiExecutor,
    profileId: string,
    input: HeadlessInput,
    cwd: string | null,
  ): { binding: string; executable: string; environmentComplete: boolean } {
    const profile = executorProfile(executor);
    // a parte da ferramenta (o que a linha de comando fixa e qual executável) vem do driver; o resto do
    // contexto é o mesmo para toda ferramenta e fica aqui, onde é canonizado e vira o hash
    const driver = (this.options.executorOf ?? executorOf)(profile);
    const tool = driver.bindingContext({ ...input, prompt: '<prompt-da-execucao>' }, { profile, cwd });
    // o modo API não tem executável: o vínculo é outro formato, e um driver que mistura os dois é recusado
    if ('api' in tool !== (driver.transport === 'api')) throw new Error('Vínculo do executor incoerente com o transporte.');
    if ('api' in tool) return this.apiBinding(profile, profileId, tool.api, input, cwd);
    const executable = resolveCommand(tool.command, tool.pathEnv ?? this.options.pathEnv(), this.options.homeDir, tool.lookup);
    if (!executable) throw new Error('Executor indisponível para admissão.');
    const real = fs.realpathSync(executable);
    const environment = this.options.environmentEvidence();
    const context = {
      // 2: sem a permissão e com o ambiente filtrado; toda prova gravada no formato 1 perde a validade
      version: 2,
      providerRevision: 1,
      platform: process.platform,
      arch: process.arch,
      hostRuntime: process.versions.node,
      profileId,
      tool: profile.base,
      ...(!isReadyCli(profile) ? { profileConfig: profile.config } : {}),
      executable: real,
      binary: this.binaryDigest(real),
      // a permissão não entra por si: no modo estrito a invocação do Claude é a mesma nos três níveis
      // (o conjunto exato de ferramentas é a execução que fixa, no vínculo dela) e no ACP o comando não
      // a carrega; onde ela muda a linha de comando (perfil personalizado), entra pela invocação
      invocation: tool.invocation,
      // cwd nulo = vínculo de isolamento: a prova roda numa fixture e vale para qualquer pasta de projeto
      ...(cwd === null
        ? { scope: 'isolation' }
        : {
            cwd: fs.realpathSync(cwd),
            additionalDirectories: (input.addDirs ?? []).map((d) => fs.realpathSync(path.resolve(cwd, d))),
          }),
      environment: bindingEnvironment(process.env, this.options.pathEnv(), tool.env),
      environmentEvidence: environment,
    };
    return {
      executable: real,
      binding: createHash('sha256').update(canonical(context)).digest('hex'),
      environmentComplete: environment.state === 'complete' && /^[a-f0-9]{64}$/.test(environment.digest),
    };
  }
  /**
   * O vínculo do modo API: o que o driver devolve (endpoint, modelo, versão da extensão e digest da chave)
   * com a identidade do host, do perfil e da pasta. Fica fora o que só existe com um processo da
   * ferramenta: executável, binário, ambiente e políticas gerenciadas (não há ferramenta que leia
   * configuração, arquivo de contexto ou variável; quem fala com a rede e executa cada chamada é o código
   * da extensão, preso pela versão). Fica fora também a configuração do perfil, onde a chave mora no
   * cofre: dela só o digest entra, pelo driver. Sem políticas a conferir, o ambiente é completo por
   * construção. `executable` vazio: os validadores de comando recusam o modo API.
   */
  private apiBinding(
    profile: AiProfile,
    profileId: string,
    api: ApiInvocation,
    input: HeadlessInput,
    cwd: string | null,
  ): { binding: string; executable: string; environmentComplete: boolean } {
    if (
      api.transport !== 'api' ||
      ![api.endpoint, api.model, api.extensionVersion].every((v) => typeof v === 'string' && v) ||
      !/^[a-f0-9]{64}$/.test(api.keyDigest)
    )
      throw new Error('Vínculo do modo API incompleto.');
    const context = {
      version: 2,
      transport: 'api',
      providerRevision: 1,
      platform: process.platform,
      arch: process.arch,
      hostRuntime: process.versions.node,
      profileId,
      tool: profile.tool,
      invocation: {
        transport: 'api',
        endpoint: api.endpoint,
        model: api.model,
        extensionVersion: api.extensionVersion,
        keyDigest: api.keyDigest,
      },
      ...(cwd === null
        ? { scope: 'isolation' }
        : {
            cwd: fs.realpathSync(cwd),
            additionalDirectories: (input.addDirs ?? []).map((d) => fs.realpathSync(path.resolve(cwd, d))),
          }),
    };
    return { executable: '', binding: createHash('sha256').update(canonical(context)).digest('hex'), environmentComplete: true };
  }
  /**
   * Vínculo das evidências de isolamento: identidade do executor, binário, flags de isolamento, ambiente e
   * políticas gerenciadas, sem pasta de projeto nem listas por execução (ferramentas, MCP, diretórios).
   * Os recibos são produzidos pelo verificador numa fixture com este mesmo vínculo. A permissão não muda o
   * vínculo (ver `binding`): a prova feita em `board` vale para `edits` e `full`. O modelo só é passado
   * no modo API, onde a prova é de um modelo; na CLI e no ACP o vínculo continua sem ele.
   */
  isolationBinding(executor: AiExecutor, profileId: string, permission: RunnerPermission, model: ExecModel = null) {
    return this.binding(executor, profileId, isolationInput(permission, model), null);
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
    // o ACP e o modo API não têm descoberta nativa de agente: o agente já segue pelo pedido
    if (transport !== 'cli') effective.exec!.agent = '';
    // defesa: a execução admitida roda no modo padrão do agente, em que o board decide cada pedido; o
    // modo sem perguntas desligaria as negações do card e não é o modo que a prova cobriu
    if (transport === 'acp' && acpSessionMode(admissionAgent(profile)!, effective))
      throw new Error('O modo sem perguntas do agente ACP não é admitido: o board precisa decidir cada pedido.');
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
    // no modo API a prova é do modelo da execução; na CLI e no ACP o vínculo de isolamento é sem modelo
    const isolation = this.isolationBinding(
      profile,
      profileId,
      input.permission,
      transport === 'api' ? (effective.exec?.model ?? null) : null,
    );
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
        if (transport !== 'acp') throw new Error(`A admissão é ${TRANSPORT_OF[transport]}, não de um agente ACP.`);
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
        if (transport !== 'cli') throw new Error(`A admissão é ${TRANSPORT_OF[transport]}, não de uma CLI de uma passada.`);
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
