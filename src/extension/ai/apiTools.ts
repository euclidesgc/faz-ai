// As ferramentas locais do modo API (épica "ferramenta por modo", história 11). No modo API o board é quem
// executa no computador da pessoa o que o modelo pede: ler, buscar, escrever, editar e rodar um comando. É
// o ponto mais sensível da épica, então cada ferramenta é estreita e as fronteiras ficam aqui, num lugar só:
//
// - todo caminho é resolvido com `realpath` e precisa cair numa das pastas da execução (a do card, `cwd`, e
//   os diretórios adicionais que a admissão vinculou, `addDirs`): `..`, symlink para fora e caminho absoluto
//   fora são recusados. Dentro delas, o board não deixa ler nem escrever o `.git` (configuração com
//   credencial, hooks que rodam código) nem os arquivos do próprio board (`.faz-ai*`), e não deixa escrever
//   a configuração das ferramentas de IA e do editor (`.vscode`, `.claude`, `.cursor`, `.gemini`,
//   `.mcp.json`), que faria um comando rodar fora do nível `full`. Os segredos do host (`~/.faz-ai`, onde
//   ficam as pontes do board, `~/.ssh`, `~/.gnupg`, `~/.aws`) ficam de fora mesmo quando uma pasta da
//   execução os contém;
// - leitura, saída e tempo têm limite: arquivo grande, resultado longo e busca demorada são cortados com aviso;
// - a busca com expressão regular roda numa thread à parte, com tempo limite: uma expressão do modelo que
//   explode (backtracking) não trava o editor;
// - `run_command` recebe o programa e os argumentos em lista e roda sem shell: nada do que o modelo manda é
//   interpretado por um shell (no Windows, o `.cmd`/`.bat` só roda pelo cmd.exe, e os argumentos vão
//   escapados como em `spawn.ts`). O ambiente é filtrado (sem a chave da API, sem variável com cara de
//   segredo, sem as do provedor), e o processo roda num grupo próprio: Parar e o tempo limite matam a árvore
//   inteira, não só o filho direto.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Worker } from 'node:worker_threads';
import type { ApiLocalTool } from '../../shared/apiTools';
import { bashCommandTerms } from '../../shared/bashCommand';
import { asList, asNumber, asObject, asText, type Json } from '../aiOutput/json';
import { resolveCommand } from '../cliResolve';
import { INHERITED_SESSION_ENV, launchSpec } from '../spawn';

/** Os limites das ferramentas locais; os testes os diminuem. */
export interface LocalToolLimits {
  /** maior arquivo que `read_file`, `edit_file` e `grep` abrem */
  fileBytes: number;
  /** o que cabe de texto num resultado; o resto é cortado com aviso */
  resultChars: number;
  /** maior conteúdo que `write_file` e `edit_file` gravam */
  writeBytes: number;
  /** quantas entradas a busca de arquivos visita no máximo */
  walkEntries: number;
  /** quantos caminhos `glob` e quantas linhas `grep` devolvem no máximo */
  matches: number;
  /** quanto a busca com expressão regular pode levar */
  grepMs: number;
  /** o tempo padrão e o máximo de um comando */
  commandMs: number;
  commandMaxMs: number;
  /** o que cabe de saída de um comando em cada canal (o começo e o fim) */
  commandOutputChars: number;
}

export const LOCAL_TOOL_LIMITS: LocalToolLimits = {
  fileBytes: 5_000_000,
  resultChars: 60_000,
  writeBytes: 5_000_000,
  walkEntries: 50_000,
  matches: 500,
  grepMs: 20_000,
  commandMs: 120_000,
  commandMaxMs: 600_000,
  commandOutputChars: 30_000,
};

/** O que a execução de uma ferramenta local recebe do laço. */
export interface LocalToolContext {
  /** as pastas da execução, já reais (`realLocalRoots`): a primeira é a do card, base dos caminhos relativos */
  roots: readonly string[];
  /** o Parar da execução */
  signal: AbortSignal;
  /** a chave da API: nenhuma variável cujo valor a contenha chega ao comando */
  apiKey?: string;
  /** o PATH com que o comando é procurado e roda (o do shell de login, no host); ausente = o do processo */
  pathEnv?: string;
  /** a pasta da pessoa (os segredos do host que nunca entram) */
  homeDir?: string;
  /** o ambiente de onde sai o do comando, filtrado (nos testes, um fixo) */
  baseEnv?: NodeJS.ProcessEnv;
  limits?: Partial<LocalToolLimits>;
  /** cada processo iniciado, para o laço saber se ainda há algo rodando (`terminationConfirmed`) */
  processes?: Set<ChildProcess>;
}

/** O que a ferramenta devolve: a `response` do `functionResponse` e, para o comando, o termo do inventário. */
export interface LocalToolResult {
  response: Json;
  /** o termo do comando para o registro (`npm test`, `git status`), sem os argumentos */
  command?: string;
  /** a chamada falhou (o comando saiu com erro); o que a ferramenta recusou volta em `response.error` */
  failed?: boolean;
}

/** Uma recusa da ferramenta: a mensagem volta ao modelo como `error`, sem derrubar a execução. */
export class LocalToolError extends Error {}

/** O Parar chegou no meio da ferramenta: o laço sai sem mandar mais nada. */
export class LocalToolStopped extends Error {}

const isWindows = process.platform === 'win32';
/** Nunca lidos nem escritos, em nenhum nível: credenciais e hooks do git, arquivos do próprio board. */
const NEVER = (segment: string): boolean => segment === '.git' || segment.startsWith('.faz-ai');
/** Nunca escritos pelas ferramentas de arquivo: a configuração que faria uma ferramenta ou o editor rodar algo. */
const NO_WRITE = new Set(['.vscode', '.claude', '.cursor', '.gemini', '.mcp.json']);
/** Pastas que a busca pula, a menos que o padrão as peça. */
const SKIP_WALK = new Set(['node_modules']);

const limitsOf = (ctx: LocalToolContext): LocalToolLimits => ({ ...LOCAL_TOOL_LIMITS, ...ctx.limits });

/**
 * As pastas da execução como caminhos reais: a do card primeiro e os diretórios adicionais (os mesmos que a
 * admissão vinculou). Uma pasta que não existe fica de fora; sem a do card, a execução não tem onde trabalhar.
 */
export function realLocalRoots(cwd: string, addDirs: readonly string[] = []): string[] {
  const roots: string[] = [];
  for (const dir of [cwd, ...addDirs]) {
    try {
      const real = fs.realpathSync(path.resolve(cwd, dir));
      if (fs.statSync(real).isDirectory() && !roots.includes(real)) roots.push(real);
    } catch {
      if (dir === cwd) throw new Error(`A pasta do card não existe: ${cwd}`);
    }
  }
  return roots;
}

/** `child` está em `parent` (ou é ele). `path.relative` já compara sem maiúsculas no Windows. */
function within(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Os segredos do host que nenhuma ferramenta toca, mesmo dentro de uma pasta da execução. */
function hostSecrets(homeDir: string): string[] {
  const dirs = ['.faz-ai', '.ssh', '.gnupg', '.aws'].map((d) => path.join(homeDir, d));
  return dirs.map((d) => {
    try {
      return fs.realpathSync(d);
    } catch {
      return d;
    }
  });
}

/** O caminho real mais próximo que existe, com o resto (o que ainda vai ser criado) por cima. */
function realOrParent(abs: string): string {
  let current = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse());
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && (e as NodeJS.ErrnoException).code !== 'ENOTDIR') throw e;
      const parent = path.dirname(current);
      if (parent === current) throw new LocalToolError('Caminho sem pasta existente.');
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/** Um caminho confinado: o real e como mostrá-lo ao modelo (relativo à pasta do card, quando cabe nela). */
interface Confined {
  real: string;
  shown: string;
}

/**
 * Resolve um caminho pedido pelo modelo dentro das pastas da execução, ou recusa. Relativo vale da pasta do
 * card; absoluto, só dentro de uma das pastas. O real (com os symlinks resolvidos) é o que precisa ficar
 * dentro: um symlink que aponta para fora é recusado como um `..`.
 */
export function confinePath(ctx: Pick<LocalToolContext, 'roots' | 'homeDir'>, raw: unknown, mode: 'read' | 'write'): Confined {
  const asked = typeof raw === 'string' ? raw.trim() : '';
  if (!asked || asked.includes('\0')) throw new LocalToolError('Caminho vazio ou inválido.');
  const base = ctx.roots[0];
  if (!base) throw new LocalToolError('A execução não tem pasta de trabalho.');
  const abs = path.resolve(base, asked);
  // a primeira conferência é a do caminho como foi pedido: `../fora` nem chega ao disco
  if (!ctx.roots.some((root) => within(root, abs))) throw new LocalToolError(`Fora das pastas do card: ${asked}`);
  let real: string;
  try {
    real = mode === 'read' ? fs.realpathSync(abs) : realOrParent(abs);
  } catch (e) {
    if (e instanceof LocalToolError) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    throw new LocalToolError(code === 'ENOENT' ? `Não existe: ${asked}` : `Não foi possível abrir ${asked} (${code ?? 'erro'}).`);
  }
  const root = ctx.roots.find((r) => within(r, real));
  if (!root) throw new LocalToolError(`Fora das pastas do card (o caminho real sai delas): ${asked}`);
  const segments = path
    .relative(root, real)
    .split(path.sep)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (segments.some(NEVER))
    throw new LocalToolError(`O board não deixa ${mode === 'read' ? 'ler' : 'escrever'} ${asked}: é do git ou do próprio board.`);
  if (mode === 'write' && segments.some((s) => NO_WRITE.has(s)))
    throw new LocalToolError(`O board não deixa escrever ${asked}: é configuração de ferramenta de IA ou do editor.`);
  if (hostSecrets(ctx.homeDir ?? os.homedir()).some((secret) => within(secret, real)))
    throw new LocalToolError(`O board não deixa ${mode === 'read' ? 'ler' : 'escrever'} ${asked}: é um segredo do computador.`);
  const fromCard = path.relative(base, real);
  const shown = within(base, real) ? fromCard.split(path.sep).join('/') || '.' : real;
  return { real, shown };
}

/** Corta um texto no limite, com o aviso de quanto ficou de fora. */
function capped(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[cortado pelo board: ${text.length - max} caracteres a mais]` : text;
}

/** Lê um arquivo de texto confinado, com o limite de tamanho; binário é recusado. */
function readText(file: Confined, limits: LocalToolLimits): string {
  const st = fs.statSync(file.real);
  if (!st.isFile()) throw new LocalToolError(`Não é um arquivo: ${file.shown}`);
  if (st.size > limits.fileBytes)
    throw new LocalToolError(`Arquivo grande demais para ler (${st.size} bytes; o limite é ${limits.fileBytes}): ${file.shown}`);
  const buf = fs.readFileSync(file.real);
  if (buf.subarray(0, 8000).includes(0)) throw new LocalToolError(`Arquivo binário: ${file.shown}`);
  return buf.toString('utf8');
}

/** Um inteiro positivo do argumento, ou o padrão. */
function positive(v: unknown, fallback: number): number {
  const n = asNumber(v);
  return n !== null && n >= 1 ? Math.floor(n) : fallback;
}

function readFile(args: Json, ctx: LocalToolContext): LocalToolResult {
  const limits = limitsOf(ctx);
  const file = confinePath(ctx, args.path, 'read');
  const lines = readText(file, limits).split(/\r?\n/);
  const offset = positive(args.offset, 1);
  const limit = positive(args.limit, 2000);
  const slice = lines.slice(offset - 1, offset - 1 + limit);
  // cada linha com o número, como `cat -n`: o modelo cita e edita pelo trecho, sem contar à mão
  const body = slice
    .map((line, i) => `${String(offset + i).padStart(6)}\t${line.length > 2000 ? `${line.slice(0, 2000)}…` : line}`)
    .join('\n');
  const more = offset - 1 + slice.length < lines.length ? `\n[mais ${lines.length - (offset - 1 + slice.length)} linhas: use offset]` : '';
  return { response: { output: capped(body, limits.resultChars) + more } };
}

/** O padrão de glob como expressão regular, sobre o caminho com `/`: `**`, `*`, `?`, `{a,b}` e `[abc]`. */
export function globRegex(glob: string): RegExp {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      braces++;
      re += '(?:';
    } else if (c === '}' && braces) {
      braces--;
      re += ')';
    } else if (c === ',' && braces) re += '|';
    else if (c === '[' && glob.indexOf(']', i + 2) > i) {
      const end = glob.indexOf(']', i + 2);
      const body = glob.slice(i + 1, end).replace(/\\/g, '\\\\');
      re += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|[\]\\/]/g, '\\$&');
  }
  while (braces-- > 0) re += ')';
  return new RegExp(`^${re}$`, isWindows ? 'i' : '');
}

/**
 * Percorre uma pasta confinada sem seguir symlink de pasta (um symlink para fora, ou um laço, não é
 * visitado), pulando o `.git`, os arquivos do board e o `node_modules` (a menos que o padrão o peça). Um
 * arquivo por symlink só entra se o real dele também ficar nas pastas da execução.
 */
async function walk(
  start: Confined,
  ctx: LocalToolContext,
  keep: (rel: string) => boolean,
  opts: { includeSkipped: boolean; max: number },
): Promise<{ files: Confined[]; truncated: boolean }> {
  const limits = limitsOf(ctx);
  const files: Confined[] = [];
  let visited = 0;
  let truncated = false;
  const queue: string[] = [start.real];
  const secrets = hostSecrets(ctx.homeDir ?? os.homedir());
  const base = ctx.roots[0]!;
  const shownOf = (real: string) => (within(base, real) ? path.relative(base, real).split(path.sep).join('/') : real);
  while (queue.length) {
    if (ctx.signal.aborted) throw new LocalToolStopped();
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++visited > limits.walkEntries) return { files, truncated: true };
      const name = entry.name.toLowerCase();
      if (NEVER(name) || (!opts.includeSkipped && SKIP_WALK.has(name))) continue;
      const full = path.join(dir, entry.name);
      if (secrets.some((s) => within(s, full))) continue;
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        let real = full;
        if (entry.isSymbolicLink()) {
          try {
            real = fs.realpathSync(full);
            if (!fs.statSync(real).isFile() || !ctx.roots.some((r) => within(r, real))) continue;
          } catch {
            continue;
          }
        }
        const rel = path.relative(start.real, full).split(path.sep).join('/');
        if (!keep(rel)) continue;
        if (files.length >= opts.max) {
          truncated = true;
          return { files, truncated };
        }
        files.push({ real, shown: shownOf(full) });
      }
    }
  }
  return { files, truncated };
}

async function glob(args: Json, ctx: LocalToolContext): Promise<LocalToolResult> {
  const limits = limitsOf(ctx);
  const pattern = asText(args.pattern);
  if (!pattern || pattern.includes('\0')) throw new LocalToolError('Falta o padrão (pattern).');
  const start = confinePath(ctx, asText(args.path) ?? '.', 'read');
  if (!fs.statSync(start.real).isDirectory()) throw new LocalToolError(`Não é uma pasta: ${start.shown}`);
  const re = globRegex(pattern.replace(/^\.\//, ''));
  const { files, truncated } = await walk(start, ctx, (rel) => re.test(rel), {
    includeSkipped: /node_modules/i.test(pattern),
    max: limits.matches,
  });
  const list = files.map((f) => f.shown).sort();
  const output = list.length ? list.join('\n') : 'Nenhum arquivo encontrado.';
  return { response: { output: capped(output, limits.resultChars) + (truncated ? '\n[lista cortada pelo board: refine o padrão]' : '') } };
}

/**
 * O que roda na thread da busca: lê os arquivos (já confinados) e testa a expressão linha a linha. Fica num
 * texto à parte para a thread poder ser encerrada no tempo limite sem levar o editor junto.
 */
const GREP_WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const { pattern, flags, files, maxBytes, max } = workerData;
const re = new RegExp(pattern, flags);
const out = [];
let truncated = false;
outer: for (const f of files) {
  let buf;
  try {
    if (fs.statSync(f.real).size > maxBytes) continue;
    buf = fs.readFileSync(f.real);
  } catch { continue; }
  if (buf.subarray(0, 8000).includes(0)) continue;
  const lines = buf.toString('utf8').split(/\\r?\\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    if (out.length >= max) { truncated = true; break outer; }
    const line = lines[i].length > 500 ? lines[i].slice(0, 500) + '…' : lines[i];
    out.push(f.shown + ':' + (i + 1) + ':' + line);
  }
}
parentPort.postMessage({ out, truncated });
`;

async function grep(args: Json, ctx: LocalToolContext): Promise<LocalToolResult> {
  const limits = limitsOf(ctx);
  const pattern = asText(args.pattern);
  if (!pattern || pattern.includes('\0')) throw new LocalToolError('Falta a expressão (pattern).');
  const flags = args.ignore_case === true ? 'i' : '';
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    throw new LocalToolError(`Expressão inválida: ${e instanceof Error ? e.message : String(e)}`);
  }
  const start = confinePath(ctx, asText(args.path) ?? '.', 'read');
  const filter = asText(args.glob);
  const re = filter ? globRegex(filter.replace(/^\.\//, '')) : null;
  // um arquivo pedido direto é buscado só nele; uma pasta, em tudo o que a busca visita dentro dela
  const isDir = fs.statSync(start.real).isDirectory();
  const listed = isDir
    ? await walk(start, ctx, (rel) => !re || re.test(rel) || re.test(path.posix.basename(rel)), {
        includeSkipped: !!filter && /node_modules/i.test(filter),
        max: limits.walkEntries,
      })
    : { files: [start], truncated: false };
  const found = await new Promise<{ out: string[]; truncated: boolean }>((resolve, reject) => {
    const worker = new Worker(GREP_WORKER, {
      eval: true,
      workerData: { pattern, flags, files: listed.files, maxBytes: limits.fileBytes, max: limits.matches },
      // a thread não herda o ambiente do editor: só lê os arquivos que já foram confinados
      env: {},
    });
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onStop);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(
      () =>
        done(() =>
          reject(
            new LocalToolError(
              `A busca passou de ${limits.grepMs / 1000} s e foi encerrada: simplifique a expressão ou restrinja a pasta.`,
            ),
          ),
        ),
      limits.grepMs,
    );
    const onStop = () => done(() => reject(new LocalToolStopped()));
    ctx.signal.addEventListener('abort', onStop, { once: true });
    worker.once('message', (m: { out: string[]; truncated: boolean }) => done(() => resolve(m)));
    worker.once('error', (e) => done(() => reject(new LocalToolError(`A busca falhou: ${e.message}`))));
  });
  const output = found.out.length ? found.out.join('\n') : 'Nenhuma linha encontrada.';
  const cut = found.truncated || listed.truncated ? '\n[resultado cortado pelo board: refine a busca]' : '';
  return { response: { output: capped(output, limits.resultChars) + cut } };
}

/** Grava o arquivo sem seguir um symlink no último trecho (onde o sistema permite) e sem passar do limite. */
function writeConfined(file: Confined, content: string, limits: LocalToolLimits): void {
  if (Buffer.byteLength(content, 'utf8') > limits.writeBytes)
    throw new LocalToolError(`Conteúdo grande demais para gravar (o limite é ${limits.writeBytes} bytes).`);
  const dir = path.dirname(file.real);
  fs.mkdirSync(dir, { recursive: true });
  // a pasta criada agora continua dentro: entre a conferência e a criação ninguém trocou um trecho por symlink
  if (path.relative(fs.realpathSync(dir), dir) !== '') throw new LocalToolError('A pasta do arquivo mudou durante a gravação.');
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(file.real, flags, 0o666);
  try {
    fs.writeSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

function writeFile(args: Json, ctx: LocalToolContext): LocalToolResult {
  const content = typeof args.content === 'string' ? args.content : null;
  if (content === null) throw new LocalToolError('Falta o conteúdo (content).');
  const file = confinePath(ctx, args.path, 'write');
  if (fs.existsSync(file.real) && !fs.statSync(file.real).isFile()) throw new LocalToolError(`Não é um arquivo: ${file.shown}`);
  writeConfined(file, content, limitsOf(ctx));
  return { response: { output: `Gravado: ${file.shown} (${Buffer.byteLength(content, 'utf8')} bytes).` } };
}

function editFile(args: Json, ctx: LocalToolContext): LocalToolResult {
  const limits = limitsOf(ctx);
  const before = typeof args.old_string === 'string' ? args.old_string : null;
  const after = typeof args.new_string === 'string' ? args.new_string : null;
  if (!before || after === null) throw new LocalToolError('Faltam old_string (não vazio) e new_string.');
  if (before === after) throw new LocalToolError('old_string e new_string são iguais: nada a mudar.');
  const file = confinePath(ctx, args.path, 'write');
  if (!fs.existsSync(file.real)) throw new LocalToolError(`Não existe: ${file.shown} (para criar, use write_file).`);
  const text = readText(file, limits);
  const count = text.split(before).length - 1;
  if (!count) throw new LocalToolError(`O trecho old_string não está em ${file.shown}.`);
  if (count > 1 && args.replace_all !== true)
    throw new LocalToolError(`O trecho old_string aparece ${count} vezes em ${file.shown}: mande um trecho único ou replace_all.`);
  writeConfined(file, args.replace_all === true ? text.split(before).join(after) : text.replace(before, () => after), limits);
  return { response: { output: `Editado: ${file.shown} (${count} troca${count > 1 ? 's' : ''}).` } };
}

/**
 * As variáveis que um comando recebe do ambiente do editor: só as que um programa precisa para rodar (o
 * PATH, a pasta da pessoa, o idioma, a pasta temporária, as do sistema no Windows, o proxy e os
 * certificados). Nada do provedor de IA, nada com nome de segredo, nada das sessões do board ou do Claude.
 */
const COMMAND_ENV =
  /^(PATH|PATHEXT|HOME|USER|USERNAME|LOGNAME|SHELL|LANG|LANGUAGE|LC_[A-Z_]+|TZ|TMPDIR|TMP|TEMP|TERM|COLORTERM|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES|COMMONPROGRAMFILES\(X86\)|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|OS|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|XDG_(CONFIG|DATA|STATE|CACHE|RUNTIME)_(HOME|DIR)|(HTTPS?|ALL|NO)_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_(FILE|DIR))$/;
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE|SESSION/;

/** O ambiente filtrado do comando. Exportado para o teste ler exatamente o que passa. */
export function commandEnv(base: NodeJS.ProcessEnv, pathEnv: string | undefined, apiKey: string | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined || INHERITED_SESSION_ENV.includes(name)) continue;
    const upper = name.toUpperCase();
    if (!COMMAND_ENV.test(upper) || SECRET_NAME.test(upper)) continue;
    // um proxy com usuário e senha na URL é segredo, mesmo com o nome permitido
    if (/_PROXY$/.test(upper) && /\/\/[^/]*@/.test(value)) continue;
    if (apiKey && value.includes(apiKey)) continue;
    env[name] = value;
  }
  if (pathEnv) {
    for (const name of Object.keys(env)) if (name.toUpperCase() === 'PATH') delete env[name];
    env.PATH = pathEnv;
  }
  // nada de pergunta no terminal: o comando não tem entrada, e um pedido de senha travaria até o tempo limite
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

/** Encerra o processo e tudo o que ele iniciou: o grupo fora do Windows, o `taskkill /T` no Windows. */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (isWindows) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], (err) => err && child.kill());
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // o grupo já acabou
  }
}

/** Se o grupo do processo (e os netos dele) acabou; no Windows, se o filho direto fechou. */
export function processGone(child: ChildProcess): boolean {
  if (!child.pid) return true;
  if (isWindows) return child.exitCode !== null || child.signalCode !== null;
  try {
    process.kill(-child.pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/** Guarda o começo e o fim de uma saída longa: o erro costuma estar no fim, o contexto no começo. */
function headTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max / 3);
  return `${text.slice(0, head)}\n[saída cortada pelo board: ${text.length - max} caracteres no meio]\n${text.slice(text.length - (max - head))}`;
}

async function runCommand(args: Json, ctx: LocalToolContext): Promise<LocalToolResult> {
  const limits = limitsOf(ctx);
  const command = asText(args.command)?.trim();
  if (!command || /[\0\r\n]/.test(command)) throw new LocalToolError('Falta o programa (command), sem quebra de linha.');
  const list = asList(args.args);
  if (args.args !== undefined && !Array.isArray(args.args)) throw new LocalToolError('args precisa ser uma lista de textos.');
  if (list.length > 500 || list.some((a) => typeof a !== 'string' || a.includes('\0')))
    throw new LocalToolError('args precisa ser uma lista de textos (até 500).');
  const argv = list as string[];
  const dir = confinePath(ctx, asText(args.cwd) ?? '.', 'read');
  if (!fs.statSync(dir.real).isDirectory()) throw new LocalToolError(`Não é uma pasta: ${dir.shown}`);
  const env = commandEnv(ctx.baseEnv ?? process.env, ctx.pathEnv, ctx.apiKey);
  const pathOf = Object.entries(env).find(([n]) => n.toUpperCase() === 'PATH')?.[1];
  // o programa: com barra, um arquivo a partir da pasta do comando; sem barra, procurado só no PATH
  const executable = /[\\/]/.test(command)
    ? resolveCommand(path.resolve(dir.real, command), pathOf, '', {})
    : resolveCommand(command, pathOf, '', { onlyPath: true });
  if (!executable) throw new LocalToolError(`Programa não encontrado: ${command}`);
  const launch = launchSpec(executable, argv);
  const seconds = asNumber(args.timeout_seconds);
  const ms = Math.min(seconds !== null && seconds > 0 ? seconds * 1000 : limits.commandMs, limits.commandMaxMs);
  const base = path.basename(executable).replace(/\.(exe|cmd|bat|com)$/i, '');
  const term = bashCommandTerms([base, ...(argv[0] && !/\s/.test(argv[0]) ? [argv[0]] : [])].join(' '))[0] ?? 'outro';
  if (ctx.signal.aborted) throw new LocalToolStopped();

  let child: ChildProcess;
  try {
    child = spawn(launch.file, launch.args, {
      cwd: dir.real,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: launch.shell,
      windowsVerbatimArguments: launch.shell,
      windowsHide: true,
      // fora do Windows, um grupo próprio: o tempo limite e o Parar levam junto o que o comando iniciou
      detached: !isWindows,
    });
  } catch (e) {
    throw new LocalToolError(`Não foi possível iniciar ${command}: ${e instanceof Error ? e.message : String(e)}`);
  }
  ctx.processes?.add(child);
  const output = { stdout: '', stderr: '' };
  for (const stream of ['stdout', 'stderr'] as const) {
    const decoder = new StringDecoder('utf8');
    child[stream]?.on('data', (d: Buffer) => {
      // guarda até o dobro do limite e corta no fim: o começo e o fim de uma saída enorme, sem crescer sem fim
      output[stream] += decoder.write(d);
      if (output[stream].length > limits.commandOutputChars * 4) output[stream] = headTail(output[stream], limits.commandOutputChars * 2);
    });
    child[stream]?.on('end', () => {
      output[stream] += decoder.end();
    });
  }
  let timedOut = false;
  let stopping = false;
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
    let force: NodeJS.Timeout | undefined;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      killTree(child, 'SIGTERM');
      // quem ignora o pedido sai à força; e se nem assim a saída fechar (um neto que saiu do grupo segurando
      // o pipe), a chamada termina para o board em vez de prender a execução
      force = setTimeout(() => {
        killTree(child, 'SIGKILL');
        setTimeout(() => resolve({ code: null, signal: 'SIGKILL' }), 5_000).unref();
      }, 2_000);
      force.unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, ms);
    const onAbort = () => stop();
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    child.once('error', (error) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      resolve({ code: null, signal: null, error });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (force) clearTimeout(force);
      ctx.signal.removeEventListener('abort', onAbort);
      // o comando acabou: o que ele deixou rodando no grupo (um servidor em segundo plano) acaba junto
      if (!isWindows) killTree(child, 'SIGKILL');
      resolve({ code, signal });
    });
  });
  ctx.processes?.delete(child);
  if (ctx.signal.aborted) throw new LocalToolStopped();
  if (result.error) throw new LocalToolError(`Não foi possível rodar ${command}: ${result.error.message}`);
  const response: Json = {
    exit_code: result.code,
    ...(result.signal ? { signal: result.signal } : {}),
    ...(timedOut ? { timed_out: `o board encerrou o comando depois de ${ms / 1000} s` } : {}),
    stdout: headTail(output.stdout, limits.commandOutputChars),
    stderr: headTail(output.stderr, limits.commandOutputChars),
  };
  return { response, command: term, failed: timedOut || result.code !== 0 };
}

/** Executa uma ferramenta local já admitida. A recusa volta como `error` ao modelo; o Parar lança `LocalToolStopped`. */
export async function runLocalTool(tool: ApiLocalTool, rawArgs: unknown, ctx: LocalToolContext): Promise<LocalToolResult> {
  const args = asObject(rawArgs) ?? {};
  try {
    switch (tool.fn) {
      case 'read_file':
        return readFile(args, ctx);
      case 'glob':
        return await glob(args, ctx);
      case 'grep':
        return await grep(args, ctx);
      case 'write_file':
        return writeFile(args, ctx);
      case 'edit_file':
        return editFile(args, ctx);
      case 'run_command':
        return await runCommand(args, ctx);
    }
  } catch (e) {
    if (e instanceof LocalToolStopped || ctx.signal.aborted) throw new LocalToolStopped();
    if (e instanceof LocalToolError) return { response: { error: e.message }, failed: true };
    const code = (e as NodeJS.ErrnoException).code;
    return { response: { error: `A ferramenta ${tool.fn} falhou${code ? ` (${code})` : ''}.` }, failed: true };
  }
}

/** As declarações das funções locais, no formato do `functionDeclarations` (`parametersJsonSchema`). */
export function localDeclaration(tool: ApiLocalTool): Json {
  const where = 'Caminho relativo à pasta do card (ou absoluto, dentro das pastas do card).';
  const decl: Record<ApiLocalTool['fn'], { description: string; parameters: Json }> = {
    read_file: {
      description: 'Lê um arquivo de texto das pastas do card, com o número de cada linha.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: where },
          offset: { type: 'integer', description: 'A primeira linha (1 = o começo).' },
          limit: { type: 'integer', description: 'Quantas linhas (padrão 2000).' },
        },
        required: ['path'],
      },
    },
    glob: {
      description: 'Lista os arquivos cujo caminho casa com um padrão de glob (`**/*.ts`, `src/*.{js,ts}`).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'O padrão, relativo à pasta da busca.' },
          path: { type: 'string', description: `A pasta da busca (padrão: a do card). ${where}` },
        },
        required: ['pattern'],
      },
    },
    grep: {
      description: 'Busca uma expressão regular (sintaxe do JavaScript) nas linhas dos arquivos; devolve arquivo:linha:texto.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'A expressão regular.' },
          path: { type: 'string', description: `O arquivo ou a pasta da busca (padrão: a do card). ${where}` },
          glob: { type: 'string', description: 'Só os arquivos que casam com este glob (`*.ts`).' },
          ignore_case: { type: 'boolean', description: 'Sem diferença entre maiúsculas e minúsculas.' },
        },
        required: ['pattern'],
      },
    },
    write_file: {
      description: 'Cria ou sobrescreve um arquivo das pastas do card com o conteúdo dado.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: where },
          content: { type: 'string', description: 'O conteúdo inteiro do arquivo.' },
        },
        required: ['path', 'content'],
      },
    },
    edit_file: {
      description: 'Troca um trecho exato de um arquivo por outro. O trecho precisa ser único no arquivo, a menos que replace_all.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: where },
          old_string: { type: 'string', description: 'O trecho exato que existe hoje no arquivo.' },
          new_string: { type: 'string', description: 'O trecho que fica no lugar.' },
          replace_all: { type: 'boolean', description: 'Troca todas as ocorrências.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    run_command: {
      description:
        'Roda um programa, sem shell, numa pasta do card: o programa e os argumentos vão separados (pipes, redirecionamentos e `&&` não são interpretados). Devolve o código de saída, a saída e os erros.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'O programa (procurado no PATH) ou o caminho dele.' },
          args: { type: 'array', items: { type: 'string' }, description: 'Os argumentos, um por item.' },
          cwd: { type: 'string', description: `A pasta onde roda (padrão: a do card). ${where}` },
          timeout_seconds: { type: 'integer', description: 'Tempo limite em segundos (padrão 120, máximo 600).' },
        },
        required: ['command'],
      },
    },
  };
  const { description, parameters } = decl[tool.fn];
  return { name: tool.fn, description, parametersJsonSchema: parameters };
}
