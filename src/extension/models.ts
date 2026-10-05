import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import { EFFORT_LEVELS, modelId, modelValue, type ModelOption } from '../shared/models';

type Seed = [model: string, label: string, efforts: string[], defaultEffort: string | null];

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['light', 'medium', 'high', 'xhigh', 'max', 'ultra'];
// níveis comuns ao seletor do VS Code e à Copilot CLI
const COPILOT_EFFORTS = ['low', 'medium', 'high'];

/**
 * Modelos conhecidos de cada ferramenta, conforme a documentação delas quando isto foi escrito.
 * É só o ponto de partida: o catálogo é editável no board e, quando a ferramenta guarda a lista em
 * um arquivo local (Kimi), `discoverModels` usa a lista real.
 */
const BUILTIN: Record<AiTool, Seed[]> = {
  claude: [
    ['fable', 'Fable 5.1', CLAUDE_EFFORTS, 'high'],
    ['opus', 'Opus 5.5', CLAUDE_EFFORTS, 'medium'],
    ['sonnet', 'Sonnet 5.5', CLAUDE_EFFORTS, 'medium'],
    ['haiku', 'Haiku 4.5', [], null],
  ],
  codex: [
    ['gpt-6.1-sol', 'GPT-6.1 Sol', CODEX_EFFORTS, 'medium'],
    ['gpt-6-astra', 'Astra', CODEX_EFFORTS, 'medium'],
    ['gpt-6-luna', 'GPT-6 Luna', CODEX_EFFORTS.filter((e) => e !== 'ultra'), 'light'],
  ],
  // só os ids conferidos no código da CLI 2026.10.01; a lista real da conta vem de `cursor-agent models`
  cursor: [
    ['auto', 'Auto', [], null],
    ['composer-2.5', 'Composer 2.5', [], null],
    ['composer-2.5-fast', 'Composer 2.5 Fast', [], null],
  ],
  kimi: [
    ['kimi-code/k3', 'K3', ['low', 'high', 'max'], 'high'],
    ['kimi-code/kimi-for-coding', 'Kimi for Coding', ['low', 'high', 'max'], 'high'],
  ],
  copilot: [
    ['gpt-5.6-luna', 'GPT-5.6 Luna', COPILOT_EFFORTS, 'medium'],
    ['gpt-5.6-terra', 'GPT-5.6 Terra', COPILOT_EFFORTS, 'medium'],
    ['gpt-5.6-sol', 'GPT-5.6 Sol', COPILOT_EFFORTS, 'medium'],
    ['gpt-5-mini', 'GPT-5 mini', COPILOT_EFFORTS, 'medium'],
    ['claude-haiku-4.5', 'Claude Haiku 4.5', [], null],
    ['claude-sonnet-5.5', 'Claude Sonnet 5.5', COPILOT_EFFORTS, 'medium'],
    ['claude-opus-5.5', 'Claude Opus 5.5', COPILOT_EFFORTS, 'medium'],
    ['claude-fable-5.1', 'Claude Fable 5.1', COPILOT_EFFORTS, 'medium'],
    ['gemini-3.8-flash', 'Gemini 3.8 Flash', [], null],
  ],
};

/** Modelo sugerido por nível de esforço da tarefa (Baixo, Médio, Alto), como [modelo, esforço]. */
const TIERS: Record<AiTool, [string, string | null][]> = {
  claude: [
    ['haiku', null],
    ['sonnet', 'medium'],
    ['opus', 'high'],
  ],
  codex: [
    ['gpt-6-luna', 'light'],
    ['gpt-6.1-sol', 'medium'],
    ['gpt-6-astra', 'high'],
  ],
  cursor: [
    ['composer-2.5-fast', null],
    ['auto', null],
    ['composer-2.5', null],
  ],
  kimi: [
    ['kimi-code/k3', 'low'],
    ['kimi-code/k3', 'high'],
    ['kimi-code/k3', 'max'],
  ],
  copilot: [
    ['gpt-5.6-luna', 'low'],
    ['gpt-5.6-terra', 'medium'],
    ['gpt-5.6-sol', 'high'],
  ],
};

const option = (tool: AiTool, [model, label, efforts, defaultEffort]: Seed): ModelOption => ({
  id: modelId(tool, model),
  tool,
  model,
  label,
  efforts,
  defaultEffort,
});

/** Lê as tabelas `[models."nome"]` do config.toml do Kimi, com display_name, support_efforts e default_effort. */
export function parseKimiModels(toml: string): ModelOption[] {
  const out: ModelOption[] = [];
  let current: { name: string; label?: string; efforts: string[]; def: string | null } | null = null;
  const flush = () => {
    if (current) out.push(option('kimi', [current.name, current.label ?? current.name, current.efforts, current.def]));
    current = null;
  };
  for (const line of toml.split(/\r?\n/)) {
    const table = /^\s*\[(.+)\]\s*$/.exec(line);
    if (table) {
      flush();
      const m = /^models\.(?:"([^"]+)"|([\w-]+))$/.exec(table[1]!.trim());
      if (m) current = { name: (m[1] ?? m[2])!, efforts: [], def: null };
      continue;
    }
    if (!current) continue;
    const kv = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!kv) continue;
    const str = (v: string) => /^"(.*)"$/.exec(v)?.[1];
    if (kv[1] === 'display_name') current.label = str(kv[2]!) ?? current.label;
    if (kv[1] === 'default_effort') current.def = str(kv[2]!) ?? null;
    if (kv[1] === 'support_efforts') current.efforts = [...kv[2]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  }
  flush();
  return out;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Lê a saída de `cursor-agent models`: depois de "Available models", uma linha por modelo no formato
 * `id - Nome de exibição (current, default)`, e no fim uma dica que não é modelo. O esforço vai
 * dentro do id (`modelo[effort=high]`) e a lista não diz quais modelos o aceitam: os modelos entram
 * sem níveis, e quem souber os acrescenta no catálogo.
 */
export function parseCursorModels(text: string): ModelOption[] {
  const lines = text.replace(ANSI, '').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === 'Available models');
  if (start < 0) return [];
  const out: ModelOption[] = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^tip:/i.test(line)) break;
    const m = /^(\S+)(?:\s+-\s+(.+?))?(?:\s+\((?:current|default)(?:,\s*(?:current|default))*\))?$/.exec(line);
    if (m) out.push(option('cursor', [m[1]!, m[2]?.trim() || m[1]!, [], null]));
  }
  return out;
}

/** Listas lidas da própria ferramenta por um comando (o Cursor), guardadas para o próximo "Detectar". */
const fromCli = new Map<AiTool, ModelOption[]>();

/** Guarda a lista que a ferramenta informou; uma lista vazia não apaga a anterior. */
export function rememberModels(tool: AiTool, found: ModelOption[]): void {
  if (found.length) fromCli.set(tool, found);
}

/** Esquece a lista lida da ferramenta (a CLI saiu da conta, ou nos testes). */
export function forgetModels(tool: AiTool): void {
  fromCli.delete(tool);
}

/** Modelos lidos da ferramenta: do arquivo local (Kimi) ou do último comando de listagem (Cursor). */
export function discoverModels(tool: AiTool, homeDir: string): ModelOption[] {
  if (tool !== 'kimi') return fromCli.get(tool) ?? [];
  if (!homeDir) return [];
  for (const dir of ['.kimi-code', '.kimi']) {
    const file = path.join(homeDir, dir, 'config.toml');
    try {
      const found = parseKimiModels(fs.readFileSync(file, 'utf8'));
      if (found.length) return found;
    } catch {
      /* sem configuração nesta pasta */
    }
  }
  return [];
}

/** Se o catálogo da ferramenta ainda é só a lista embutida (nunca recebeu a lista real nem um modelo à mão). */
export function onlyBuiltin(tool: AiTool, catalog: ModelOption[]): boolean {
  const builtin = new Set(BUILTIN[tool].map(([model]) => modelId(tool, model)));
  return catalog.filter((o) => o.tool === tool).every((o) => builtin.has(o.id));
}

/** Catálogo de uma ferramenta: a lista real quando dá para ler, senão a lista embutida. */
export function modelsFor(tool: AiTool, homeDir: string): ModelOption[] {
  const found = discoverModels(tool, homeDir);
  return found.length ? found : BUILTIN[tool].map((s) => option(tool, s));
}

/** Ferramentas com sinal de instalação nesta máquina (pasta de configuração na home). */
export function detectTools(homeDir: string): AiTool[] {
  if (!homeDir) return [];
  const dirs: Record<AiTool, string[]> = {
    claude: ['.claude'],
    codex: ['.codex'],
    cursor: ['.cursor'],
    kimi: ['.kimi-code', '.kimi'],
    copilot: ['.copilot'],
  };
  return (Object.keys(dirs) as AiTool[]).filter(
    (t) => dirs[t].some((d) => fs.existsSync(path.join(homeDir, d))) || (t === 'copilot' && hasCopilotExtension(homeDir)),
  );
}

/** O Copilot no VS Code é uma extensão; a pasta ~/.copilot só existe para quem usa a Copilot CLI. */
function hasCopilotExtension(homeDir: string): boolean {
  return ['.vscode', '.vscode-insiders'].some((d) => {
    try {
      return fs.readdirSync(path.join(homeDir, d, 'extensions')).some((e) => e.startsWith('github.copilot-chat-'));
    } catch {
      return false;
    }
  });
}

/**
 * Regras "esforço da tarefa → modelo" para uma ferramenta, escolhendo no catálogo dela um modelo
 * leve, um intermediário e um forte. Devolve pares [nível de esforço, valor do campo modelo].
 */
export function effortTiers(tool: AiTool, catalog: ModelOption[]): [string, string][] {
  const mine = catalog.filter((o) => o.tool === tool);
  if (!mine.length) return [];
  return EFFORT_LEVELS.map((level, i): [string, string] => {
    const [model, effort] = TIERS[tool][i]!;
    const o = mine.find((x) => x.model === model);
    if (o) return [level, modelValue(o.id, effort && o.efforts.includes(effort) ? effort : o.defaultEffort)];
    // o modelo embutido não existe no catálogo real: usa o primeiro modelo, variando o esforço quando houver
    const first = mine[0]!;
    const e = first.efforts.length
      ? first.efforts[Math.min(first.efforts.length - 1, Math.round((i * (first.efforts.length - 1)) / 2))]!
      : null;
    return [level, modelValue(first.id, e)];
  });
}
