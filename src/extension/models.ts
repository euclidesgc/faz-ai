import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import { EFFORT_LEVELS, modelId, modelValue, type ModelOption } from '../shared/models';

type Seed = [model: string, label: string, efforts: string[], defaultEffort: string | null];

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const CODEX_EFFORTS = ['light', 'medium', 'high', 'xhigh', 'max', 'ultra'];

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
  cursor: [
    ['auto', 'Auto', [], null],
    ['composer-2.5', 'Composer 2.5', [], null],
    ['grok-4.7', 'Grok 4.7', [], null],
  ],
  kimi: [
    ['kimi-code/k3', 'K3', ['low', 'high', 'max'], 'high'],
    ['kimi-code/kimi-for-coding', 'Kimi for Coding', ['low', 'high', 'max'], 'high'],
  ],
};

/** Modelo sugerido por nível de esforço da tarefa (Baixo, Médio, Alto), como [modelo, esforço]. */
const TIERS: Record<AiTool, [string, string | null][]> = {
  claude: [['haiku', null], ['sonnet', 'medium'], ['opus', 'high']],
  codex: [['gpt-6-luna', 'light'], ['gpt-6.1-sol', 'medium'], ['gpt-6-astra', 'high']],
  cursor: [['auto', null], ['composer-2.5', null], ['composer-2.5', null]],
  kimi: [['kimi-code/k3', 'low'], ['kimi-code/k3', 'high'], ['kimi-code/k3', 'max']],
};

const option = (tool: AiTool, [model, label, efforts, defaultEffort]: Seed): ModelOption => ({ id: modelId(tool, model), tool, model, label, efforts, defaultEffort });

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

/** Modelos lidos da configuração local da ferramenta, quando ela guarda a lista em arquivo. */
export function discoverModels(tool: AiTool, homeDir: string): ModelOption[] {
  if (tool !== 'kimi') return [];
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

/** Catálogo de uma ferramenta: a lista real quando dá para ler, senão a lista embutida. */
export function modelsFor(tool: AiTool, homeDir: string): ModelOption[] {
  const found = discoverModels(tool, homeDir);
  return found.length ? found : BUILTIN[tool].map((s) => option(tool, s));
}

/** Ferramentas com sinal de instalação nesta máquina (pasta de configuração na home). */
export function detectTools(homeDir: string): AiTool[] {
  const dirs: Record<AiTool, string[]> = { claude: ['.claude'], codex: ['.codex'], cursor: ['.cursor'], kimi: ['.kimi-code', '.kimi'] };
  return (Object.keys(dirs) as AiTool[]).filter((t) => dirs[t].some((d) => fs.existsSync(path.join(homeDir, d))));
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
    const e = first.efforts.length ? first.efforts[Math.min(first.efforts.length - 1, Math.round((i * (first.efforts.length - 1)) / 2))]! : null;
    return [level, modelValue(first.id, e)];
  });
}
