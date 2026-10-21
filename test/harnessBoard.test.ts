// O banco de artefatos do board: modos (Sempre, Pelo card, Desligado), servidores MCP no board, regras
// que entram desligadas, pastas importadas e a migração que abre a marcação para isso.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import { scanInventory } from '../src/extension/harnessScan';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { catalogLines, refineCatalog } from '../src/extension/promptContext';
import { bareExec, executionPlan } from '../src/extension/execution';
import { parseSuggestions } from '../src/extension/chat';
import { manifestOf } from '../src/shared/execution';
import type { HarnessItem } from '../src/shared/harness';
import {
  defaultUsage,
  missingSelections,
  selectedItems,
  selectedMcpNames,
  selectionKey,
  usageOf,
  usageOptions,
} from '../src/shared/harnessSelection';
import { boardState, card } from './fakes/board';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
import type { HostToWebview } from '../src/shared/messages';
import type { McpServerInput } from '../src/shared/harnessCatalog';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const item = (over: Partial<HarnessItem> & Pick<HarnessItem, 'kind' | 'name' | 'location'>): HarnessItem => ({
  scope: 'project',
  description: '',
  path: `/abs/${over.location}`,
  layout: 'file',
  ...over,
});

describe('modos dos artefatos no board', () => {
  it('cada tipo expõe só os modos que fazem sentido; regras entram desligadas e o resto pelo card', () => {
    expect(usageOptions('instructions')).toEqual(['off', 'contextual', 'always']);
    expect(usageOptions('skill')).toEqual(['contextual', 'always']);
    expect(usageOptions('mcp')).toEqual(['contextual', 'always']);
    expect(usageOptions('agent')).toEqual(['contextual']);
    expect(defaultUsage('instructions')).toBe('off');
    expect(defaultUsage('skill')).toBe('contextual');
    expect(defaultUsage('mcp')).toBe('contextual');
  });

  it('um servidor MCP é identificado pelo arquivo mais o nome: dois servidores do mesmo arquivo não se confundem', () => {
    const github = item({ kind: 'mcp', name: 'github', location: '.mcp.json', layout: 'entry' });
    const slack = item({ kind: 'mcp', name: 'slack', location: '.mcp.json', layout: 'entry' });
    expect(selectionKey(github)).toBe('.mcp.json#github');
    expect(selectionKey(item({ kind: 'skill', name: 'x', location: '.claude/skills/x/SKILL.md', layout: 'skills' }))).toBe(
      '.claude/skills/x/SKILL.md',
    );
    const selection = [{ kind: 'mcp' as const, location: '.mcp.json#github', usage: 'always' as const }];
    expect(usageOf(selection, github)).toBe('always');
    expect(usageOf(selection, slack)).toBeNull();
  });

  it('selectedItems sem modo traz tudo que está no board, inclusive o desligado; com modo, só aquele', () => {
    const s = boardState({
      harness: {
        rules: [],
        skills: [],
        agents: [],
        inventory: [
          {
            tool: 'claude',
            installed: true,
            items: [
              item({ kind: 'instructions', name: 'CLAUDE.md', location: 'CLAUDE.md' }),
              item({ kind: 'instructions', name: 'estilo', location: '.claude/rules/estilo.md', layout: 'files' }),
              item({ kind: 'mcp', name: 'github', location: '.mcp.json', layout: 'entry' }),
              item({ kind: 'mcp', name: 'faz-ai', location: '.mcp.json', layout: 'entry' }),
            ],
          },
        ],
      },
      harnessSelection: [
        { kind: 'instructions', location: 'CLAUDE.md', usage: 'off' },
        { kind: 'instructions', location: '.claude/rules/estilo.md', usage: 'always' },
        { kind: 'mcp', location: '.mcp.json#github', usage: 'contextual' },
        { kind: 'mcp', location: '.mcp.json#faz-ai', usage: 'always' },
        { kind: 'skill', location: '/sumiu/SKILL.md', usage: 'contextual' },
      ],
    });
    expect(selectedItems(s, 'instructions').map((i) => i.location)).toEqual(['CLAUDE.md', '.claude/rules/estilo.md']);
    expect(selectedItems(s, 'instructions', 'always').map((i) => i.location)).toEqual(['.claude/rules/estilo.md']);
    expect(selectedItems(s, 'instructions', 'off').map((i) => i.location)).toEqual(['CLAUDE.md']);
    // o servidor do board vai sempre: não conta como marcação
    expect(selectedMcpNames(s, 'contextual')).toEqual(['github']);
    expect(selectedMcpNames(s, 'always')).toEqual([]);
    expect(missingSelections(s)).toEqual([{ kind: 'skill', location: '/sumiu/SKILL.md', usage: 'contextual' }]);
  });
});

describe('servidores MCP na execução do card', () => {
  const state = () =>
    boardState({
      harness: {
        rules: [],
        skills: [],
        agents: [],
        inventory: [
          {
            tool: 'claude',
            installed: true,
            items: [
              item({ kind: 'mcp', name: 'github', location: '.mcp.json', layout: 'entry', path: '/p/.mcp.json' }),
              item({ kind: 'mcp', name: 'memoria', location: '.mcp.json', layout: 'entry', path: '/p/.mcp.json' }),
              item({ kind: 'mcp', name: 'faz-ai', location: '.mcp.json', layout: 'entry', path: '/p/.mcp.json' }),
              item({ kind: 'mcp', name: 'sql', location: '~/.claude.json', layout: 'entry', path: '/h/.claude.json' }),
            ],
          },
        ],
      },
      harnessSelection: [
        { kind: 'mcp', location: '.mcp.json#memoria', usage: 'always' },
        { kind: 'mcp', location: '.mcp.json#faz-ai', usage: 'always' },
        { kind: 'mcp', location: '.mcp.json#github', usage: 'contextual' },
        { kind: 'mcp', location: '~/.claude.json#sql', usage: 'contextual' },
      ],
      fieldDefs: [
        {
          id: 'f-mcps',
          boardId: 'b',
          name: 'MCPs',
          kind: 'multiselect',
          options: ['github', 'sql'],
          appliesToTypes: null,
          display: 'chip',
          position: 0,
        },
      ],
      cards: [card('c')],
      fieldValues: [{ cardId: 'c', fieldId: 'f-mcps', value: ['github'] }],
    });

  it('o card recebe os servidores do campo MCPs e os do board em modo Sempre; o do board nunca entra na lista', () => {
    const m = manifestOf(state(), card('c'));
    expect(m.mcpServers.sort()).toEqual(['github', 'memoria']);
  });

  it('o catálogo do refinar lista só os servidores Pelo card e avisa o que já vai sempre', () => {
    const c = refineCatalog(state());
    expect(c.mcps.map((m) => m.name)).toEqual(['github', 'sql']);
    expect(c.always).toEqual([{ kind: 'mcp', name: 'memoria' }]);
    const lines = catalogLines(c).join('\n');
    expect(lines).toContain('campo MCPs');
    expect(lines).toContain('mcp memoria');
    expect(lines).toContain('uma skill por assunto');
  });

  it('no Claude Code, um servidor Sempre entra no arquivo de configuração da execução, com a definição guardada no board', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-mcp-plan-'));
    try {
      // a definição na pasta da ferramenta não é lida: vale a do board, e o servidor do board é o da execução
      fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { memoria: { command: 'da-ferramenta' } } }));
      const s = state();
      for (const i of s.harness.inventory[0]!.items) i.path = path.join(root, '.mcp.json');
      const defs = { memoria: { command: 'mem' }, github: { command: 'gh' }, 'faz-ai': { command: 'old' } };
      const plan = executionPlan(s, card('c'), defs, { command: 'node', args: ['b.js'] });
      const config = JSON.parse(plan.input.mcpConfig!).mcpServers;
      expect(Object.keys(config).sort()).toEqual(['faz-ai', 'github', 'memoria']);
      expect(config.memoria).toEqual({ command: 'mem' });
      expect(config['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: ['b.js'] });
      expect(plan.input.mcpBlocked).toEqual(['sql']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('pastas importadas', () => {
  let root: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-import-')));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const write = (rel: string, content: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  it('a varredura encontra na pasta o que a ferramenta reconhece num projeto, e a própria pasta como pasta de skills', () => {
    write('colecao/.claude/skills/sql/SKILL.md', '---\nname: sql\ndescription: Consultas SQL\n---\n');
    write('colecao/.claude/agents/revisor.md', '---\nname: revisor\ndescription: Revisa\n---\n');
    write('colecao/.mcp.json', JSON.stringify({ mcpServers: { postgres: { command: 'pg-mcp' } } }));
    write('colecao/CLAUDE.md', '# Regras da coleção');
    write('so-skills/navegar/SKILL.md', '---\nname: navegar\ndescription: Navega\n---\n');
    fs.mkdirSync(path.join(root, 'projeto'));
    const items = scanInventory('claude', path.join(root, 'projeto'), '', undefined, null, [
      path.join(root, 'colecao'),
      path.join(root, 'so-skills'),
      path.join(root, 'nao-existe'),
    ]);
    const imported = items.filter((i) => i.scope === 'imported');
    expect(imported.map((i) => [i.kind, i.name]).sort()).toEqual([
      ['agent', 'revisor'],
      ['instructions', 'CLAUDE.md'],
      ['mcp', 'postgres'],
      ['skill', 'navegar'],
      ['skill', 'sql'],
    ]);
    // a identidade é o caminho absoluto: fora do projeto e da home, é o que o inventário mostra
    expect(imported.find((i) => i.name === 'sql')!.location).toBe(path.join(root, 'colecao/.claude/skills/sql/SKILL.md'));
    expect(items.filter((i) => i.scope === 'project')).toEqual([]);
  });

  it('importar e tirar uma pasta pelo roteador preserva as cópias já adicionadas ao board', async () => {
    write('colecao/.claude/skills/sql/SKILL.md', '---\nname: sql\ndescription: Consultas SQL\n---\n');
    fs.mkdirSync(path.join(root, 'projeto'));
    const db = await openInMemory(WASM_DIR);
    const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(root, 'attachments'),
      workspaceDir: path.join(root, 'projeto'),
      homeDir: path.join(root, 'home'),
    });
    expect(() => router.handle({ type: 'harness.import.add', tool: 'claude', dir: path.join(root, 'nao-existe') })).toThrow(
      'Pasta não encontrada',
    );
    router.handle({ type: 'harness.import.add', tool: 'claude', dir: path.join(root, 'colecao') });
    let s = router.snapshot();
    expect(s.harnessImports).toEqual([{ tool: 'claude', dir: path.join(root, 'colecao') }]);
    const skill = s.harness.inventory.find((t) => t.tool === 'claude')!.items.find((i) => i.name === 'sql')!;
    expect(skill.scope).toBe('imported');
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'skill', location: selectionKey(skill) }], usage: 'contextual' });
    s = router.snapshot();
    expect(s.fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['sql']);
    // A pasta sai do catálogo; a cópia particular continua disponível.
    router.handle({ type: 'harness.import.remove', tool: 'claude', dir: path.join(root, 'colecao') });
    s = router.snapshot();
    expect(s.harnessImports).toEqual([]);
    expect(s.harnessSelection).toHaveLength(1);
    expect(s.fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['sql']);
  });
});

describe('migração 29 → 30 (banco de artefatos)', () => {
  it('mantém a marcação, aceita mcp e off, cria as pastas importadas e o campo MCPs', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const db = new SQL.Database();
    migrate(db, 29);
    db.run(`
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto');
      INSERT INTO harness_selection (board_id, kind, location, usage) VALUES ('b', 'skill', '.claude/skills/x/SKILL.md', 'always');
      INSERT INTO harness_selection (board_id, kind, location, usage) VALUES ('b', 'agent', '~/.claude/agents/a.md', 'contextual');
    `);
    expect(() => db.run("INSERT INTO harness_selection VALUES ('b', 'mcp', '.mcp.json#x', 'contextual')")).toThrow();

    migrate(db);

    expect(db.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(db.exec('SELECT kind, location, usage FROM harness_selection ORDER BY kind')[0]!.values).toEqual([
      ['agent', '~/.claude/agents/a.md', 'contextual'],
      ['skill', '.claude/skills/x/SKILL.md', 'always'],
    ]);
    db.run("INSERT INTO harness_selection VALUES ('b', 'mcp', '.mcp.json#x', 'contextual')");
    db.run("INSERT INTO harness_selection VALUES ('b', 'instructions', 'CLAUDE.md', 'off')");
    db.run("INSERT INTO harness_imports VALUES ('b', 'claude', '/tmp/colecao')");
    expect(db.exec("SELECT name FROM field_defs WHERE board_id = 'b'")[0]!.values).toEqual([['MCPs']]);
    // apagar o board leva a marcação e as pastas junto
    db.run('PRAGMA foreign_keys = ON');
    db.run("DELETE FROM boards WHERE id = 'b'");
    expect(db.exec('SELECT count(*) FROM harness_selection')[0]!.values[0]![0]).toBe(0);
    expect(db.exec('SELECT count(*) FROM harness_imports')[0]!.values[0]![0]).toBe(0);
  });
});

describe('revisão: o que a pilha corrigiu', () => {
  it('o card só leva o que está no board: skill, rule e servidor que saíram (ou passaram a Desligado) ficam de fora sem erro', () => {
    const s = boardState({
      harness: {
        rules: [],
        skills: [],
        agents: [],
        inventory: [
          {
            tool: 'claude',
            installed: true,
            items: [
              item({ kind: 'skill', name: 'sql', location: '.claude/skills/sql/SKILL.md', layout: 'skills' }),
              item({ kind: 'instructions', name: 'CLAUDE.md', location: 'CLAUDE.md' }),
              item({ kind: 'mcp', name: 'github', location: '.mcp.json', layout: 'entry' }),
            ],
          },
        ],
      },
      harnessSelection: [
        { kind: 'skill', location: '.claude/skills/sql/SKILL.md', usage: 'contextual' },
        { kind: 'instructions', location: 'CLAUDE.md', usage: 'off' },
      ],
      fieldDefs: [
        {
          id: 'f-skills',
          boardId: 'b',
          name: 'Skills',
          kind: 'multiselect',
          options: [],
          appliesToTypes: null,
          display: 'chip',
          position: 0,
        },
        {
          id: 'f-rules',
          boardId: 'b',
          name: 'Rules',
          kind: 'multiselect',
          options: [],
          appliesToTypes: null,
          display: 'chip',
          position: 1,
        },
        { id: 'f-mcps', boardId: 'b', name: 'MCPs', kind: 'multiselect', options: [], appliesToTypes: null, display: 'chip', position: 2 },
      ],
      cards: [card('c')],
      fieldValues: [
        { cardId: 'c', fieldId: 'f-skills', value: ['sql', 'sumiu'] },
        { cardId: 'c', fieldId: 'f-rules', value: ['CLAUDE.md'] },
        { cardId: 'c', fieldId: 'f-mcps', value: ['github'] },
      ],
    });
    const m = manifestOf(s, card('c'));
    expect(m.skills).toEqual(['sql']);
    expect(m.rules).toEqual([]);
    expect(m.mcpServers).toEqual([]);
  });

  it('parseSuggestions aceita texto com chaves depois do JSON', () => {
    expect(parseSuggestions('{"items":[{"key":"a","reason":"r"}]}\nObs.: {x}', ['a'])).toEqual([{ location: 'a', reason: 'r' }]);
  });

  it('o chat leva os servidores do board em modo Sempre, com a definição guardada no board; sem definição, fica de fora', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-bare-'));
    try {
      // o arquivo em que a varredura achou o servidor não é lido pela execução
      fs.writeFileSync(path.join(root, 'col.json'), JSON.stringify({ mcpServers: { memoria: { command: 'do-arquivo' } } }));
      const s = boardState({
        harness: {
          rules: [],
          skills: [],
          agents: [],
          inventory: [
            {
              tool: 'claude',
              installed: true,
              items: [
                item({
                  kind: 'mcp',
                  name: 'memoria',
                  location: path.join(root, 'col.json'),
                  layout: 'entry',
                  scope: 'imported',
                  path: path.join(root, 'col.json'),
                }),
                item({ kind: 'mcp', name: 'fantasma', location: '.mcp.json', layout: 'entry', path: path.join(root, 'nao-existe.json') }),
              ],
            },
          ],
        },
        harnessSelection: [
          { kind: 'mcp', location: `${path.join(root, 'col.json')}#memoria`, usage: 'always' },
          { kind: 'mcp', location: '.mcp.json#fantasma', usage: 'always' },
        ],
      });
      const plan = bareExec(null, { command: 'node', args: ['b.js'] }, s, { memoria: { command: 'mem' } });
      expect(plan.mcpAllowed).toEqual(['memoria']);
      expect(Object.keys(JSON.parse(plan.mcpConfig!).mcpServers).sort()).toEqual(['faz-ai', 'memoria']);
      expect(JSON.parse(plan.mcpConfig!).mcpServers.memoria).toEqual({ command: 'mem' });
      // sem estado, só o servidor do board, como antes
      expect(JSON.parse(bareExec(null, { command: 'node', args: [] }).mcpConfig!).mcpServers).toEqual({
        'faz-ai': { type: 'stdio', command: 'node', args: [] },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('tirar a pasta importada apaga a marcação dos artefatos dela, em qualquer separador', async () => {
    const db = await openInMemory(WASM_DIR);
    const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'P',
      author: 'Pessoa',
      attachmentsDir: path.join(os.tmpdir(), 'fazai-att-x'),
    });
    const boardId = router.snapshot().board.id;
    new BoardRepo(db).setSelection(
      boardId,
      [
        { kind: 'skill', location: '/col/web/SKILL.md' },
        { kind: 'skill', location: '/colecao/x/SKILL.md' },
        { kind: 'mcp', location: 'C:\\col\\.mcp.json#github' },
      ],
      'contextual',
    );
    new BoardRepo(db).removeImport(boardId, 'claude', '/col');
    // a marcação sai ordenada por tipo (mcp antes de skill) e caminho
    expect(router.snapshot().harnessSelection.map((x) => x.location)).toEqual(['C:\\col\\.mcp.json#github', '/colecao/x/SKILL.md']);
    new BoardRepo(db).removeImport(boardId, 'claude', 'C:\\col');
    expect(router.snapshot().harnessSelection.map((x) => x.location)).toEqual(['/colecao/x/SKILL.md']);
  });
});

describe('handlers do host: artefatos direto no board (#668)', () => {
  let root: string;
  let router: MessageRouter;
  let bridge: HostBridge;
  let sent: HostToWebview[];
  let handle: Awaited<ReturnType<typeof openInMemory>>;
  const field = (name: string) => router.snapshot().fieldDefs.find((f) => f.name === name)!.options;
  const put = (rel: string, content: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  const dump = (dir: string): string[] =>
    fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).map((e) => path.join(e.parentPath, e.name)) : [];
  const stdio = (over: Partial<McpServerInput> = {}): McpServerInput => ({
    name: 'x',
    transport: 'stdio',
    command: 'memoria',
    args: [],
    env: { TOKEN: 'segredo-1' },
    url: '',
    headers: {},
    ...over,
  });

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-handlers-')));
    fs.mkdirSync(path.join(root, 'projeto'));
    fs.mkdirSync(path.join(root, 'home'));
    handle = await openInMemory(WASM_DIR);
    router = new MessageRouter({ db: handle, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(root, 'attachments'),
      libraryDir: path.join(root, 'library'),
      workspaceDir: path.join(root, 'projeto'),
      homeDir: path.join(root, 'home'),
    });
    sent = [];
    const store = { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never;
    bridge = new HostBridge((m) => sent.push(m), router, store, store, {
      attachmentsBaseUri: () => '',
      pickFolder: async () => path.join(root, 'colecao'),
      pickBackupFile: async () => path.join(root, 'export.json'),
    } as unknown as HostEnv);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const read = async (kind: 'rule' | 'skill' | 'mcp', name: string, file?: string) => {
    sent.length = 0;
    await bridge.handle({ type: 'harness.artifact.read', requestId: 'r1', kind, name, ...(file ? { file } : {}) });
    return sent.find((m) => m.type === 'harness.artifact.readResult') as Extract<HostToWebview, { type: 'harness.artifact.readResult' }>;
  };

  it('cria, edita e lê regra, skill e MCP, e as opções dos campos acompanham (RF20)', async () => {
    router.handle({ type: 'harness.artifact.save', kind: 'rule', name: 'estilo', body: 'use tabs' });
    router.handle({ type: 'harness.artifact.save', kind: 'skill', name: 'revisar', body: '---\nname: revisar\ndescription: Revisa\n---\nPassos' });
    router.handle({ type: 'harness.artifact.save', kind: 'mcp', name: 'memoria', server: stdio() });
    expect(field('Skills')).toEqual(['revisar']);
    expect(field('MCPs')).toEqual(['memoria']);
    expect(field('Rules')).toContain('estilo');

    router.handle({ type: 'harness.artifact.save', kind: 'rule', name: 'estilo', body: 'use espaços' });
    expect((await read('rule', 'estilo')).text).toBe('use espaços');
    expect((await read('skill', 'revisar')).text).toContain('Passos');

    router.handle({ type: 'harness.artifact.save', kind: 'skill', name: 'revisar-2', previous: 'revisar', body: '---\nname: revisar-2\ndescription: Revisa\n---\nPassos' });
    expect(field('Skills')).toEqual(['revisar-2']);

    const mcp = await read('mcp', 'memoria');
    expect(mcp.server).toMatchObject({ command: 'memoria', env: { TOKEN: '' } });
    expect(JSON.stringify(mcp)).not.toContain('segredo-1');
    router.handle({ type: 'harness.artifact.save', kind: 'mcp', name: 'memoria', server: stdio({ args: ['--v'], env: { TOKEN: '' } }), keepSecrets: ['TOKEN'] });
    expect(JSON.stringify(router.snapshot())).not.toContain('segredo-1');
    expect(JSON.stringify(router.libraryMcpDefinitions())).toContain('segredo-1');

    expect((await read('rule', 'nao-existe')).error).toBe('Artefato não encontrado.');
    expect(() => router.handle({ type: 'harness.artifact.save', kind: 'rule', name: 'Nome Ruim', body: '' })).toThrow(/inválido/);
    expect(() => router.handle({ type: 'harness.artifact.save', kind: 'mcp', name: 'faz-ai', server: stdio() })).toThrow(/reservado/);
    expect(() => router.handle({ type: 'harness.artifact.save', kind: 'mcp', name: 'y', server: stdio() }, { source: 'ai' })).toThrow(/revisão humana/);
    // nada foi para o projeto nem para as pastas das ferramentas
    expect(dump(path.join(root, 'projeto'))).toEqual([]);
    expect(dump(path.join(root, 'home'))).toEqual([]);
  });

  it('arquivos de apoio da skill: gravar, ler, trocar e apagar', async () => {
    router.handle({ type: 'harness.artifact.save', kind: 'skill', name: 'docs', body: '---\nname: docs\ndescription: D\n---\n' });
    router.handle({ type: 'harness.skillFile.write', skill: 'docs', file: 'references/a.md', content: 'um' });
    expect((await read('skill', 'docs', 'references/a.md')).text).toBe('um');
    router.handle({ type: 'harness.skillFile.write', skill: 'docs', file: 'references/a.md', content: 'dois' });
    expect((await read('skill', 'docs', 'references/a.md')).text).toBe('dois');
    expect(() => router.handle({ type: 'harness.skillFile.write', skill: 'docs', file: '../fora.md', content: 'x' })).toThrow(/inválido/);
    router.handle({ type: 'harness.skillFile.delete', skill: 'docs', file: 'references/a.md' });
    expect((await read('skill', 'docs', 'references/a.md')).error).toBe('Arquivo de apoio não encontrado.');
    expect(dump(path.join(root, 'projeto'))).toEqual([]);
    expect(dump(path.join(root, 'home'))).toEqual([]);
  });

  it('importar de pasta: prévia no estado, pular o repetido, substituir, aviso e cancelar', async () => {
    put('colecao/.claude/skills/sql/SKILL.md', '---\nname: sql\ndescription: SQL\n---\nv2');
    put('colecao/CLAUDE.md', '# Regras');
    router.handle({ type: 'harness.artifact.save', kind: 'skill', name: 'sql', body: '---\nname: sql\ndescription: SQL\n---\nv1' });
    await bridge.handle({ type: 'harness.import.pick', what: 'folder' });
    const preview = router.snapshot().artifactImport!;
    expect(preview.candidates.map((c) => [c.kind, c.name, c.exists]).sort()).toEqual([
      ['rule', 'CLAUDE.md', false],
      ['skill', 'sql', true],
    ]);

    sent.length = 0;
    await bridge.handle({ type: 'harness.import.apply', keys: preview.candidates.map((c) => c.key), onConflict: 'skip' });
    expect(sent.find((m) => m.type === 'notice')).toMatchObject({ message: expect.stringContaining('Importados: CLAUDE.md. Pulados: sql.') });
    expect((await read('skill', 'sql')).text).toContain('v1');
    expect((await read('rule', 'CLAUDE.md')).text).toBe('# Regras');
    expect(router.snapshot().artifactImport).toBeNull();

    await bridge.handle({ type: 'harness.import.scan', source: { from: 'folder', path: path.join(root, 'colecao') } });
    const again = router.snapshot().artifactImport!;
    await bridge.handle({ type: 'harness.import.apply', keys: again.candidates.map((c) => c.key), onConflict: 'replace' });
    expect((await read('skill', 'sql')).text).toContain('v2');

    await bridge.handle({ type: 'harness.import.scan', source: { from: 'folder', path: path.join(root, 'colecao') } });
    expect(router.snapshot().artifactImport).not.toBeNull();
    router.handle({ type: 'harness.import.cancel' });
    expect(router.snapshot().artifactImport).toBeNull();
    await expect(bridge.handle({ type: 'harness.import.scan', source: { from: 'folder', path: path.join(root, 'vazia') } })).resolves.toBeUndefined();
    expect(sent.some((m) => m.type === 'error')).toBe(true);
    expect(field('Skills')).toEqual(['sql']);
    expect(dump(path.join(root, 'projeto'))).toEqual([]);
    expect(dump(path.join(root, 'home'))).toEqual([]);
  });
});
