// As ferramentas locais do modo API (épica "ferramenta por modo", história 11), sem o laço: o confinamento
// às pastas do card (`..`, absoluto fora, symlink para fora, `.git`, arquivos do board, configuração das
// ferramentas, segredos do host), os limites de tamanho e de tempo, o comando sem shell e com o ambiente
// filtrado, a tabela por nível que a admissão lê e a conferência do que foi usado contra o card.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ACP_PROJECT_CONFIG,
  commandEnv,
  confinePath,
  LocalToolError,
  LocalToolStopped,
  realLocalRoots,
  runLocalTool,
  windowsPathProblem,
  within,
  WRITE_PROTECTED,
  writeProtected,
  type LocalToolContext,
} from '../src/extension/ai/apiTools';
import { ACP_AGENTS } from '../src/extension/ai/acp/agents';
import { TOOL_ADAPTERS } from '../src/extension/toolAdapters';
import { API_LOCAL_TOOLS, apiLocalTools, deniedLocal, deniesTool, type ApiLocalTool } from '../src/shared/apiTools';
import { GlobError, globMatcher } from '../src/shared/globMatch';
import { admitExecution, type StrictExecutionRequest } from '../src/shared/executionAdmission';
import { checkRun } from '../src/shared/runCheck';

const tool = (fn: ApiLocalTool['fn']) => API_LOCAL_TOOLS.find((t) => t.fn === fn)!;

let dir: string;
let card: string;
let extra: string;
let home: string;
let ctx: LocalToolContext;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-api-tools-')));
  card = path.join(dir, 'card');
  extra = path.join(dir, 'worktree');
  home = path.join(dir, 'home');
  for (const d of [card, extra, home, path.join(dir, 'fora'), path.join(card, '.git'), path.join(home, '.ssh')])
    fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(card, 'a.txt'), 'um\ndois\ntrês\n');
  fs.writeFileSync(path.join(card, '.git', 'config'), '[remote] url = https://token@host/repo');
  fs.writeFileSync(path.join(dir, 'fora', 'segredo.txt'), 'fora do card');
  fs.writeFileSync(path.join(extra, 'b.ts'), 'export const b = 1;\n');
  fs.writeFileSync(path.join(home, '.ssh', 'id_rsa'), 'chave privada');
  ctx = { roots: realLocalRoots(card, [extra]), signal: new AbortController().signal, homeDir: home };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const error = async (fn: ApiLocalTool['fn'], args: unknown, c: LocalToolContext = ctx) =>
  (await runLocalTool(tool(fn), args, c)).response.error;

describe('confinamento: todo caminho cai numa pasta do card, pelo caminho real', () => {
  it('relativo, absoluto dentro e o diretório adicional passam; `..` e absoluto fora são recusados', () => {
    expect(confinePath(ctx, 'a.txt', 'read')).toEqual({ real: path.join(card, 'a.txt'), shown: 'a.txt' });
    expect(confinePath(ctx, path.join(extra, 'b.ts'), 'read').real).toBe(path.join(extra, 'b.ts'));
    expect(() => confinePath(ctx, '../fora/segredo.txt', 'read')).toThrow(/^Fora das pastas do card/);
    expect(() => confinePath(ctx, path.join(dir, 'fora', 'segredo.txt'), 'read')).toThrow(LocalToolError);
    expect(() => confinePath(ctx, 'sub/../../fora/x', 'write')).toThrow(/^Fora das pastas do card/);
    expect(() => confinePath(ctx, '', 'read')).toThrow('Caminho vazio');
    expect(() => confinePath(ctx, 'a\0b', 'read')).toThrow('Caminho vazio');
  });

  it('um symlink que aponta para fora é recusado, para ler e para escrever (inclusive pela pasta)', async () => {
    fs.symlinkSync(path.join(dir, 'fora', 'segredo.txt'), path.join(card, 'atalho.txt'));
    fs.symlinkSync(path.join(dir, 'fora'), path.join(card, 'pasta-fora'));
    expect(() => confinePath(ctx, 'atalho.txt', 'read')).toThrow(/o caminho real sai delas/);
    expect(await error('write_file', { path: 'pasta-fora/novo.txt', content: 'x' })).toMatch(/o caminho real sai delas/);
    expect(await error('write_file', { path: 'atalho.txt', content: 'x' })).toMatch(/o caminho real sai delas/);
    expect(fs.readFileSync(path.join(dir, 'fora', 'segredo.txt'), 'utf8')).toBe('fora do card');
    expect(fs.existsSync(path.join(dir, 'fora', 'novo.txt'))).toBe(false);
    // um symlink que fica dentro vale
    fs.symlinkSync(path.join(card, 'a.txt'), path.join(card, 'dentro.txt'));
    expect(confinePath(ctx, 'dentro.txt', 'read').real).toBe(path.join(card, 'a.txt'));
  });

  it('o .git e os arquivos do board nunca; a configuração das ferramentas não se escreve; os segredos do host nunca', async () => {
    expect(await error('read_file', { path: '.git/config' })).toMatch(/é do git ou do próprio board/);
    expect(await error('write_file', { path: '.git/hooks/pre-commit', content: 'rm -rf /' })).toMatch(/é do git/);
    expect(await error('write_file', { path: '.faz-ai-library-index.json', content: '{}' })).toMatch(/do próprio board/);
    for (const p of ['.vscode/tasks.json', '.claude/settings.json', '.mcp.json', '.gemini/settings.json', '.cursor/hooks.json'])
      expect(await error('write_file', { path: p, content: '{}' })).toMatch(/configuração de ferramenta de IA ou do editor/);
    expect(fs.existsSync(path.join(card, '.vscode'))).toBe(false);
    // a pasta da pessoa dentro de uma pasta do card: os segredos dela continuam de fora
    const inHome = { ...ctx, roots: realLocalRoots(home) };
    expect(await error('read_file', { path: '.ssh/id_rsa' }, inHome)).toMatch(/segredo do computador/);
  });

  it('a configuração de toda ferramenta do catálogo e do editor não se escreve, em qualquer profundidade e grafia', async () => {
    // a lista deriva dos adaptadores e do catálogo ACP: nenhuma ferramenta fica de fora
    for (const agent of ACP_AGENTS) expect(Object.keys(ACP_PROJECT_CONFIG), agent.id).toContain(agent.id);
    for (const adapter of Object.values(TOOL_ADAPTERS)) expect(WRITE_PROTECTED).toContain(adapter!.root);
    for (const p of [
      '.kimi-code/mcp.json',
      '.opencode/plugins/p.js',
      'opencode.json',
      'opencode.jsonc',
      'tui.json',
      '.qwen/settings.json',
      '.codex/config.toml',
      'sub/pasta/.codex/config.toml',
      '.github/hooks/politica.json',
      '.github/copilot/settings.json',
      '.agents/rules/r.md',
      '.agent/workflows/w.md',
      '.goose/recipes/r.yaml',
      '.devcontainer/devcontainer.json',
      'projeto.code-workspace',
      '.KIMI-CODE/mcp.json',
      '.VSCode/tasks.json',
    ])
      expect(await error('write_file', { path: p, content: '{}' }), p).toMatch(/configuração de ferramenta de IA ou do editor/);
    // o que só parece: `.github` fora de hooks e copilot, e um nome que contém o protegido sem ser ele
    expect(writeProtected(['.github', 'workflows', 'ci.yml'])).toBe(false);
    expect(writeProtected(['meu.codex', 'x'])).toBe(false);
    expect(
      (await runLocalTool(tool('write_file'), { path: '.github/workflows/ci.yml', content: 'x' }, ctx)).response.error,
    ).toBeUndefined();
  });

  it('as listas de proibidos não diferenciam maiúsculas onde o sistema não diferencia: .SSH, .AWS, .GIT', async () => {
    expect(within('/h/.ssh', '/h/.SSH/id_rsa', true)).toBe(true);
    expect(within('/h/.ssh', '/h/.SSH/id_rsa', false)).toBe(false);
    fs.mkdirSync(path.join(home, '.aws'));
    fs.writeFileSync(path.join(home, '.aws', 'credentials'), 'segredo');
    fs.mkdirSync(path.join(home, '.git'));
    fs.writeFileSync(path.join(home, '.git', 'config'), 'x');
    const inHome = { ...ctx, roots: realLocalRoots(home) };
    // num volume que diferencia maiúsculas, `.SSH` simplesmente não existe; no macOS e no Windows é o `.ssh`
    const folds = fs.existsSync(path.join(home, '.SSH'));
    for (const p of ['.SSH/id_rsa', '.AWS/credentials', '.Ssh/id_rsa']) {
      const refused = await error('read_file', { path: p }, inHome);
      expect(refused, p).toMatch(folds ? /segredo do computador/ : /Não existe/);
    }
    expect(await error('read_file', { path: '.GIT/config' }, inHome)).toMatch(folds ? /é do git/ : /Não existe/);
  });

  it('no Windows, o nome curto (~), o fluxo (:), o trecho com ponto ou espaço no fim e o caminho de dispositivo', () => {
    expect(windowsPathProblem('GIT~1/config')).toMatch(/nome curto/);
    expect(windowsPathProblem('a.txt:oculto')).toMatch(/fluxo/);
    expect(windowsPathProblem('.git::$INDEX_ALLOCATION/config')).toMatch(/fluxo/);
    expect(windowsPathProblem('.git./config')).toMatch(/ponto ou espaço/);
    expect(windowsPathProblem('.ssh /id_rsa')).toMatch(/ponto ou espaço/);
    expect(windowsPathProblem('\\\\?\\C:\\x')).toMatch(/dispositivo/);
    expect(windowsPathProblem('C:\\projeto\\src\\a.ts')).toBeNull();
    expect(windowsPathProblem('src/../a.ts')).toBeNull();
    // a recusa entra no confinamento quando o sistema é o Windows (aqui, simulado)
    expect(() => confinePath(ctx, 'GIT~1/config', 'read', 'win32')).toThrow(/nome curto/);
    expect(() => confinePath(ctx, 'a.txt:x', 'write', 'win32')).toThrow(/fluxo/);
    expect(confinePath(ctx, 'a.txt', 'read', 'win32').shown).toBe('a.txt');
  });
});

describe('arquivos: ler, buscar, escrever e editar, com limites', () => {
  it('read_file numera as linhas, aceita offset/limit e recusa binário e arquivo grande', async () => {
    const read = await runLocalTool(tool('read_file'), { path: 'a.txt', offset: 2, limit: 1 }, ctx);
    expect(read.response.output).toBe('     2\tdois\n[mais 2 linhas: use offset]');
    fs.writeFileSync(path.join(card, 'bin.dat'), Buffer.from([1, 0, 2]));
    expect(await error('read_file', { path: 'bin.dat' })).toMatch(/binário/);
    fs.writeFileSync(path.join(card, 'grande.txt'), 'x'.repeat(2000));
    expect(await error('read_file', { path: 'grande.txt' }, { ...ctx, limits: { fileBytes: 1000 } })).toMatch(/grande demais/);
    // o resultado longo é cortado com aviso
    const long = await runLocalTool(tool('read_file'), { path: 'grande.txt' }, { ...ctx, limits: { resultChars: 100 } });
    expect(long.response.output).toMatch(/\[cortado pelo board: \d+ caracteres a mais\]$/);
  });

  it('glob casa o padrão, pula o .git e não segue symlink de pasta', async () => {
    fs.mkdirSync(path.join(card, 'src', 'x'), { recursive: true });
    fs.writeFileSync(path.join(card, 'src', 'x', 'c.ts'), '');
    fs.writeFileSync(path.join(card, 'src', 'd.js'), '');
    fs.writeFileSync(path.join(card, '.git', 'e.ts'), '');
    fs.symlinkSync(path.join(dir, 'fora'), path.join(card, 'src', 'fora'));
    fs.writeFileSync(path.join(dir, 'fora', 'f.ts'), '');
    const found = await runLocalTool(tool('glob'), { pattern: '**/*.ts' }, ctx);
    expect(found.response.output).toBe('src/x/c.ts');
    // fora da pasta do card, o caminho aparece inteiro
    expect((await runLocalTool(tool('glob'), { pattern: '*.ts', path: extra }, ctx)).response.output).toBe(path.join(extra, 'b.ts'));
    expect(globMatcher('src/*.{js,ts}')('src/d.js')).toBe(true);
    expect(globMatcher('src/*.{js,ts}')('src/x/c.ts')).toBe(false);
  });

  it('o glob casa sem retrocesso: `**/` repetido e `*` repetido terminam rápido, na função e na ferramenta', async () => {
    const deep = `${'a/'.repeat(40)}b.ts`;
    const started = Date.now();
    // como expressão regular, cada um destes levava tempo exponencial na thread do editor
    expect(globMatcher(`${'**/'.repeat(20)}zz`)(deep)).toBe(false);
    expect(globMatcher(`${'*'.repeat(50)}z`)('a'.repeat(250))).toBe(false);
    expect(globMatcher(`${'**/'.repeat(20)}*.ts`)(deep)).toBe(true);
    expect(globMatcher('**/x/**/*.{js,ts}')('p/x/q/r/a.ts')).toBe(true);
    expect(globMatcher('[!a]*.ts')('b.ts')).toBe(true);
    expect(globMatcher('[!a]*.ts')('a.ts')).toBe(false);
    expect(globMatcher('*.TS', true)('x.ts')).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
    // pela ferramenta, numa árvore funda
    fs.mkdirSync(path.join(card, ...Array(15).fill('d')), { recursive: true });
    fs.writeFileSync(path.join(card, ...Array(15).fill('d'), 'f.txt'), '');
    const t0 = Date.now();
    expect((await runLocalTool(tool('glob'), { pattern: `${'**/'.repeat(20)}zz` }, ctx)).response.output).toBe(
      'Nenhum arquivo encontrado.',
    );
    expect(Date.now() - t0).toBeLessThan(2000);
    // o padrão fora dos limites volta como recusa
    expect(() => globMatcher('{a,b}'.repeat(10))).toThrow(GlobError);
    expect(await error('glob', { pattern: 'x'.repeat(2000) })).toMatch(/longo demais/);
  });

  it('grep busca linha a linha, e uma expressão que explode é encerrada no tempo limite sem travar o editor', async () => {
    const found = await runLocalTool(tool('grep'), { pattern: 'd[oO]is' }, ctx);
    expect(found.response.output).toBe('a.txt:2:dois');
    expect(await error('grep', { pattern: '(' })).toMatch(/Expressão inválida/);
    fs.writeFileSync(path.join(card, 'redos.txt'), `${'a'.repeat(40)}!`);
    const started = Date.now();
    expect(await error('grep', { pattern: '^(a+)+$', path: 'redos.txt' }, { ...ctx, limits: { grepMs: 300 } })).toMatch(/passou de 0.3 s/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it.skipIf(process.platform === 'win32')('grep num caminho que não é arquivo (FIFO) recusa sem ler', async () => {
    execFileSync('mkfifo', [path.join(card, 'fila')]);
    const started = Date.now();
    expect(await error('grep', { pattern: 'x', path: 'fila' }, { ...ctx, limits: { grepMs: 3000 } })).toBe(
      'Não é um arquivo nem uma pasta: fila',
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('write_file cria as pastas; edit_file exige o trecho único (ou replace_all) e recusa o que não existe', async () => {
    expect((await runLocalTool(tool('write_file'), { path: 'n/o/vo.txt', content: 'oi' }, ctx)).response.output).toBe(
      'Gravado: n/o/vo.txt (2 bytes).',
    );
    fs.writeFileSync(path.join(card, 'r.txt'), 'x x x');
    expect(await error('edit_file', { path: 'r.txt', old_string: 'x', new_string: 'y' })).toMatch(/aparece 3 vezes/);
    await runLocalTool(tool('edit_file'), { path: 'r.txt', old_string: 'x', new_string: '$&y', replace_all: true }, ctx);
    expect(fs.readFileSync(path.join(card, 'r.txt'), 'utf8')).toBe('$&y $&y $&y');
    expect(await error('edit_file', { path: 'r.txt', old_string: 'zzz', new_string: 'w' })).toMatch(/não está/);
    expect(await error('edit_file', { path: 'nao-existe.txt', old_string: 'a', new_string: 'b' })).toBe(
      'Não existe: nao-existe.txt (para criar, use write_file).',
    );
    expect(await error('write_file', { path: 'big.txt', content: 'x'.repeat(50) }, { ...ctx, limits: { writeBytes: 10 } })).toMatch(
      /grande demais para gravar/,
    );
  });
});

describe('run_command: sem shell, ambiente filtrado, tempo limite e Parar', () => {
  it('o ambiente do comando: só o que um programa precisa, sem a chave, sem nome de segredo, sem proxy com senha', () => {
    const env = commandEnv(
      {
        PATH: '/bin',
        HOME: '/h',
        LANG: 'C',
        GEMINI_API_KEY: 'k',
        GOOGLE_APPLICATION_CREDENTIALS: '/c',
        GITHUB_TOKEN: 't',
        ANTHROPIC_BASE_URL: 'x',
        FAZAI_RUN_TOKEN: 'r',
        CLAUDECODE: '1',
        HTTPS_PROXY: 'http://user:senha@proxy:8080',
        NO_PROXY: 'localhost',
        TMPDIR: '/tmp',
        QUALQUER: 'AIza-a-chave',
      },
      '/usr/bin:/bin',
      'AIza-a-chave',
    );
    expect(env).toEqual({ PATH: '/usr/bin:/bin', HOME: '/h', LANG: 'C', NO_PROXY: 'localhost', TMPDIR: '/tmp', GIT_TERMINAL_PROMPT: '0' });
  });

  it('o programa fora do PATH é recusado; a pasta do comando também é confinada; o tempo limite encerra', async () => {
    const run = (args: unknown, c: LocalToolContext = ctx) => runLocalTool(tool('run_command'), args, { ...c, pathEnv: process.env.PATH });
    expect((await run({ command: 'programa-que-nao-existe-faz-ai' })).response.error).toMatch(/Programa não encontrado/);
    expect((await run({ command: process.execPath, cwd: '../fora' })).response.error).toMatch(/Fora das pastas do card/);
    expect((await run({ command: process.execPath, args: 'não é lista' })).response.error).toMatch(/lista de textos/);
    const slow = await run({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], timeout_seconds: 0.3 });
    expect(slow.response).toMatchObject({ timed_out: expect.stringContaining('0.3 s') });
    expect(slow.failed).toBe(true);
    const ok = await run({ command: process.execPath, args: ['-e', 'process.stdout.write(process.cwd()); process.exit(3)'] });
    expect(ok.response).toMatchObject({ exit_code: 3, stdout: card });
    expect(ok.command).toBe('node');
  }, 20_000);

  it('a saída longa guarda o começo e o fim', async () => {
    const out = await runLocalTool(
      tool('run_command'),
      { command: process.execPath, args: ['-e', "process.stdout.write('A'.repeat(5000) + 'FIM')"] },
      { ...ctx, pathEnv: process.env.PATH, limits: { commandOutputChars: 300 } },
    );
    expect(out.response.stdout).toMatch(/^A+\n\[saída cortada pelo board: \d+ caracteres no meio\]\nA+FIM$/);
  });

  it('Parar no meio: a ferramenta lança LocalToolStopped e o processo acaba', async () => {
    const stop = new AbortController();
    const processes = new Set<import('node:child_process').ChildProcess>();
    const running = runLocalTool(
      tool('run_command'),
      { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
      { ...ctx, signal: stop.signal, pathEnv: process.env.PATH, processes },
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(processes.size).toBe(1);
    stop.abort();
    await expect(running).rejects.toBeInstanceOf(LocalToolStopped);
    expect(processes.size).toBe(0);
  });
});

describe('a decisão por nível, no vocabulário do card', () => {
  const exec = (tools: string[], deniedTools: string[] = []) => ({ tools, toolSet: 'explicit' as const, deniedTools });
  const ALL = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'];

  it('board lê; edits escreve; full roda comandos; a lista explícita e as negadas do card limitam', () => {
    expect(apiLocalTools('board', exec(ALL)).map((t) => t.fn)).toEqual(['read_file', 'glob', 'grep']);
    expect(apiLocalTools('edits', exec(ALL)).map((t) => t.fn)).toEqual(['read_file', 'glob', 'grep', 'write_file', 'edit_file']);
    expect(apiLocalTools('full', exec(ALL)).map((t) => t.card)).toEqual(ALL);
    // [] explícito é nenhuma ferramenta local
    expect(apiLocalTools('full', exec([]))).toEqual([]);
    expect(apiLocalTools('full', exec(ALL, ['Bash(git push *)', 'Glob'])).map((t) => t.card)).toEqual(['Read', 'Grep', 'Write', 'Edit']);
    expect(deniesTool('Bash(rm *)', 'Bash')).toBe(true);
  });

  it('a negação do card: sem maiúsculas, por grupo, no vocabulário do Gemini, e o desconhecido fecha', () => {
    // (a) sem diferenciar maiúsculas
    expect(deniedLocal('bash')).toEqual(['Bash']);
    expect(deniedLocal('EDIT')).toEqual(['Write', 'Edit']);
    // (b) grupo: Edit e Write tiram as duas de escrita; Read tira Glob e Grep; Bash tira o comando
    expect(apiLocalTools('full', exec(ALL, ['Edit'])).map((t) => t.fn)).toEqual(['read_file', 'glob', 'grep', 'run_command']);
    expect(apiLocalTools('full', exec(ALL, ['Write'])).map((t) => t.fn)).toEqual(['read_file', 'glob', 'grep', 'run_command']);
    expect(apiLocalTools('full', exec(ALL, ['Read'])).map((t) => t.fn)).toEqual(['write_file', 'edit_file', 'run_command']);
    expect(apiLocalTools('full', exec(ALL, ['Bash'])).map((t) => t.fn)).not.toContain('run_command');
    expect(deniedLocal('MultiEdit')).toEqual(['Write', 'Edit']);
    expect(deniedLocal('PowerShell')).toEqual(['Bash']);
    // (c) o vocabulário do Gemini CLI e o das funções locais
    expect(deniedLocal('run_shell_command')).toEqual(['Bash']);
    expect(deniedLocal('run_command')).toEqual(['Bash']);
    expect(deniedLocal('write_file')).toEqual(['Write', 'Edit']);
    expect(deniedLocal('replace')).toEqual(['Write', 'Edit']);
    expect(deniedLocal('edit_file')).toEqual(['Write', 'Edit']);
    expect(deniedLocal('read_file')).toEqual(['Read', 'Glob', 'Grep']);
    expect(deniedLocal('list_directory')).toEqual(['Glob']);
    expect(deniedLocal('search_file_content')).toEqual(['Grep']);
    expect(deniedLocal('grep_search')).toEqual(['Grep']);
    // o reconhecido de outro grupo não tira nada daqui
    for (const name of ['WebFetch', 'Agent', 'Task', 'web_fetch', 'mcp__docs__search', 'Skill'])
      expect(deniedLocal(name), name).toEqual([]);
    // (d) o desconhecido: null, e no laço nega todas as locais
    expect(deniedLocal('Bashful')).toBeNull();
    expect(deniedLocal('FerramentaInventada')).toBeNull();
    expect(apiLocalTools('full', exec(ALL, ['FerramentaInventada']))).toEqual([]);
  });

  it('a admissão do modo API lista as ferramentas locais pelo nível (a tabela do board, não a de uma CLI)', () => {
    const request = (permission: 'board' | 'edits' | 'full'): StrictExecutionRequest => ({
      version: 1,
      regime: 'exclusive',
      agentTools: {
        categories: permission === 'full' ? ['read', 'edit', 'run', 'net'] : permission === 'edits' ? ['read', 'edit'] : ['read'],
        native: { tool: '', allow: [], deny: [] },
      },
      boardTools: { mode: 'inherit' },
      activeMcpIds: [],
      allowedMcpIds: [],
      boardMcpIds: [],
      mcpServers: [],
      mcpTools: [],
      boardMcpTools: [],
      mcpLevel: { permission, tools: [] },
    });
    const tools = (p: 'board' | 'edits' | 'full', transport: 'api' | 'acp') =>
      admitExecution('generic', p, request(p), '', [], Date.now(), transport).tools;
    expect(tools('board', 'api')).toEqual(['Read', 'Glob', 'Grep']);
    expect(tools('edits', 'api')).toEqual(['Read', 'Glob', 'Grep', 'Write', 'Edit']);
    expect(tools('full', 'api')).toEqual(['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash']);
    // no ACP nada muda: o agente não tem tabela, e o board responde cada pedido pelo nível
    expect(tools('full', 'acp')).toEqual([]);
  });

  it('a conferência lê o inventário local no vocabulário do card: o liberado não é desvio, o não liberado é', () => {
    const report = {
      measure: 'full' as const,
      inventory: [
        { kind: 'tool' as const, name: 'Read', calls: 2 },
        { kind: 'tool' as const, name: 'Bash', calls: 1 },
      ],
    };
    const manifest = { skills: [], mcpServers: [], deniedTools: [], agent: '' };
    expect(checkRun(report, { ...manifest, tools: ['Read', 'Grep', 'Glob', 'Bash'] }, 'faz-ai')).toEqual({ status: 'ok' });
    expect(checkRun(report, { ...manifest, tools: ['Read', 'Grep', 'Glob'] }, 'faz-ai')).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'Bash', calls: 1 }],
    });
  });
});
