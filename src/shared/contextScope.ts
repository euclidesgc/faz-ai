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
  | { state: 'leaks'; how: 'quote' | 'canary'; files: string[] }
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
}

export type ContextScopeState = 'closed' | 'open' | 'unverified';

/**
 * Fechado: o controle passou, ao menos um local foi conferido e nenhum vaza. Aberto: algum local vaza (vale mesmo
 * sem o controle, porque citar a linha certa é prova). O resto é não verificado.
 */
export function contextScopeState(r: ContextScopeReport | null | undefined): ContextScopeState {
  if (!r) return 'unverified';
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

/** O caminho tem um trecho que só o agente sabe preencher (`<projeto>`, `{nome}`): o board não testa. */
export const unresolvablePath = (p: string): boolean => /[<>{}]/.test(p);

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
