import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import { EFFORT_LEVELS, modelId, modelValue, type ModelOption } from '../shared/models';

type Seed = [model: string, label: string, efforts: string[], defaultEffort: string | null];

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Modelos conhecidos de cada ferramenta, conforme a documentação delas quando isto foi escrito.
 * É só o ponto de partida: o catálogo é editável no board e, quando a ferramenta informa a lista
 * (o Cursor), `discoverModels` usa a lista real.
 */
const BUILTIN: Record<AiTool, Seed[]> = {
  claude: [
    ['fable', 'Fable 5.1', CLAUDE_EFFORTS, 'high'],
    ['opus', 'Opus 5.5', CLAUDE_EFFORTS, 'medium'],
    ['sonnet', 'Sonnet 5.5', CLAUDE_EFFORTS, 'medium'],
    ['haiku', 'Haiku 4.5', [], null],
  ],
  // ids conferidos em `cursor-agent models` (2026-10-05); a lista real da conta vem desse comando
  cursor: [
    ['auto', 'Auto', [], null],
    ['composer-2.5', 'Composer 2.5', [], null],
  ],
};

/** Modelo sugerido por nível de esforço da tarefa (Baixo, Médio, Alto), como [modelo, esforço]. */
const TIERS: Record<AiTool, [string, string | null][]> = {
  claude: [
    ['haiku', null],
    ['sonnet', 'medium'],
    ['opus', 'high'],
  ],
  // o Auto é o único modelo que todo plano do Cursor aceita (no gratuito, qualquer outro é recusado
  // antes de começar): fica nos três níveis, e quem tem plano pago troca as regras
  cursor: [
    ['auto', null],
    ['auto', null],
    ['auto', null],
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

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const FAST = '-fast';

/**
 * Se o modelo é a versão rápida de outro do mesmo catálogo (`composer-2.5-fast` de `composer-2.5`).
 * No Cursor ela responde mais rápido e cobra mais pelos mesmos tokens.
 */
export function isFastVariant(o: ModelOption, catalog: ModelOption[]): boolean {
  return o.model.endsWith(FAST) && catalog.some((x) => x.id === fastBaseId(o));
}

/** O id do modelo de que esta é a versão rápida (`cursor:x-fast` → `cursor:x`). */
export function fastBaseId(o: ModelOption): string {
  return modelId(o.tool, o.model.endsWith(FAST) ? o.model.slice(0, -FAST.length) : o.model);
}

/** Níveis que a lista do Cursor põe no fim do id, do menor para o maior. */
const CURSOR_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'extra-high', 'max'];
const CURSOR_EFFORT_SUFFIX = new RegExp(`^(.+?)-(${[...CURSOR_EFFORTS].sort((a, b) => b.length - a.length).join('|')})$`);
/** As palavras do nível no nome de exibição: a variante sem nenhuma delas é o nível padrão do modelo. */
const EFFORT_WORDS = /\b(none|minimal|low|medium|high|extra high|max)\b/i;

/**
 * Lê a saída de `cursor-agent models`: depois de "Available models", uma linha por modelo no formato
 * `id - Nome de exibição (current, default)`, e no fim uma dica que não é modelo.
 *
 * A lista real tem uma linha por variante (cerca de 250): o nível de esforço vem como sufixo do id
 * (`claude-opus-5-5-low`, `-medium`, `-high`…) e muitas têm também a versão rápida, com `-fast` no
 * fim (`claude-opus-5-5-high-fast`). O catálogo junta as variantes num modelo com os níveis dele,
 * para o campo Modelo dos cards não virar uma lista de centenas de itens; as rápidas viram um modelo
 * à parte (`claude-opus-5-5-fast`), com preço próprio, e só entram no catálogo com a regra
 * `includeFastModels` (ver `isFastVariant`). O nível padrão é a variante cujo nome não cita nível
 * ("Claude Opus 5.5 1M" é a `-medium`).
 */
export function parseCursorModels(text: string): ModelOption[] {
  const lines = text.replace(ANSI, '').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === 'Available models');
  if (start < 0) return [];
  const rows: { id: string; label: string }[] = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^tip:/i.test(line)) break;
    const m = /^(\S+)(?:\s+-\s+(.+?))?(?:\s+\((?:current|default)(?:,\s*(?:current|default))*\))?$/.exec(line);
    // os nomes trazem espaços de largura zero e espaços duplos
    if (m)
      rows.push({
        id: m[1]!,
        label: (m[2] ?? m[1]!)
          .replace(/[\u200b-\u200d\ufeff]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      });
  }
  const ids = new Set(rows.map((r) => r.id));
  // um id com variantes próprias (`x-max` ao lado de `x-max-high`) é um modelo, não o nível "max" de `x`
  const hasVariants = (stem: string) => rows.some((r) => r.id.startsWith(`${stem}-`) && r.id !== `${stem}${FAST}`);
  const effortOf = (stem: string) => (hasVariants(stem) ? null : CURSOR_EFFORT_SUFFIX.exec(stem));
  const baseOf = (stem: string) => effortOf(stem)?.[1] ?? stem;
  const plainBases = new Set(rows.filter((r) => !r.id.endsWith(FAST)).map((r) => baseOf(r.id)));
  const groups = new Map<string, { plain?: string; variants: { effort: string; label: string }[] }>();
  for (const { id, label } of rows) {
    // a variante rápida de algo que existe sem o `-fast` (no mesmo nível, ou o mesmo modelo em outro
    // nível): o nível fica antes do sufixo
    const cut = id.slice(0, -FAST.length);
    const fast = id.endsWith(FAST) && (ids.has(cut) || plainBases.has(baseOf(cut)));
    const stem = fast ? cut : id;
    const m = effortOf(stem);
    const base = (m ? m[1]! : stem) + (fast ? FAST : '');
    const group = groups.get(base) ?? { variants: [] };
    if (m) group.variants.push({ effort: m[2]!, label });
    else group.plain = label;
    groups.set(base, group);
  }
  return [...groups].map(([base, g]) => {
    const efforts = g.variants.map((v) => v.effort).sort((a, b) => CURSOR_EFFORTS.indexOf(a) - CURSOR_EFFORTS.indexOf(b));
    // com variante "pura" (sem sufixo), o padrão é ela; sem, a que não cita nível no nome
    const unnamed = g.variants.find((v) => !EFFORT_WORDS.test(v.label));
    const def =
      g.plain !== undefined || !efforts.length ? null : (unnamed?.effort ?? (efforts.includes('medium') ? 'medium' : efforts[0]!));
    const label = g.plain ?? unnamed?.label ?? g.variants[0]!.label.replace(EFFORT_WORDS, '').replace(/\s+/g, ' ').trim();
    return { ...option('cursor', [base, label, efforts, def]), fromTool: true as const };
  });
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

/** Modelos lidos da ferramenta: do último comando de listagem (Cursor). */
export function discoverModels(tool: AiTool): ModelOption[] {
  return fromCli.get(tool) ?? [];
}

/** Modelos que já fizeram parte da lista embutida: um catálogo vindo de versão anterior ainda os tem. */
const RETIRED: Partial<Record<AiTool, string[]>> = { cursor: ['grok-4.7'] };

/** Se o catálogo da ferramenta ainda é só a lista embutida (nunca recebeu a lista real nem um modelo à mão). */
export function onlyBuiltin(tool: AiTool, catalog: ModelOption[]): boolean {
  const builtin = new Set([...BUILTIN[tool].map(([model]) => model), ...(RETIRED[tool] ?? [])].map((model) => modelId(tool, model)));
  return catalog.filter((o) => o.tool === tool).every((o) => builtin.has(o.id) && !o.fromTool);
}

/** Catálogo de uma ferramenta: a lista real quando dá para ler, senão a lista embutida. */
export function modelsFor(tool: AiTool): ModelOption[] {
  const found = discoverModels(tool);
  return found.length ? found : BUILTIN[tool].map((s) => option(tool, s));
}

/** Ferramentas com sinal de instalação nesta máquina (pasta de configuração na home). */
export function detectTools(homeDir: string): AiTool[] {
  if (!homeDir) return [];
  const dirs: Record<AiTool, string[]> = {
    claude: ['.claude'],
    cursor: ['.cursor'],
  };
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
    const e = first.efforts.length
      ? first.efforts[Math.min(first.efforts.length - 1, Math.round((i * (first.efforts.length - 1)) / 2))]!
      : null;
    return [level, modelValue(first.id, e)];
  });
}
