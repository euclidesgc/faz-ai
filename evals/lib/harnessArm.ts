// O Harness de cada braço do piloto de contexto mínimo: o fixture versionado em `evals/harness/<A|B>/` e o
// carregador que o põe no board temporário de uma história, só por mensagens do router (o mesmo caminho da
// pessoa na tela do Harness). Nada daqui toca `src/`.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';
import { artifactLocation, type ArtifactKind, type BoardArtifact } from '../../src/shared/artifacts';
import { usageOptions, type HarnessUsage, type SelectableKind } from '../../src/shared/harnessSelection';
import type { McpServerInput } from '../../src/shared/harnessCatalog';

export type Arm = 'A' | 'B';
export const ARMS: readonly Arm[] = ['A', 'B'];

/** "agent:condutor-do-board", "skill:react-forms", "rule:CLAUDE.md", "mcp:code-review-graph" */
export type ItemKey = `${'agent' | 'skill' | 'rule' | 'mcp'}:${string}`;

export interface ArmManifest {
  arm: Arm;
  description: string;
  /** o modo de cada item do fixture; o que não consta aqui não existe no braço */
  items: Record<ItemKey, HarnessUsage>;
  /** o que o braço não mede (texto livre, vai para o placar) */
  notMeasured: string[];
}

export interface ArmInfo {
  arm: Arm;
  hash: string;
  items: number;
  notMeasured: string[];
}

/** O agente padrão do board: precisa estar no fixture e ligado (o board recusa desligá-lo). */
const DEFAULT_AGENT = 'condutor-do-board';
const ITEM_KEY = /^(agent|skill|rule|mcp):(.+)$/;
const KIND_OF: Record<string, ArtifactKind> = { agent: 'agent', skill: 'skill', rule: 'rule', mcp: 'mcp' };
const SELECTABLE_OF: Record<ArtifactKind, SelectableKind> = { agent: 'agent', skill: 'skill', rule: 'instructions', mcp: 'mcp' };

/** A raiz do repositório: o código roda de `evals/lib/` (teste) ou de `evals/.build/` (bundle), duas pastas acima. */
const repoRoot = (): string => path.resolve(__dirname, '..', '..');

export function parseArm(value: string | undefined): Arm | null {
  if (value === undefined) return null;
  if ((ARMS as readonly string[]).includes(value)) return value as Arm;
  throw new Error(`Valor inválido para --arm: "${value}". Use A ou B.`);
}

export const armDir = (arm: Arm): string => path.join(repoRoot(), 'evals', 'harness', arm);

/** Os arquivos do fixture (caminho relativo com `/`), em ordem; o lixo do sistema de arquivos não conta. */
function fixtureFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name !== '.DS_Store') out.push(path.relative(dir, file).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

type McpEntry = Record<string, unknown>;

/** Os servidores do `.mcp.json` do fixture, ou {} quando ele não existe. */
function readMcpFile(dir: string): Record<string, McpEntry> {
  const file = path.join(dir, '.mcp.json');
  if (!fs.existsSync(file)) return {};
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`.mcp.json do fixture não é JSON válido: ${(e as Error).message}`);
  }
  const servers = (json as { mcpServers?: unknown } | null)?.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('.mcp.json do fixture não tem "mcpServers".');
  return servers as Record<string, McpEntry>;
}

/** Os modos que o tipo aceita no fixture; a regra "Pelo card" é recusada em vez de ser normalizada em silêncio. */
function modesOf(kind: ArtifactKind): HarnessUsage[] {
  const modes = usageOptions(SELECTABLE_OF[kind]);
  return kind === 'rule' ? modes.filter((m) => m !== 'contextual') : modes;
}

/** O item de cada arquivo do fixture; `null` quando o caminho não pertence a nenhum item (arquivo fora do formato). */
function itemOfFile(file: string): ItemKey | null | 'arm' | 'mcp-file' {
  if (file === 'arm.json') return 'arm';
  if (file === '.mcp.json') return 'mcp-file';
  const parts = file.split('/');
  if (parts[0] === 'agents' && parts.length === 2 && parts[1]!.endsWith('.md')) return `agent:${parts[1]!.slice(0, -3)}`;
  if (parts[0] === 'rules' && parts.length === 2) return `rule:${parts[1]}`;
  if (parts[0] === 'skills' && parts.length >= 3) return `skill:${parts[1]}`;
  return null;
}

export function readManifest(dir: string): ArmManifest {
  const file = path.join(dir, 'arm.json');
  if (!fs.existsSync(file)) throw new Error(`Falta o arm.json em ${dir}.`);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`arm.json não é JSON válido: ${(e as Error).message}`);
  }
  const json = raw as Partial<Record<keyof ArmManifest, unknown>> | null;
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('arm.json precisa ser um objeto.');
  const folder = path.basename(dir);
  if (json.arm !== folder) throw new Error(`arm.json declara o braço ${JSON.stringify(json.arm)}, mas a pasta é ${folder}.`);
  if (typeof json.description !== 'string') throw new Error('arm.json: "description" precisa ser texto.');
  if (!Array.isArray(json.notMeasured) || json.notMeasured.some((n) => typeof n !== 'string'))
    throw new Error('arm.json: "notMeasured" precisa ser uma lista de textos.');
  if (!json.items || typeof json.items !== 'object' || Array.isArray(json.items))
    throw new Error('arm.json: "items" precisa ser um objeto.');

  const items = json.items as Record<string, unknown>;
  const problems: string[] = [];
  for (const [key, mode] of Object.entries(items)) {
    const match = ITEM_KEY.exec(key);
    if (!match) {
      problems.push(`chave inválida "${key}" (use agent:, skill:, rule: ou mcp:)`);
      continue;
    }
    const kind = KIND_OF[match[1]!]!;
    const allowed = modesOf(kind);
    if (typeof mode !== 'string' || !allowed.includes(mode as HarnessUsage))
      problems.push(`modo ${JSON.stringify(mode)} inválido para ${key} (aceitos: ${allowed.join(', ')})`);
  }
  if (problems.length) throw new Error(`arm.json inválido: ${problems.join('; ')}.`);

  const defaultMode = items[`agent:${DEFAULT_AGENT}`];
  if (defaultMode === undefined) throw new Error(`O agente padrão ${DEFAULT_AGENT} precisa estar no arm.json.`);
  if (defaultMode === 'off') throw new Error(`O agente padrão ${DEFAULT_AGENT} não pode ficar off.`);

  // nada oculto: cada item tem o arquivo, e cada arquivo tem o item
  const mcp = readMcpFile(dir);
  const present = new Set<string>(Object.keys(mcp).map((n) => `mcp:${n}`));
  const stray: string[] = [];
  for (const rel of fixtureFiles(dir)) {
    const owner = itemOfFile(rel);
    if (owner === 'arm' || owner === 'mcp-file') continue;
    if (owner === null) stray.push(rel);
    else present.add(owner);
  }
  const missing = Object.keys(items).filter((k) => !present.has(k));
  if (missing.length) throw new Error(`Itens do arm.json sem arquivo no fixture: ${missing.join(', ')}.`);
  const undeclared = [...present].filter((k) => !(k in items));
  if (undeclared.length) throw new Error(`Arquivos do fixture fora do arm.json: ${undeclared.join(', ')}.`);
  if (stray.length) throw new Error(`Arquivos do fixture fora do formato (agents/, skills/, rules/, .mcp.json): ${stray.join(', ')}.`);

  return {
    arm: json.arm as Arm,
    description: json.description,
    items: items as Record<ItemKey, HarnessUsage>,
    notMeasured: json.notMeasured as string[],
  };
}

/** sha256 de (caminho relativo + conteúdo) de cada arquivo, em ordem: prova com que Harness a rodada foi feita. */
export function fixtureHash(dir: string): string {
  const hash = createHash('sha256');
  for (const rel of fixtureFiles(dir)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

type Run = (cmd: string, args: string[]) => { status: number | null };
const defaultRun: Run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'ignore' });
  return { status: result.error ? null : result.status };
};

/** O `code-review-graph` dos dois braços roda por `uvx`: sem ele a rodada mediria um braço sem o servidor. */
export function checkUvx(run: Run = defaultRun): void {
  if (run('uvx', ['--version']).status !== 0)
    throw new Error(
      'uvx não encontrado. Instale com "pipx install uv" ou "brew install uv" (https://docs.astral.sh/uv/) e rode de novo; o servidor code-review-graph dos dois braços roda por uvx.',
    );
}

/** O servidor do `.mcp.json` no formato que a tela do Harness grava; o `cwd` não vai (o servidor roda na pasta do projeto temporário). */
function serverOf(name: string, entry: McpEntry): McpServerInput {
  const strings = (v: unknown): Record<string, string> =>
    Object.fromEntries(Object.entries((v as Record<string, unknown> | undefined) ?? {}).map(([k, x]) => [k, String(x)]));
  if (typeof entry.url === 'string')
    return { name, transport: 'http', command: '', args: [], env: {}, url: entry.url, headers: strings(entry.headers) };
  if (typeof entry.command !== 'string') throw new Error(`.mcp.json: o servidor ${name} não tem command nem url.`);
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  return { name, transport: 'stdio', command: entry.command, args, env: strings(entry.env), url: '', headers: {} };
}

const keyOf = (a: Pick<BoardArtifact, 'kind' | 'name'>): ItemKey => `${a.kind}:${a.name}` as ItemKey;

/**
 * Põe o Harness do braço no board do `router`, em seis passos (a Spec da #1360): lê a pasta, importa tudo menos
 * o MCP (sobrescrevendo os de fábrica que o fixture também traz), grava o MCP como revisado, desliga os agentes
 * de fábrica que o fixture não traz, marca o modo de cada item e confere que o board ficou igual ao manifesto.
 */
export function loadArm(router: MessageRouter, arm: Arm, dir: string = armDir(arm)): ArmInfo {
  const manifest = readManifest(dir);
  const hash = fixtureHash(dir);
  const library = () => router.snapshot().harness.library;
  const artifacts = (): BoardArtifact[] => library()?.artifacts ?? [];

  // 1 e 2: a pasta inteira, menos o MCP (importado pela pasta ele entra "pendente" e a execução o ignora)
  router.handle({ type: 'harness.library.scan', dir });
  const keys = (library()?.preview?.items ?? []).filter((i) => i.kind !== 'mcp').map((i) => i.key);
  if (keys.length) {
    router.handle({ type: 'harness.library.apply', keys });
    // o condutor e os agentes de fábrica que o fixture também traz voltam em `skipped`: só assim o importador os troca
    const skipped = (library()?.importResult?.skipped ?? []).map((i) => i.key);
    if (skipped.length) router.handle({ type: 'harness.library.apply', keys: skipped, overwrite: true });
  }

  // 3: o MCP pelo caminho da pessoa (sem `via: 'ai'`): entra revisado
  for (const [name, entry] of Object.entries(readMcpFile(dir)))
    router.handle({ type: 'harness.artifact.save', kind: 'mcp', name, server: serverOf(name, entry) });

  // 4: agente que ficou no board sem constar no fixture não entra em nada; nenhum é apagado
  const leftovers = artifacts()
    .filter((a) => a.kind === 'agent' && a.usage !== 'off' && !(keyOf(a) in manifest.items))
    .map((a) => ({ kind: 'agent' as const, location: artifactLocation(a) }));
  if (leftovers.length) router.handle({ type: 'harness.selection.set', items: leftovers, usage: 'off' });

  // 5: o modo de cada item, agrupado por modo; a location sai do snapshot, nunca é montada à mão
  const byMode = new Map<HarnessUsage, { kind: SelectableKind; location: string }[]>();
  for (const [key, mode] of Object.entries(manifest.items) as [ItemKey, HarnessUsage][]) {
    const found = artifacts().find((a) => keyOf(a) === key);
    if (!found) continue; // a conferência do passo 6 acusa o que faltou
    const group = byMode.get(mode) ?? [];
    group.push({ kind: SELECTABLE_OF[found.kind], location: artifactLocation(found) });
    byMode.set(mode, group);
  }
  for (const [usage, items] of byMode) router.handle({ type: 'harness.selection.set', items, usage });

  // 6: o board é exatamente o fixture (a skill do fluxo é da extensão e os agentes `off` de fábrica são esperados)
  const actual = new Map<ItemKey, HarnessUsage>();
  for (const a of artifacts()) {
    if (a.generated) continue;
    if (a.kind === 'agent' && a.usage === 'off' && !(keyOf(a) in manifest.items)) continue;
    actual.set(keyOf(a), a.usage);
  }
  const diffs: string[] = [];
  for (const [key, mode] of Object.entries(manifest.items) as [ItemKey, HarnessUsage][]) {
    const got = actual.get(key);
    if (got === undefined) diffs.push(`${key}: falta no board`);
    else if (got !== mode) diffs.push(`${key}: modo ${got} no board, ${mode} no fixture`);
  }
  for (const key of actual.keys()) if (!(key in manifest.items)) diffs.push(`${key}: sobra no board`);
  const mcp = artifacts().filter((a) => a.kind === 'mcp');
  for (const a of mcp) if (a.mcpCredential?.review !== 'reviewed') diffs.push(`${keyOf(a)}: servidor MCP não revisado`);
  if (diffs.length) throw new Error(`O board não ficou igual ao braço ${arm}: ${diffs.join('; ')}.`);

  return { arm, hash, items: Object.keys(manifest.items).length, notMeasured: manifest.notMeasured };
}
