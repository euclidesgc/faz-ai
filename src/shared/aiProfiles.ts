import { AI_BASES } from './harness';
import { slug } from './git';
import { parseModelValue, type ModelOption } from './models';
import type { FieldValue } from './model';
import type { RunnerPermission } from './runner';
import type { CapabilityEvidence, CapabilityState, ExecutorCapability } from './executionAdmission';

export const ISOLATION_KINDS = ['instructions', 'skill', 'agent', 'hook', 'mcp'] as const;
export type IsolationKind = (typeof ISOLATION_KINDS)[number];
const ISOLATION_SCOPES = ['project', 'user'] as const;
/** Um tipo de artefato que a CLI carrega sozinha, e de onde (a pasta do projeto ou a conta da pessoa). */
export interface IsolationLeak {
  kind: IsolationKind;
  scope: (typeof ISOLATION_SCOPES)[number];
}
/**
 * `args` são os parâmetros que o board passa para a CLI não carregar artefatos; `loads`, o que ela ainda
 * carrega mesmo assim (lista de itens CONHECIDOS: vazia não prova ausência de artefatos externos, nem de
 * regras ancestrais/globais, memória, plugins, políticas gerenciadas e add-dir). `checked` é a leitura da
 * documentação oficial; evidência de isolamento só vem das capacidades verificadas pelo host.
 * `unrecognized` conta itens que não se entendeu: eles nunca viram "seguro" por descarte.
 */
export interface ProfileIsolation {
  args: string[];
  loads: IsolationLeak[];
  checked?: { date: string; version: string; sources: string[] };
  unrecognized?: number;
}
export type AiBase = 'claude' | 'cursor' | 'kimi';
export type ProviderBase = AiBase | 'generic';
/** `acp`: perfil pronto de um agente do catálogo ACP (#1095); como o `builtin`, não é editado nem apagado. */
export type AiProfileKind = 'builtin' | 'acp' | 'copy' | 'custom';
export type PromptVia = 'stdin' | 'arg';
export type BoardServerVia = 'cli' | 'project' | 'none';
export type ProfileCapability = ExecutorCapability | 'cancellation' | 'output';
export const PROFILE_CAPABILITIES: readonly ProfileCapability[] = [
  'conversation',
  'artifacts',
  'permissions',
  'mcp',
  'delegation',
  'cancellation',
  'output',
];
/** Evidência do host usa digests, nunca argumentos/variáveis que possam conter segredos. */
export interface ProfileEvidenceBinding {
  binaryHash: string;
  cliVersion: string;
  argsDigest: string;
  environmentDigest: string;
  configurationDigest: string;
}
export type ProfileCapabilityEvidence = Omit<CapabilityEvidence, 'capability'> & {
  capability: ProfileCapability;
  executor: ProfileEvidenceBinding;
};
/** Somente entrada humana e resolução privada no host. Não devolver configurações salvas ao cliente. */
export interface AiProfileConfig {
  command?: string;
  extraArgs?: string[];
  args?: string[];
  promptVia?: PromptVia;
  boardServer?: BoardServerVia;
  mcpProjectFile?: string;
  permissionArgs?: Partial<Record<RunnerPermission, string[]>>;
  env?: Record<string, string>;
  versionArgs?: string;
  statusArgs?: string;
  authPatterns?: string[];
  installUrl?: string;
  /** Id do agente no catálogo ACP (`acp/agents.ts`): com `base: 'generic'`, o perfil roda por ACP em vez de CLI one-shot. */
  acpAgent?: string;
  /** O que a CLI pode carregar por conta própria, declarado por quem configura. Não é evidência. */
  isolation?: { loads: IsolationLeak[] };
  [key: string]: unknown;
}
export interface AiProfile {
  id: string;
  name: string;
  enabled: boolean;
  kind: AiProfileKind;
  base: ProviderBase;
  /** Na leitura pública é sempre {}; valores são resolvidos somente pelo host. */
  config: AiProfileConfig;
  position: number;
  credentials?: { secretRef: string; review: 'pending' | 'reviewed'; available: boolean };
  /** Configuração, disponibilidade e revisão humana não comprovam capacidades. */
  capabilities?: Partial<Record<ProfileCapability, CapabilityState>>;
}
export type AiProfileDraft = Omit<AiProfile, 'id' | 'credentials' | 'capabilities'> & { id?: string };
/**
 * Os agentes do catálogo ACP (`extension/ai/acp/agents.ts`) que viram perfil pronto, com o id, o nome e a
 * página oficial de cada um (o teste confere com o catálogo). Fora: o Claude (segue pela CLI `claude`), o
 * Cursor e o Kimi Code (os ids são das CLIs prontas, que medem tokens; a entrada ACP deles fica para o
 * teste real da épica).
 */
export const ACP_READY_AGENTS: readonly { id: string; label: string; docs: string }[] = [
  { id: 'gemini', label: 'Gemini CLI', docs: 'https://geminicli.com/docs/cli/acp-mode' },
  { id: 'codex-acp', label: 'Codex', docs: 'https://github.com/agentclientprotocol/codex-acp' },
  { id: 'opencode', label: 'OpenCode', docs: 'https://opencode.ai/v2/docs/cli/acp/' },
  {
    id: 'github-copilot-cli',
    label: 'GitHub Copilot CLI',
    docs: 'https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/',
  },
  { id: 'qwen-code', label: 'Qwen Code', docs: 'https://qwenlm.github.io/qwen-code-docs/' },
  { id: 'goose', label: 'goose', docs: 'https://block.github.io/goose/docs/guides/acp-clients' },
  { id: 'antigravity-acp', label: 'Google Antigravity', docs: 'https://antigravity.google/docs/ide/extensions' },
];
/**
 * Os perfis do catálogo: as três CLIs prontas, ligadas, e os agentes ACP, desligados até a pessoa ligar
 * (a linha no banco nasce aí). Nenhum é editado ou apagado; o id é a ferramenta do catálogo de modelos.
 */
export const BUILTIN_PROFILES: readonly AiProfile[] = [
  ...AI_BASES.map((tool, position) =>
    Object.freeze({
      id: tool.id,
      name: tool.label,
      enabled: true,
      kind: 'builtin' as const,
      base: tool.id,
      config: Object.freeze({}),
      position,
    }),
  ),
  ...ACP_READY_AGENTS.map((agent, position) =>
    Object.freeze({
      id: agent.id,
      name: agent.label,
      enabled: false,
      kind: 'acp' as const,
      base: 'generic' as const,
      config: Object.freeze({ acpAgent: agent.id, installUrl: agent.docs }),
      position: AI_BASES.length + position,
    }),
  ),
];
/** Perfil do catálogo (CLI pronta ou agente ACP pronto): vem do código, não do formulário. */
export const isCatalogProfile = (profile: Pick<AiProfile, 'kind'>): boolean => profile.kind === 'builtin' || profile.kind === 'acp';
export const PROFILE_MARKERS = ['prompt', 'model', 'effort', 'mcpConfig', 'addDir'] as const;
export const unknownProfileCapabilities = (): Record<ProfileCapability, CapabilityState> =>
  Object.fromEntries(PROFILE_CAPABILITIES.map((c) => [c, 'unknown'])) as Record<ProfileCapability, CapabilityState>;
/** Perfil executado pelo transporte ACP (a CLI do agente fala o Agent Client Protocol), e não pela CLI one-shot. */
export const isAcpProfile = (profile: AiProfile): boolean => profile.base === 'generic' && typeof profile.config.acpAgent === 'string';
export const profileBase = (profile: AiProfile): AiBase | null => (profile.base === 'generic' ? null : profile.base);
/**
 * Perfil cujas capacidades o host sabe provar: a CLI do Claude (a pronta ou uma cópia, que roda o mesmo
 * binário com os próprios ajustes) e os agentes ACP. Cursor, Kimi e as CLIs personalizadas não têm sonda.
 */
export const verifiableProfile = (profile: AiProfile): boolean => profile.base === 'claude' || isAcpProfile(profile);
/**
 * Os perfis que a verificação oferece: ligados, revisados e verificáveis, com o padrão do board primeiro
 * (é o que a pessoa mais provavelmente quer verificar). O pendente de revisão não roda comando nenhum.
 */
export function verifiableProfiles(board: { aiTool: string; aiProfiles: readonly AiProfile[] }): AiProfile[] {
  return board.aiProfiles
    .filter((p) => p.enabled && p.credentials?.review !== 'pending' && verifiableProfile(p))
    .sort((a, b) => Number(b.id === board.aiTool) - Number(a.id === board.aiTool));
}
/** Compatibilidade do seletor legado. A admissão v1 resolve o alvo explícito sem este fallback. */
export function activeProfile(board: { aiTool: string; aiProfiles: readonly AiProfile[] }): AiProfile {
  return (
    board.aiProfiles.find((p) => p.id === board.aiTool && p.enabled) ??
    board.aiProfiles.find((p) => p.id === 'claude' && p.enabled) ??
    BUILTIN_PROFILES[0]!
  );
}
export const catalogTool = (profile: AiProfile): string => (profile.kind === 'copy' ? profile.base : profile.id);
export const profileLabel = (board: { aiProfiles: readonly AiProfile[] }, id: string): string =>
  board.aiProfiles.find((p) => p.id === id)?.name ?? id;
export function newProfileId(name: string, taken: readonly string[]): string {
  const base = slug(name, 32) || 'perfil';
  const reserved = new Set([...taken, ...BUILTIN_PROFILES.map((p) => p.id), 'generic']);
  if (!reserved.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`,
      candidate = base.slice(0, 32 - suffix.length).replace(/-+$/, '') + suffix;
    if (!reserved.has(candidate)) return candidate;
  }
}
export function validateProfile(p: AiProfileDraft): string[] {
  const errors: string[] = [];
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 240 || p.name.includes('\0')) errors.push('Nome do perfil inválido.');
  if (
    !['builtin', 'acp', 'copy', 'custom'].includes(p.kind) ||
    !['claude', 'cursor', 'kimi', 'generic'].includes(p.base) ||
    (p.kind === 'custom' || p.kind === 'acp') !== (p.base === 'generic')
  )
    errors.push('Tipo ou base do perfil inválido.');
  if (typeof p.enabled !== 'boolean' || !Number.isSafeInteger(p.position) || p.position < 0 || p.position > 1000000)
    errors.push('Posição ou estado do perfil inválido.');
  const c = p.config;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [...errors, 'Configuração do perfil inválida.'];
  // com `acpAgent` o comando é o do agente do catálogo; o id desconhecido é recusado pelo gateway
  if (c.acpAgent !== undefined && (typeof c.acpAgent !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(c.acpAgent)))
    errors.push('Agente ACP inválido.');
  if (p.kind === 'custom' && (typeof c.command !== 'string' || !c.command.trim()) && typeof c.acpAgent !== 'string')
    errors.push('Informe o comando do perfil personalizado.');
  if (p.kind === 'acp' && typeof c.acpAgent !== 'string') errors.push('Agente ACP inválido.');
  if (c.boardServer === 'project' && (typeof c.mcpProjectFile !== 'string' || !c.mcpProjectFile.trim()))
    errors.push('Informe o arquivo MCP do projeto.');
  const string = (v: unknown) => typeof v === 'string' && !v.includes('\0') && v.length <= 100000;
  const lines = (v: unknown) => Array.isArray(v) && v.length <= 1000 && v.every(string);
  for (const key of ['command', 'mcpProjectFile', 'versionArgs', 'statusArgs', 'installUrl'])
    if (c[key] !== undefined && !string(c[key])) errors.push('Configuração do perfil inválida.');
  for (const key of ['args', 'extraArgs', 'authPatterns'])
    if (c[key] !== undefined && !lines(c[key])) errors.push('Configuração do perfil inválida.');
  if (c.promptVia !== undefined && !['stdin', 'arg'].includes(c.promptVia)) errors.push('Configuração do perfil inválida.');
  if (c.boardServer !== undefined && !['cli', 'project', 'none'].includes(c.boardServer)) errors.push('Configuração do perfil inválida.');
  if (
    c.env !== undefined &&
    (!c.env ||
      typeof c.env !== 'object' ||
      Array.isArray(c.env) ||
      Object.entries(c.env).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || !string(v)))
  )
    errors.push('Configuração do perfil inválida.');
  if (
    c.isolation !== undefined &&
    (!c.isolation || typeof c.isolation !== 'object' || Array.isArray(c.isolation) || parseLoads(c.isolation.loads).unrecognized)
  )
    errors.push('Isolamento do perfil inválido.');
  if (
    c.permissionArgs !== undefined &&
    (!c.permissionArgs ||
      typeof c.permissionArgs !== 'object' ||
      Array.isArray(c.permissionArgs) ||
      Object.entries(c.permissionArgs).some(([k, v]) => !['board', 'edits', 'full'].includes(k) || !lines(v)))
  )
    errors.push('Configuração do perfil inválida.');
  return [...new Set(errors)];
}
export function expandArgLines(
  lines: readonly string[],
  values: Partial<Record<(typeof PROFILE_MARKERS)[number], string | string[]>>,
): string[] {
  return lines.flatMap((line) => {
    const markers = PROFILE_MARKERS.filter((m) => line.includes(`{${m}}`));
    if (markers.some((m) => values[m] === undefined || values[m] === '' || (Array.isArray(values[m]) && !values[m]!.length))) return [];
    const dirs = markers.includes('addDir') ? (Array.isArray(values.addDir) ? values.addDir : [values.addDir as string]) : [''];
    return dirs.flatMap((dir) =>
      line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((arg) =>
          arg.replace(/\{(prompt|model|effort|mcpConfig|addDir)\}/g, (_, m: (typeof PROFILE_MARKERS)[number]) =>
            m === 'addDir' ? dir : String(values[m]),
          ),
        ),
    );
  });
}
export function toolInfo(profile: AiProfile): Omit<(typeof AI_BASES)[number], 'id'> & { id: string } {
  const base = AI_BASES.find((tool) => tool.id === profileBase(profile));
  return base
    ? { ...base, id: profile.id, label: profile.name }
    : { id: profile.id, label: profile.name, rules: '', skills: '', mcp: '', mcpUser: '', agents: { dir: '', ext: '.md' } };
}
export function resolveModelOption(
  board: { aiTool: string; aiProfiles: readonly AiProfile[]; modelCatalog: readonly ModelOption[] },
  value: FieldValue | undefined,
): { option: ModelOption | null; name: string; effort: string | null } | null {
  const parsed = parseModelValue(value);
  if (!parsed) return null;
  const profile = activeProfile(board),
    tool = catalogTool(profile);
  const option = board.modelCatalog.find((m) => m.id === parsed.id && m.tool === tool);
  if (option)
    return parsed.effort && !option.efforts.includes(parsed.effort) ? null : { option, name: option.model, effort: parsed.effort };
  if (profile.kind !== 'custom' || !parsed.id.startsWith(`${profile.id}:`)) return null;
  const name = parsed.id.slice(profile.id.length + 1);
  return name && !/[\s\0:@]/.test(name) && (!parsed.effort || !/[\s\0:@]/.test(parsed.effort))
    ? { option: null, name, effort: parsed.effort }
    : null;
}

const leak = (kind: IsolationKind, scope: IsolationLeak['scope']): IsolationLeak => ({ kind, scope });
const both = (kind: IsolationKind): IsolationLeak[] => [leak(kind, 'project'), leak(kind, 'user')];
/**
 * Isolamento dos perfis prontos. Documentação oficial lida em 2026-10-16 (Claude Code 2.1.296, Cursor CLI
 * 2026.10.01, Kimi Code CLI 2.1.1); relida em 2026-10-20 para Claude Code (cli-reference: `--setting-sources`
 * user|project|local, `--disable-slash-commands`, `--strict-mcp-config`; `--bare` e `--safe-mode` são
 * outros mecanismos e não substituem estes; política gerenciada continua valendo) e Cursor (a CLI lê
 * `.cursor/rules`, AGENTS.md, CLAUDE.md e o mcp.json). Nenhuma flag de Cursor ou Kimi desliga o que
 * carregam; o que a lista não cobre (ancestrais, memória, plugins, política gerenciada, add-dir) segue
 * desconhecido até o host verificar.
 */
export const BUILTIN_ISOLATION: Record<AiBase, ProfileIsolation> = {
  claude: {
    args: ['--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config'],
    loads: [],
    checked: {
      date: '2026-10-16',
      version: 'Claude Code 2.1.296',
      sources: ['https://code.claude.com/docs/en/cli-reference', 'https://code.claude.com/docs/en/settings'],
    },
  },
  cursor: {
    args: [],
    loads: [leak('instructions', 'project'), ...both('skill'), ...both('agent'), ...both('hook'), ...both('mcp')],
    checked: { date: '2026-10-16', version: 'Cursor CLI 2026.10.01', sources: ['https://cursor.com/docs/cli/using'] },
  },
  kimi: {
    args: [],
    loads: [...both('instructions'), ...both('skill'), ...both('agent'), ...both('mcp'), leak('hook', 'user')],
    checked: {
      date: '2026-10-16',
      version: 'Kimi Code CLI 2.1.1',
      sources: ['https://moonshotai.github.io/kimi-cli/en/customization/skills.html'],
    },
  },
};

const isLeak = (v: unknown): v is IsolationLeak => {
  const l = v as Partial<IsolationLeak> | null;
  return (
    !!l &&
    typeof l === 'object' &&
    ISOLATION_KINDS.includes(l.kind as IsolationKind) &&
    ISOLATION_SCOPES.includes(l.scope as IsolationLeak['scope'])
  );
};
/** Lê a lista gravada; o que não for reconhecido é contado (não vira "seguro" por descarte) e sem repetição. */
export function parseLoads(raw: unknown): { loads: IsolationLeak[]; unrecognized: number } {
  const items = Array.isArray(raw) ? raw : [];
  const loads: IsolationLeak[] = [];
  let unrecognized = Array.isArray(raw) ? 0 : 1;
  for (const item of items) {
    if (!isLeak(item)) unrecognized++;
    else if (!loads.some((l) => l.kind === item.kind && l.scope === item.scope)) loads.push({ kind: item.kind, scope: item.scope });
  }
  return { loads, unrecognized };
}
/**
 * O isolamento declarado do perfil. Pronto: o do código. Cópia: o gravado ou, na falta, o da base (só como
 * declaração herdada: a cópia não herda a garantia, ver `contextEnforced`). Personalizado: o gravado ou
 * lista vazia (= nenhum item conhecido, nunca prova).
 */
export function profileIsolation(p: AiProfile): ProfileIsolation {
  const base = p.base === 'generic' ? null : BUILTIN_ISOLATION[p.base];
  if (p.kind === 'builtin' && base) return structuredClone(base);
  const own = p.config.isolation;
  const { loads, unrecognized } =
    own === undefined ? { loads: structuredClone(base?.loads ?? []), unrecognized: 0 } : parseLoads(own?.loads);
  const out: ProfileIsolation = { args: p.kind === 'copy' && base ? [...base.args] : [], loads };
  if (unrecognized) out.unrecognized = unrecognized;
  if (own === undefined && p.kind === 'copy' && base?.checked) out.checked = base.checked;
  return out;
}
/**
 * Contexto vazio imposto: só com as capacidades de conversa nova e de artefatos VERIFICADAS pelo host para
 * este perfil e sem item conhecido ou não reconhecido carregado. `loads` vazio sozinho não basta, e a
 * declaração manual (perfil personalizado, cópia alterada) nunca é lida como prova.
 */
export function contextEnforced(p: AiProfile): boolean {
  const iso = profileIsolation(p);
  return p.capabilities?.conversation === 'verified' && p.capabilities.artifacts === 'verified' && !iso.loads.length && !iso.unrecognized;
}
const KIND_LABEL: Record<IsolationKind, [string, string]> = {
  instructions: ['regras do projeto', 'regras do usuário'],
  skill: ['skills do projeto', 'skills do usuário'],
  agent: ['agentes do projeto', 'agentes do usuário'],
  hook: ['hooks do projeto', 'hooks do usuário'],
  mcp: ['servidores MCP do projeto', 'servidores MCP do usuário'],
};
export const leakLabel = (l: IsolationLeak): string => KIND_LABEL[l.kind][l.scope === 'project' ? 0 : 1];
export function isolationSummary(iso: ProfileIsolation): string {
  const parts = iso.loads.map(leakLabel);
  if (iso.unrecognized) parts.push('itens não reconhecidos');
  // lista vazia é "nenhum item conhecido", não prova de contexto vazio (a prova são as capacidades verificadas)
  return parts.length
    ? `A CLI pode carregar por conta própria: ${parts.join(', ')}.`
    : 'Nenhum item conhecido carregado (sem prova de isolamento)';
}
