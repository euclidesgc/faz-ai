// RF01 e RF13 da #851: o board só escreve nas pastas das ferramentas (`~/.claude`, `.claude/`, `.cursor/`,
// `.kimi-code/`, `.mcp.json`) em "Conectar ao board" e no MCP temporário da execução. Biblioteca, marcação,
// agentes, skills e regras vivem no banco do board. Dois guardas: um estático (quais módulos do host podem
// escrever em pasta de ferramenta) e um de comportamento (as operações do painel não tocam nas pastas).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const SRC = path.resolve(__dirname, '../src');

/** Os únicos módulos do host que citam pasta de ferramenta e escrevem em arquivo: "Conectar ao board" e seus reparos. */
const CONNECT_WRITERS = [
  'extension/extension.ts', // instala a ponte e registra o board no `.cursor/mcp.json` do projeto
  'extension/mcp/clientConfig.ts', // registra o servidor do board em cada ferramenta
  'extension/mcp/pinCommands.ts', // grava o caminho completo do comando nos registros do board
  'extension/ai/capabilityVerifier.ts', // monta a fixture do verificador de isolamento numa pasta temporária (mkdtemp), nunca na da pessoa
];

const TOOL_FOLDER = /\.claude|\.cursor|\.kimi-code|\.mcp\.json/;
const FILE_WRITE = /\b(writeFileSync|appendFileSync|copyFileSync|cpSync|renameSync|rmSync|unlinkSync|writeFile|appendFile)\s*\(/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : e.name.endsWith('.ts') ? [p] : [];
  });
}

describe('nenhum código do board escreve na pasta de uma ferramenta fora de "Conectar ao board"', () => {
  it('só os módulos de conexão citam pasta de ferramenta e escrevem em arquivo', () => {
    const offenders = sources(SRC)
      .filter((f) => !f.includes(`${path.sep}webview${path.sep}`))
      .filter((f) => {
        const text = fs.readFileSync(f, 'utf8');
        return TOOL_FOLDER.test(text) && FILE_WRITE.test(text);
      })
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    expect(offenders).toEqual([...CONNECT_WRITERS].sort());
  });

  it('os módulos de varredura, de plugins e de instalação de skill na pasta da ferramenta não existem mais', () => {
    for (const gone of [
      'harnessScan',
      'harnessWatch',
      'harness',
      'agentFiles',
      'plugins',
      'skillMode',
      'harnessOps',
      'hooksAndPermissions',
    ])
      expect(fs.existsSync(path.join(SRC, 'extension', `${gone}.ts`)), gone).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'shared', 'kimiHooks.ts'))).toBe(false);
  });
});

let root: string;
let project: string;
let home: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-folders-')));
  project = path.join(root, 'projeto');
  home = path.join(root, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Todos os arquivos sob `dir`, com o conteúdo: a fotografia que o teste compara antes e depois. */
function tree(dir: string, base = dir): Record<string, string> {
  return Object.fromEntries(
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      // a biblioteca em disco do próprio board (cópias de leitura) não é pasta de ferramenta
      if (e.name === 'faz-ai-library') return [];
      const p = path.join(dir, e.name);
      return e.isDirectory() ? Object.entries(tree(p, base)) : [[path.relative(base, p), fs.readFileSync(p, 'utf8')]];
    }),
  );
}

describe('as operações do painel não tocam nas pastas das ferramentas', () => {
  it('criar, editar, marcar e apagar skills, regras, agentes e servidores só mexe no banco do board', async () => {
    // arquivos que já existiam nas pastas das ferramentas: o board não pode alterá-los nem somar ao lado
    const seed = {
      [path.join(project, 'CLAUDE.md')]: '# Regras\n',
      [path.join(project, '.mcp.json')]: JSON.stringify({ mcpServers: { github: { command: 'gh' } } }),
      [path.join(project, '.claude', 'skills', 'velha', 'SKILL.md')]: '---\nname: velha\ndescription: d\n---\n',
      [path.join(project, '.cursor', 'rules', 'estilo.mdc')]: 'estilo\n',
      [path.join(home, '.claude', 'agents', 'antigo.md')]: '---\nname: antigo\ndescription: d\n---\n\ncorpo\n',
      [path.join(home, '.kimi-code', 'config.toml')]: '# kimi\n',
    };
    for (const [file, content] of Object.entries(seed)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const beforeProject = tree(project);
    const beforeHome = tree(home);

    const db = await openInMemory(WASM_DIR);
    const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws-folders',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(root, 'attachments'),
      workspaceDir: project,
      homeDir: home,
      seedAgents: true,
    });

    router.handle({
      type: 'harness.artifact.save',
      kind: 'skill',
      name: 'nova',
      body: '---\nname: nova\ndescription: d\n---\n\nc\n',
    });
    router.handle({ type: 'harness.artifact.save', kind: 'rule', name: 'regras-novas', body: '# nova regra\n' });
    router.handle({
      type: 'harness.agent.create',
      input: { name: 'revisor', description: 'd', body: 'Revise.', model: '', tools: [], deniedTools: [], skills: [], mcp: [] },
    });
    router.handle({
      type: 'harness.library.save',
      input: { kind: 'mcp', name: 'local', description: '', body: '', server: { command: 'x' } },
    });
    // marca o que existe nas pastas das ferramentas: vira cópia no banco, sem escrever de volta
    router.handle({
      type: 'harness.selection.set',
      items: [
        { kind: 'skill', location: '.claude/skills/velha/SKILL.md' },
        { kind: 'agent', location: '~/.claude/agents/antigo.md' },
        { kind: 'mcp', location: '.mcp.json#github' },
      ],
      usage: 'contextual',
    });
    router.handle({ type: 'harness.agent.delete', name: 'revisor', scope: 'project' });
    router.refreshHarness();

    // o banco tem as cópias; as pastas das ferramentas ficaram exatamente como estavam
    const names = (router.snapshot().harness.library?.artifacts ?? []).map((a) => `${a.kind}:${a.name}`);
    expect(names).toEqual(expect.arrayContaining(['skill:velha', 'agent:antigo', 'mcp:github', 'mcp:local', 'rule:regras-novas']));
    expect(tree(project)).toEqual(beforeProject);
    expect(tree(home)).toEqual(beforeHome);
    db.close();
  });
});
