// O contexto do card: o que um agente carrega sozinho além do que o board entrega, descoberto e verificado em
// tempo de execução, sem lista de locais mantida na extensão. O agente declara onde a ferramenta dele lê
// (descoberta); o board confere rodando o agente como roda um card, pedindo que ele cite linhas desses arquivos
// (verificação). O veredito sai só da verificação: o que o agente declara é o padrão da ferramenta, e as travas do
// board podem impedir que ele aconteça. Puro: sem disco nem processo (o host lê os arquivos e roda o agente).

export type ContextLocationScope = 'project' | 'user';
export type ContextLocationKind = 'instructions' | 'rules' | 'memory' | 'skill' | 'agent' | 'hook' | 'mcp' | 'settings';
export type ContextLoads = 'always' | 'on-demand';
/** quem apontou o local: o agente na descoberta, a pessoa na tela ou o board, que confere os arquivos de instrução do projeto */
export type ContextLocationSource = 'agent' | 'person' | 'project';

export const CONTEXT_KINDS: readonly ContextLocationKind[] = [
  'instructions',
  'rules',
  'memory',
  'skill',
  'agent',
  'hook',
  'mcp',
  'settings',
];
/** os tipos que entram no contexto como texto: os únicos que a citação de uma linha consegue conferir */
export const TEXT_KINDS: readonly ContextLocationKind[] = ['instructions', 'rules', 'memory', 'skill', 'agent'];

export interface ContextLocation {
  /** relativo à raiz do projeto, ou começando por `~/` na pasta do usuário; pode ter `*` e `**` */
  path: string;
  scope: ContextLocationScope;
  kind: ContextLocationKind;
  /** o padrão da ferramenta, como o agente declarou; null quando não foi o agente quem apontou */
  loads: ContextLoads | null;
  source: ContextLocationSource;
}

/** Por que um local ficou sem veredito. */
export type UntestedReason =
  /** configuração, hook ou MCP: não entra no contexto como texto, a citação não confere */
  | 'not-text'
  /** o caminho tem um trecho que o board não sabe resolver (`<projeto>`) */
  | 'pattern'
  /** não existe na sua pasta pessoal; o board não escreve nela para testar */
  | 'missing-user'
  /** o arquivo existe, mas não tem uma linha boa para citar (curto, binário ou grande demais) */
  | 'no-line'
  /** o agente não citou nem a linha de controle: a resposta não serve de prova */
  | 'control-failed'
  /** o agente usou ferramentas durante o teste: ele pode ter aberto o arquivo de propósito */
  | 'used-tools'
  /** a execução do teste falhou */
  | 'run-failed';

export type LocationVerdict =
  /** rodando pelo board, nada do arquivo chegou ao modelo: ele só entra se o card o incluir */
  | { state: 'controlled'; how: 'quote' | 'canary' }
  /** rodando pelo board, o arquivo chegou ao modelo */
  /**
   * `tokens`: a estimativa do que cada arquivo de `files` põe no contexto de todo card (ausente nos testes antigos);
   * `refs`: o arquivo já é só a referência que o board deixou ao importar ou juntar
   */
  | { state: 'leaks'; how: 'quote' | 'canary'; files: string[]; tokens?: number[]; refs?: boolean[] }
  | { state: 'untested'; reason: UntestedReason };

export interface ContextLocationResult extends ContextLocation {
  verdict: LocationVerdict;
}

export interface ContextScopeReport {
  profileId: string;
  /** a versão do agente no teste: outra versão pede um teste novo */
  version: string | null;
  at: number;
  /** o agente respondeu à descoberta com uma lista que o board conseguiu ler */
  discovered: boolean;
  /** o agente citou a linha de controle: sem isso, nenhum "controlado" vale */
  control: boolean;
  locations: ContextLocationResult[];
  /** a frase do erro quando o teste não chegou ao fim */
  error?: string;
  /** modo API: não há programa que leia arquivos, o board monta cada pedido; fechado sem teste e sem gasto */
  byConstruction?: true;
  /** os arquivos que vazam e repetem linhas um do outro (só os de texto que existem) */
  overlaps?: ContextOverlap[];
}

/**
 * Dois arquivos que entram sozinhos com linhas em comum. `bInA` é a fração das linhas de `b` que estão em `a`: com
 * 1, trocar `b` por uma referência a `a` não perde nada (o "Juntar" só aparece aí).
 */
export interface ContextOverlap {
  a: string;
  b: string;
  aInB: number;
  bInA: number;
}

export type ContextScopeState = 'closed' | 'open' | 'unverified';

/** No modo API quem fala com o modelo é a extensão: nada é lido sozinho, então não há o que descobrir nem testar. */
export const closedByConstruction = (profile: { mode: string }): boolean => profile.mode === 'api';

/**
 * Fechado: o controle passou, ao menos um local foi conferido e nenhum vaza. Aberto: algum local vaza (vale mesmo
 * sem o controle, porque citar a linha certa é prova). O resto é não verificado.
 */
export function contextScopeState(r: ContextScopeReport | null | undefined): ContextScopeState {
  if (!r) return 'unverified';
  if (r.byConstruction) return 'closed';
  if (r.locations.some((l) => l.verdict.state === 'leaks')) return 'open';
  return r.control && r.locations.some((l) => l.verdict.state === 'controlled') ? 'closed' : 'unverified';
}

// ---------- descoberta ----------

/** O pedido de descoberta. O exemplo é de uma ferramenta fictícia: com nomes reais, o agente tende a copiá-los. */
export function discoveryPrompt(): string {
  return [
    'Teste do contexto (Faz AI). Você é um agente de programação rodando por uma ferramenta nesta máquina. Liste os arquivos e pastas que a SUA ferramenta carrega sozinha no contexto, sem alguém pedir: instruções, regras, memória, skills, agentes ou subagentes, hooks, configurações e servidores MCP, do projeto e da pasta do usuário. Baseie-se no que você sabe da sua própria ferramenta. Não use ferramentas.',
    '',
    'Responda SÓ com um JSON, sem texto em volta, neste formato. O exemplo é de uma ferramenta fictícia "Foo": NÃO copie os nomes dele.',
    '{"tool": "Foo CLI", "locations": [',
    '  {"path": "FOO.md", "scope": "project", "kind": "instructions", "loads": "always"},',
    '  {"path": ".foo/rules/*.md", "scope": "project", "kind": "rules", "loads": "always"},',
    '  {"path": "~/.foo/FOO.md", "scope": "user", "kind": "instructions", "loads": "always"},',
    '  {"path": "~/.foo/skills/*/SKILL.md", "scope": "user", "kind": "skill", "loads": "on-demand"},',
    '  {"path": ".foo/mcp.json", "scope": "project", "kind": "mcp", "loads": "always"}',
    ']}',
    '"scope": "project" (relativo à raiz do projeto) ou "user" (começando por ~/). "kind": instructions, rules, memory, skill, agent, hook, mcp ou settings. "loads": always (entra em toda conversa) ou on-demand (só quando o pedido combina). Se não souber, responda {"tool": "?", "locations": []}.',
  ].join('\n');
}

const MAX_LOCATIONS = 60;

/** Os objetos JSON do texto, do primeiro `{` que fecha um objeto válido; a resposta pode vir com raciocínio em volta. */
function jsonObjects(text: string): unknown[] {
  const s = text.slice(0, 40_000);
  const out: unknown[] = [];
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    for (let j = s.lastIndexOf('}'); j > i; j = s.lastIndexOf('}', j - 1)) {
      try {
        out.push(JSON.parse(s.slice(i, j + 1)));
        break;
      } catch {
        // tenta o próximo fechamento
      }
    }
  }
  return out;
}

/**
 * O caminho como o agente escreveu, limpo: sem crase, sem a nota entre parênteses ("settings.json (hooks)") e sem
 * barra no começo de um caminho do projeto. Vazio quando não sobra caminho.
 */
export function normalizeLocationPath(raw: string): string {
  let p = raw
    .trim()
    .replace(/^`+|`+$/g, '')
    .trim();
  p = p.replace(/\s+\([^)]*\)\s*$/, '').trim();
  if (p.startsWith('./')) p = p.slice(2);
  return p.length > 300 ? '' : p;
}

const scopeOfPath = (p: string): ContextLocationScope => (p.startsWith('~') || p.startsWith('/') ? 'user' : 'project');

/** Lê a descoberta: a lista de locais do primeiro JSON com `locations`, validada e sem repetição. null = sem lista. */
export function parseDiscovery(text: string): ContextLocation[] | null {
  const found = jsonObjects(text).find(
    (o): o is { locations: unknown[] } => !!o && typeof o === 'object' && Array.isArray((o as { locations?: unknown }).locations),
  );
  if (!found) return null;
  const out: ContextLocation[] = [];
  const seen = new Set<string>();
  for (const item of found.locations) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.path !== 'string') continue;
    const path = normalizeLocationPath(raw.path);
    if (!path) continue;
    const kind = CONTEXT_KINDS.includes(raw.kind as ContextLocationKind) ? (raw.kind as ContextLocationKind) : 'instructions';
    // o caminho decide o escopo: "~/" é da pasta do usuário, mesmo que o agente diga outra coisa
    const scope = scopeOfPath(path);
    const key = `${scope}:${path}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, scope, kind, loads: raw.loads === 'on-demand' ? 'on-demand' : 'always', source: 'agent' });
    if (out.length >= MAX_LOCATIONS) break;
  }
  return out;
}

/**
 * O caminho tem um trecho que só o agente sabe preencher (`<projeto>`, `{nome}`) ou é uma descrição, não um caminho
 * ("(instalação da CLI)/skills", do Kimi Code 2.3.0): o board não testa.
 */
export const unresolvablePath = (p: string): boolean => /[<>{}()]/.test(p);

// ---------- verificação ----------

/** Uma linha para o agente citar: ele recebe o começo (`head`) e precisa devolver o resto (`tail`). */
export interface QuoteProbe {
  id: string;
  head: string;
  tail: string;
}

/** o começo dado ao agente tem de 3 a 5 palavras: nas linhas curtas, sobra sempre um resto de 4 palavras para provar */
const MAX_HEAD_WORDS = 5;
const MIN_HEAD_WORDS = 3;
const MIN_TAIL_WORDS = 4;
const MIN_TAIL_CHARS = 16;
const headWords = (count: number) => Math.max(MIN_HEAD_WORDS, Math.min(MAX_HEAD_WORDS, count - MIN_TAIL_WORDS));

const words = (line: string): string[] => line.trim().split(/\s+/).filter(Boolean);

/** Normaliza para comparar: sem marcação de Markdown, aspas, pontuação solta e espaços repetidos, em minúsculas. */
export function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_>#"“”'‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A linha serve para citar: tem palavras bastantes para o resto não ser adivinhado. */
function quotable(line: string): boolean {
  const w = words(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
  const tail = w.slice(headWords(w.length)).join(' ');
  return w.length >= MIN_HEAD_WORDS + MIN_TAIL_WORDS && normalizeQuote(tail).length >= MIN_TAIL_CHARS && !/^\s*```/.test(line);
}

/**
 * Escolhe a linha de um arquivo para citar. Na skill e no agente, a `description:` do cabeçalho (é ela que fica
 * no contexto mesmo quando o corpo só carrega sob demanda); senão, uma linha longa ao acaso. null = nenhuma serve.
 */
export function pickQuoteLine(content: string, kind: ContextLocationKind, random: () => number = Math.random): string | null {
  const lines = content.split(/\r?\n/);
  if (kind === 'skill' || kind === 'agent') {
    const description = lines.find((l) => /^description:\s*\S/.test(l));
    if (description) {
      const text = description.replace(/^description:\s*/, '').replace(/^["']|["']$/g, '');
      if (quotable(text)) return text;
    }
  }
  const candidates = lines.filter(quotable);
  if (!candidates.length) return null;
  // as linhas mais longas primeiro: o resto delas é mais difícil de adivinhar
  const longest = [...candidates].sort((a, b) => b.length - a.length).slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
  return longest[Math.floor(random() * longest.length)]!.trim();
}

/** Corta a linha em começo e resto. */
export function quoteProbe(id: string, line: string): QuoteProbe {
  const w = words(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
  const n = headWords(w.length);
  return { id, head: w.slice(0, n).join(' '), tail: w.slice(n).join(' ') };
}

const CANARY_WORDS = [
  'tucano',
  'girafa',
  'lanterna',
  'cebola',
  'violino',
  'cometa',
  'pijama',
  'farol',
  'abacaxi',
  'bússola',
  'ferradura',
  'trombone',
  'canela',
  'iglu',
  'mochila',
  'pêndulo',
  'jabuti',
  'xadrez',
  'orvalho',
  'castanha',
];

/**
 * Uma linha de isca com palavras ao acaso, para os locais que ainda não existem no projeto (e para o controle). O
 * começo e o resto têm cada um o seu código: duas iscas nunca dividem o trecho pedido nem o resto que prova a leitura.
 */
export function canaryLine(random: () => number = Math.random): string {
  const pick = () => CANARY_WORDS[Math.floor(random() * CANARY_WORDS.length)]!;
  const code = () =>
    Math.floor(random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
  return `Faz-${code()} ${pick()} ${pick()} ${pick()} ${pick()} ${pick()} ${pick()} ${pick()} ${pick()} fim-${code()}.`;
}

/**
 * O pedido de verificação: o agente procura no contexto as linhas que começam com cada trecho e as copia. A linha de
 * controle vai no próprio pedido: citá-la prova que o agente sabe fazer a tarefa, então um "não encontrei" nos
 * outros trechos quer dizer que o arquivo não chegou ao modelo.
 */
export function verificationPrompt(probes: QuoteProbe[], control: { line: string; probe: QuoteProbe }): string {
  // o controle entra no meio da lista, para não ser o único a vir na posição de sempre
  const list = [...probes];
  list.splice(Math.floor(list.length / 2), 0, control.probe);
  return [
    'Teste do contexto (Faz AI). Não use nenhuma ferramenta: não abra, não liste e não procure arquivos. Responda só com o que já está no contexto desta conversa: as instruções de sistema, os arquivos que a sua ferramenta carregou sozinha e o bloco de controle abaixo.',
    '',
    'Para cada trecho da lista, procure no contexto uma linha que comece com ele e copie essa linha inteira, exatamente. Se não houver, escreva NÃO ENCONTREI. Não invente nem complete por conta própria.',
    '',
    'Exemplo de resposta (trechos fictícios):',
    't1: A linha completa que começa com o trecho t1, copiada do contexto.',
    't2: NÃO ENCONTREI',
    '',
    'Bloco de controle:',
    control.line,
    '',
    'Trechos:',
    ...list.map((p) => `${p.id}: "${p.head}"`),
  ].join('\n');
}

/** O agente citou a linha: o resto dela, que ele não recebeu, aparece na resposta. */
export function quoted(answer: string, probe: QuoteProbe): boolean {
  const tail = normalizeQuote(probe.tail);
  return tail.length >= MIN_TAIL_CHARS && normalizeQuote(answer).includes(tail);
}

// ---------- o que fazer com o que vaza ----------

/** A resposta do agente a uma pergunta sobre ele (o comando que desinstala um plugin): em curso, a resposta ou nada. */
export type ContextAdvice =
  { state: 'running' } | { state: 'done'; command: string | null; at: number } | { state: 'failed'; error: string };

/** A pergunta do comando que desinstala um plugin: uma linha, sem ferramentas. */
export const uninstallPrompt = (plugin: string): string =>
  [
    'Teste do contexto (Faz AI). Não use nenhuma ferramenta.',
    `Qual é o comando, no terminal, para desinstalar o plugin "${plugin}" da sua ferramenta?`,
    'Responda só com o comando, numa linha, sem explicação. Se a ferramenta não tiver comando para isso, responda só NÃO SEI.',
  ].join('\n');

/** O comando da resposta: a última linha que não é raciocínio nem "não sei", sem crases. null = o agente não sabe. */
export function parseUninstall(answer: string): string | null {
  const lines = answer
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•*>-]\s*/, '').trim())
    // a CLI do Kimi Code fecha a saída de texto com "To resume this session: kimi -r …", que não é a resposta
    .filter((l) => l && !l.startsWith('```') && !/^to resume this session/i.test(l));
  const last =
    lines
      .at(-1)
      ?.replace(/^`+|`+$/g, '')
      .trim() ?? '';
  if (!last || /n[ãa]o sei/i.test(last) || last.length > 200) return null;
  return last;
}

/** Tokens aproximados de um texto: uns quatro caracteres por token, a conta de bolso dos modelos atuais. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** As linhas que contam para comparar dois arquivos: sem vazias, sem marcação solta e sem as muito curtas. */
export function significantLines(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map(normalizeQuote)
      .filter((l) => l.length >= 12),
  );
}

/** As frações de linhas de um arquivo presentes no outro; null quando um deles não tem linha que conte. */
export function overlapOf(a: string, b: string): { aInB: number; bInA: number } | null {
  const la = significantLines(a);
  const lb = significantLines(b);
  if (!la.size || !lb.size) return null;
  const shared = [...la].filter((l) => lb.has(l)).length;
  return { aInB: shared / la.size, bInA: shared / lb.size };
}

/**
 * De onde vem um arquivo que vaza, para a sugestão certa:
 * - `faz-ai-copy`: uma cópia antiga da skill do fluxo que versões anteriores do board instalaram;
 * - `plugin`: vem de um plugin instalado na ferramenta (o nome sai do caminho);
 * - `user-skill` / `user-instructions`: da sua pasta pessoal, vale para todos os projetos;
 * - `project`: do próprio projeto.
 */
export type LeakOrigin =
  | { kind: 'board-reference' }
  | { kind: 'faz-ai-copy' }
  | { kind: 'plugin'; plugin: string }
  | { kind: 'user-skill' }
  | { kind: 'user-instructions' }
  | { kind: 'project' };

export function leakOrigin(file: string, loc: Pick<ContextLocation, 'scope' | 'kind'>): LeakOrigin {
  if (/(^|\/)skills\/faz-ai-[a-z0-9-]+\//.test(file)) return { kind: 'faz-ai-copy' };
  const plugin = /(^|\/)plugins\/(?:managed\/|cache\/|marketplaces\/)?([^/]+)\//.exec(file);
  if (plugin) return { kind: 'plugin', plugin: plugin[2]! };
  if (loc.scope === 'project' && !file.startsWith('~') && !file.startsWith('/') && !file.startsWith('..')) return { kind: 'project' };
  return loc.kind === 'skill' || loc.kind === 'agent' ? { kind: 'user-skill' } : { kind: 'user-instructions' };
}

/** Os arquivos de um local que vaza, agrupados pela origem: cada grupo leva uma sugestão. */
export interface LeakGroup {
  origin: LeakOrigin;
  files: string[];
  tokens: number;
}

export function leakGroups(loc: ContextLocationResult): LeakGroup[] {
  if (loc.verdict.state !== 'leaks') return [];
  const { files, tokens } = loc.verdict;
  const groups: LeakGroup[] = [];
  files.forEach((file, i) => {
    const origin: LeakOrigin = loc.verdict.state === 'leaks' && loc.verdict.refs?.[i] ? { kind: 'board-reference' } : leakOrigin(file, loc);
    const key = JSON.stringify(origin);
    const group = groups.find((g) => JSON.stringify(g.origin) === key);
    const t = tokens?.[i] ?? 0;
    if (group) {
      group.files.push(file);
      group.tokens += t;
    } else groups.push({ origin, files: [file], tokens: t });
  });
  return groups;
}

/** Os tokens que um local põe em todo card (a soma dos arquivos que vazam). */
export const leakTokens = (loc: ContextLocationResult): number =>
  loc.verdict.state === 'leaks' ? (loc.verdict.tokens ?? []).reduce((a, b) => a + b, 0) : 0;

/** A chave de um local para "Manter assim": o escopo e o caminho, como a pessoa os vê. */
export const locationKey = (loc: Pick<ContextLocation, 'scope' | 'path'>): string => `${loc.scope}:${loc.path}`;

/** Um nome de regra a partir do caminho do arquivo (`AGENTS.md` → `agents`, `.cursor/rules/x.mdc` → `cursor-rules-x`). */
export function ruleNameFor(file: string): string {
  const name = file
    .replace(/\.(md|mdc|txt)$/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return name || 'instrucoes-do-projeto';
}

/** O arquivo já é só uma das referências que o board deixa ao importar ou juntar: não há mais o que fazer nele. */
export function isBoardReference(text: string | undefined): boolean {
  const body = (text ?? '').trim();
  return (
    /^As instruções que estavam neste arquivo viraram a regra "[^"\n]+" do board Faz AI/.test(body) ||
    /^@\S+$/.test(body) ||
    /^As instruções deste projeto estão em \S+\.$/.test(body)
  );
}

/** O que fica no arquivo cujas instruções viraram regra do board: uma referência para quem usa a ferramenta fora dele. */
export const importedReference = (rule: string): string =>
  `As instruções que estavam neste arquivo viraram a regra "${rule}" do board Faz AI (Configurações › Harness). O board a entrega aos cards que a pedirem.\n`;

/**
 * O que fica no arquivo repetido que vira referência ao outro. O CLAUDE.md entende `@caminho` (a importação do
 * Claude Code); nos outros, uma frase que aponta o arquivo.
 */
export function mergedReference(keep: string, replaced: string): string {
  const name = replaced.split('/').pop() ?? replaced;
  if (/^CLAUDE(\.local)?\.md$/.test(name)) return `@${relativeTo(replaced, keep)}\n`;
  return `As instruções deste projeto estão em ${relativeTo(replaced, keep)}.\n`;
}

/** O caminho de `target` visto da pasta de `from` (os dois relativos à raiz do projeto). */
function relativeTo(from: string, target: string): string {
  const up = from.split('/').length - 1;
  return up ? `${'../'.repeat(up)}${target}` : target;
}
