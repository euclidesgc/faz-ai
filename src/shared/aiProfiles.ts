import { AI_BASES } from './harness';
import { slug } from './git';
import { parseModelValue, type ModelOption } from './models';
import type { FieldValue } from './model';
import type { RunnerPermission } from './runner';
import type { CapabilityEvidence, CapabilityState, ExecutorCapability } from './executionAdmission';

export type AiBase = 'claude' | 'cursor' | 'kimi';
export type ProviderBase = AiBase | 'generic';
export type AiProfileKind = 'builtin' | 'copy' | 'custom';
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
export const BUILTIN_PROFILES: readonly AiProfile[] = AI_BASES.map((tool, position) =>
  Object.freeze({
    id: tool.id,
    name: tool.label,
    enabled: true,
    kind: 'builtin' as const,
    base: tool.id,
    config: Object.freeze({}),
    position,
  }),
);
export const PROFILE_MARKERS = ['prompt', 'model', 'effort', 'mcpConfig', 'addDir'] as const;
export const unknownProfileCapabilities = (): Record<ProfileCapability, CapabilityState> =>
  Object.fromEntries(PROFILE_CAPABILITIES.map((c) => [c, 'unknown'])) as Record<ProfileCapability, CapabilityState>;
export const profileBase = (profile: AiProfile): AiBase | null => (profile.base === 'generic' ? null : profile.base);
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
  const reserved = new Set([...taken, 'claude', 'cursor', 'kimi', 'generic']);
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
    !['builtin', 'copy', 'custom'].includes(p.kind) ||
    !['claude', 'cursor', 'kimi', 'generic'].includes(p.base) ||
    (p.kind === 'custom') !== (p.base === 'generic')
  )
    errors.push('Tipo ou base do perfil inválido.');
  if (typeof p.enabled !== 'boolean' || !Number.isSafeInteger(p.position) || p.position < 0 || p.position > 1000000)
    errors.push('Posição ou estado do perfil inválido.');
  const c = p.config;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [...errors, 'Configuração do perfil inválida.'];
  if (p.kind === 'custom' && (typeof c.command !== 'string' || !c.command.trim()))
    errors.push('Informe o comando do perfil personalizado.');
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
  return name && !/[\s\0:@]/.test(name) ? { option: null, name, effort: parsed.effort } : null;
}
