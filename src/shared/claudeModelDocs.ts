// Os modelos do Claude Code pela documentação oficial. A CLI não tem comando que liste os modelos e o board roda
// os apelidos (`fable`, `opus`, `sonnet`, `haiku`), que a própria CLI resolve; o nome de cada um, os níveis de
// esforço e a versão mínima da CLI estão na página de configuração de modelos, em Markdown. Puro: quem baixa a
// página é o host (`extension/ai/drivers/claude/models.ts`).
import { modelId, type ModelOption } from './models';

/** A página em Markdown (a mesma da documentação, com `.md`): lida no Conectar e no "Detectar modelos". */
export const CLAUDE_MODELS_DOC = 'https://code.claude.com/docs/en/model-config.md';

/** Os apelidos que o board oferece, na ordem do catálogo. */
const ALIASES = ['fable', 'opus', 'sonnet', 'haiku'] as const;
type Alias = (typeof ALIASES)[number];

const FAMILY = /\b(Fable|Opus|Sonnet|Haiku) (\d+(?:\.\d+)?)\b/;

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/**
 * Para onde cada apelido aponta na API da Anthropic, a linha que vale para a assinatura e para a chave da
 * Anthropic. A ordem das colunas sai do cabeçalho (`| Provider | \`opus\` | \`sonnet\` | \`haiku\` |`); o `fable`
 * sai da frase "the `fable` alias resolves to Fable 5.1".
 */
function resolvedNames(md: string): Partial<Record<Alias, string>> {
  const out: Partial<Record<Alias, string>> = {};
  const lines = md.split(/\r?\n/);
  const header = lines.findIndex((l) => /^\|\s*Provider\s*\|/.test(l) && /`haiku`/.test(l));
  const row = header >= 0 ? lines.slice(header).find((l) => /^\|\s*Anthropic API\s*\|/.test(l)) : undefined;
  if (row) {
    const names = cells(lines[header]!).map((c) => /`(\w+)`/.exec(c)?.[1]);
    cells(row).forEach((cell, i) => {
      const alias = names[i] as Alias | undefined;
      if (alias && ALIASES.includes(alias) && FAMILY.test(cell)) out[alias] = FAMILY.exec(cell)![0];
    });
  }
  const fable = /`fable` alias resolves to (Fable \d+(?:\.\d+)?)/.exec(md);
  if (fable) out.fable = fable[1]!;
  return out;
}

/** "Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 5, and Opus 4.7" → os nomes, um por modelo ("Fable 5.1 and Fable 5" também). */
function modelNames(list: string): string[] {
  return list
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((n) => n.trim())
    .filter((n) => FAMILY.test(n));
}

/** Os níveis de esforço de cada modelo, da tabela "| Model | Levels |"; um modelo fora dela não tem ajuste. */
function effortLevels(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const lines = md.split(/\r?\n/);
  const header = lines.findIndex((l) => /^\|\s*Model\s*\|\s*Levels\s*\|/.test(l));
  if (header < 0) return out;
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const [models, levels] = cells(line);
    const list = [...(levels ?? '').matchAll(/`(\w+)`/g)].map((m) => m[1]!);
    for (const name of modelNames(models ?? '')) if (list.length) out.set(name, list);
  }
  return out;
}

/**
 * O esforço padrão: "`high` on every model that supports effort, except that Opus 5.5, Sonnet 5.5, and Haiku 5.5
 * default to `medium`, Opus 4.7 defaults to `xhigh`". Devolve o geral e as exceções por modelo.
 */
function defaultEfforts(md: string): { general: string | null; except: Map<string, string> } {
  const except = new Map<string, string>();
  const sentence = /`(\w+)` on every model that supports effort, except that ([^\n]+)/.exec(md);
  if (!sentence) return { general: null, except };
  for (const m of sentence[2]!.matchAll(
    /((?:(?:Fable|Opus|Sonnet|Haiku) \d+(?:\.\d+)?(?:,\s*|\s+and\s+|,\s+and\s+)?)+)\s+defaults? to `(\w+)`/g,
  ))
    for (const name of modelNames(m[1]!)) except.set(name, m[2]!);
  return { general: sentence[1]!, except };
}

/** A versão mínima da CLI de cada modelo: "Sonnet 5.5 requires Claude Code v2.1.284", "Use v2.1.293 or later with Haiku 5.5". */
function minimumVersions(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of md.matchAll(/((?:Fable|Opus|Sonnet|Haiku) \d+(?:\.\d+)?) requires (?:Claude Code )?v(\d+\.\d+\.\d+)/g))
    out.set(m[1]!, m[2]!);
  for (const m of md.matchAll(/Use v(\d+\.\d+\.\d+) or later with ((?:Fable|Opus|Sonnet|Haiku) \d+(?:\.\d+)?)/g)) out.set(m[2]!, m[1]!);
  return out;
}

/**
 * Os modelos do Claude Code pela página da documentação: um por apelido que a página resolve, com o nome do modelo,
 * os níveis de esforço, o padrão e a versão mínima da CLI. Vazio quando a página mudou de forma e não dá para ler:
 * aí vale a lista embutida.
 */
export function parseClaudeModelDocs(md: string, readAt = Date.now()): ModelOption[] {
  const names = resolvedNames(md);
  const levels = effortLevels(md);
  const defaults = defaultEfforts(md);
  const versions = minimumVersions(md);
  const out: ModelOption[] = [];
  for (const alias of ALIASES) {
    const label = names[alias];
    if (!label) continue;
    const efforts = levels.get(label) ?? [];
    const fallback = defaults.general && efforts.includes(defaults.general) ? defaults.general : null;
    const requires = versions.get(label);
    out.push({
      id: modelId('claude', alias),
      tool: 'claude',
      model: alias,
      label,
      efforts,
      defaultEffort: efforts.length ? (defaults.except.get(label) ?? fallback) : null,
      fromTool: true,
      readAt,
      ...(requires ? { requires } : {}),
    });
  }
  return out;
}

/** Compara versões `x.y.z` (o resto da saída de `--version` é ignorado); null quando uma delas não se lê. */
export function olderThan(installed: string | null | undefined, required: string): boolean | null {
  const a = /(\d+)\.(\d+)\.(\d+)/.exec(installed ?? '');
  const b = /(\d+)\.(\d+)\.(\d+)/.exec(required);
  if (!a || !b) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(a[i]) - Number(b[i]);
    if (d) return d < 0;
  }
  return false;
}
