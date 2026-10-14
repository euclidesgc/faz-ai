import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { HostBridge, exportNotice, importNotice, type HostEnv } from '../src/extension/host/hostBridge';
import { parseExportFile } from '../src/extension/db/boardExport';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { HARNESS_CATALOG } from '../src/shared/harnessCatalog';
import type { HostToWebview } from '../src/shared/messages';

let router: MessageRouter;
let sent: HostToWebview[];
let env: HostEnv;
let shown: string[];
let bridge: HostBridge;
let saves: number;
let rawDb: Awaited<ReturnType<typeof openInMemory>>;
let dir: string;

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-bridge-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  rawDb = db;
  saves = 0;
  router = new MessageRouter({ db, scheduleSave: () => void saves++, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  sent = [];
  shown = [];
  env = { showChat: () => void shown.push('chat'), attachmentsBaseUri: () => '' } as unknown as HostEnv;
  bridge = new HostBridge((m) => sent.push(m), router, { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never, env);
});

describe('HostBridge: done (confirmação por requestId)', () => {
  it('mensagem com requestId recebe done ok depois do boardState; sem requestId, nada muda', async () => {
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const create = {
      type: 'card.create' as const,
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'Com confirmação',
    };
    await bridge.handle({ ...create, requestId: 'q1' });
    expect(sent.slice(-2).map((m) => m.type)).toEqual(['boardState', 'done']);
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 'q1', ok: true });

    await bridge.handle({ ...create, title: 'Sem confirmação' });
    expect(sent.at(-1)!.type).toBe('boardState');
  });

  it('handler que lança vira o toast de erro e o done com ok:false e a mesma mensagem', async () => {
    await bridge.handle({ type: 'chat.send', text: 'oi', model: null, requestId: 'q2' });
    expect(sent.slice(-2)).toEqual([
      { type: 'error', message: 'O chat não está disponível neste board.' },
      { type: 'done', requestId: 'q2', ok: false, error: 'O chat não está disponível neste board.' },
    ]);
  });

  it('leitura com resposta própria correlacionada não ganha done por cima', async () => {
    await bridge.handle({ type: 'card.usage.query', requestId: 'u9', cardId: 'nada' });
    expect(sent.filter((m) => m.type === 'done')).toEqual([]);
    expect(sent.at(-1)!.type).toBe('card.usage.result');
  });

  it('a falha de uma tarefa em segundo plano chega à interface como erro', () => {
    router.reportError('A conferência do ambiente falhou: CLI não respondeu.');
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'A conferência do ambiente falhou: CLI não respondeu.' });
  });
});

describe('HostBridge: done (confirmação por requestId)', () => {
  it('mensagem com requestId recebe done ok depois do boardState; sem requestId, nada muda', async () => {
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const create = {
      type: 'card.create' as const,
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'Com confirmação',
    };
    await bridge.handle({ ...create, requestId: 'q1' });
    expect(sent.slice(-2).map((m) => m.type)).toEqual(['boardState', 'done']);
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 'q1', ok: true });

    await bridge.handle({ ...create, title: 'Sem confirmação' });
    expect(sent.at(-1)!.type).toBe('boardState');
  });

  it('handler que lança vira o toast de erro e o done com ok:false e a mesma mensagem', async () => {
    await bridge.handle({ type: 'chat.send', text: 'oi', model: null, requestId: 'q2' });
    expect(sent.slice(-2)).toEqual([
      { type: 'error', message: 'O chat não está disponível neste board.' },
      { type: 'done', requestId: 'q2', ok: false, error: 'O chat não está disponível neste board.' },
    ]);
  });

  it('leitura com resposta própria correlacionada não ganha done por cima', async () => {
    await bridge.handle({ type: 'card.usage.query', requestId: 'u9', cardId: 'nada' });
    expect(sent.filter((m) => m.type === 'done')).toEqual([]);
    expect(sent.at(-1)!.type).toBe('card.usage.result');
  });

  it('a falha de uma tarefa em segundo plano chega à interface como erro', () => {
    router.reportError('A conferência do ambiente falhou: CLI não respondeu.');
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'A conferência do ambiente falhou: CLI não respondeu.' });
  });
});

describe('HostBridge: chat', () => {
  it('as mensagens do chat vão à sessão registrada no roteador', async () => {
    const got: unknown[] = [];
    router.setChatHandler((m) => void got.push(m));
    await bridge.handle({ type: 'chat.send', text: 'oi', model: null });
    await bridge.handle({ type: 'chat.stop' });
    await bridge.handle({ type: 'chat.clear' });
    expect(got).toEqual([{ type: 'chat.send', text: 'oi', model: null }, { type: 'chat.stop' }, { type: 'chat.clear' }]);
  });

  it('sem sessão de chat, o webview recebe o erro em vez de nada', async () => {
    await bridge.handle({ type: 'chat.send', text: 'oi', model: null });
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'O chat não está disponível neste board.' });
  });

  it('ui.showChat pede ao editor para mostrar o chat', async () => {
    await bridge.handle({ type: 'ui.showChat' });
    expect(shown).toEqual(['chat']);
  });
});

describe('HostBridge: harness.file.read / harness.file.write', () => {
  const result = () => sent.at(-1) as { content?: string; readonly?: boolean; error?: string; ok?: boolean };

  it('lê e grava um arquivo que a varredura listou, e relê o harness', async () => {
    fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
    const rule = path.join(dir, '.claude', 'rules', 'estilo.md');
    fs.writeFileSync(rule, '# Estilo\n');
    router.refreshHarness();
    await bridge.handle({ type: 'harness.file.read', requestId: 'r1', path: rule });
    expect(sent.at(-1)).toEqual({ type: 'harness.file.readResult', requestId: 'r1', content: '# Estilo\n', readonly: false });
    await bridge.handle({
      type: 'harness.file.write',
      requestId: 'w1',
      path: rule,
      content: '---\ndescription: Estilo do código\n---\n# Estilo\n',
    });
    expect(sent.at(-1)).toEqual({ type: 'harness.file.writeResult', requestId: 'w1', ok: true });
    expect(fs.readFileSync(rule, 'utf8')).toContain('Estilo do código');
    const item = router
      .snapshot()
      .harness.inventory.flatMap((t) => t.items)
      .find((i) => i.path === rule);
    expect(item?.description).toBe('Estilo do código');
  });

  it('abre também o arquivo que o CLAUDE.md importa com @', async () => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Veja @docs/guia.md');
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'guia.md'), '# Guia');
    router.refreshHarness();
    await bridge.handle({ type: 'harness.file.read', requestId: 'r4', path: path.join(dir, 'docs', 'guia.md') });
    expect(result()).toMatchObject({ content: '# Guia', readonly: false });
  });

  it('recusa arquivo fora da varredura, JSON inválido e o ~/.claude.json', async () => {
    const outside = path.join(dir, 'segredo.txt');
    fs.writeFileSync(outside, 'x');
    await bridge.handle({ type: 'harness.file.read', requestId: 'r2', path: outside });
    expect(result().error).toBe('Arquivo fora do harness.');

    fs.writeFileSync(path.join(dir, '.mcp.json'), '{ "mcpServers": { "a": { "command": "x" } } }');
    fs.mkdirSync(path.join(dir, 'h'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'h', '.claude.json'), '{ "mcpServers": { "b": { "command": "y" } } }');
    router.refreshHarness();
    await bridge.handle({ type: 'harness.file.write', requestId: 'w2', path: path.join(dir, '.mcp.json'), content: '{ quebrado' });
    expect(result()).toMatchObject({ ok: false });
    expect(result().error).toMatch(/^JSON inválido, nada foi gravado/);
    expect(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).toContain('"a"');

    const claudeJson = path.join(dir, 'h', '.claude.json');
    await bridge.handle({ type: 'harness.file.read', requestId: 'r3', path: claudeJson });
    expect(result()).toMatchObject({ readonly: true });
    await bridge.handle({ type: 'harness.file.write', requestId: 'w3', path: claudeJson, content: '{}' });
    expect(result()).toMatchObject({ ok: false, error: 'Este arquivo não pode ser alterado pelo board.' });
  });
});

describe('HostBridge: harness.item.write e harness.project.profile (assistentes de regras e skills)', () => {
  const sourceOf = (tool: 'claude' | 'cursor', scope: 'project' | 'user', test: (s: { path: string; layout: string }) => boolean) =>
    HARNESS_CATALOG[tool].findIndex((s) => s.scope === scope && !s.builtin && !s.noCreate && test(s));

  it('uma regra por assunto nasce com o texto pronto, abre no editor e entra na varredura', async () => {
    const source = sourceOf('claude', 'project', (s) => s.path === '.claude/rules' && s.layout === 'files');
    await bridge.handle({
      type: 'harness.item.write',
      tool: 'claude',
      source,
      name: 'testes',
      content: '---\ndescription: "Testes"\n---\n\n- Pequenos.\n',
    });
    const file = path.join(dir, '.claude', 'rules', 'testes.md');
    expect(fs.readFileSync(file, 'utf8')).toBe('---\ndescription: "Testes"\n---\n\n- Pequenos.\n');
    expect(sent.at(-1)).toEqual({ type: 'harness.item.created', path: file });
    expect(
      router
        .snapshot()
        .harness.inventory.flatMap((t) => t.items)
        .find((i) => i.path === file)?.description,
    ).toBe('Testes');
  });

  it('o arquivo principal que já existe recebe o texto no fim, só com append; sem ele dá erro e nada muda', async () => {
    const source = sourceOf('claude', 'project', (s) => s.path === 'CLAUDE.md');
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Projeto\n');
    await bridge.handle({ type: 'harness.item.write', tool: 'claude', source, name: '', content: '## Regras\n- A\n' });
    expect((sent.at(-1) as { type: string }).type).toBe('error');
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Projeto\n');
    await bridge.handle({ type: 'harness.item.write', tool: 'claude', source, name: '', content: '## Regras\n- A\n', append: true });
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Projeto\n\n## Regras\n- A\n');
    // sem o arquivo, o append cria
    fs.rmSync(path.join(dir, 'CLAUDE.md'));
    await bridge.handle({ type: 'harness.item.write', tool: 'claude', source, name: '', content: '## Regras\n', append: true });
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('## Regras\n');
  });

  it('uma skill é criada com o SKILL.md pronto e os arquivos de apoio vazios; nome de arquivo inválido não cria nada', async () => {
    const source = sourceOf('claude', 'project', (s) => s.layout === 'skills');
    const content = '---\nname: migracao\ndescription: "Escrever uma migração."\n---\n\n# migracao\n';
    await bridge.handle({ type: 'harness.item.write', tool: 'claude', source, name: 'migracao', content, files: ['../fora.md'] });
    expect((sent.at(-1) as { type: string }).type).toBe('error');
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'migracao'))).toBe(false);
    await bridge.handle({
      type: 'harness.item.write',
      tool: 'claude',
      source,
      name: 'migracao',
      content,
      files: ['references/exemplo.md', 'scripts/rodar.sh'],
    });
    const folder = path.join(dir, '.claude', 'skills', 'migracao');
    expect(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8')).toBe(content);
    expect(fs.readFileSync(path.join(folder, 'references', 'exemplo.md'), 'utf8')).toBe('');
    expect(fs.existsSync(path.join(folder, 'scripts', 'rodar.sh'))).toBe(true);
    expect(router.snapshot().harness.skills.map((k) => k.name)).toContain('migracao');
  });

  it('o perfil do projeto responde com o requestId, ou com o erro na própria resposta', async () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    await bridge.handle({ type: 'harness.project.profile', requestId: 'p1' });
    expect(sent.at(-1)).toMatchObject({
      type: 'harness.project.profileResult',
      requestId: 'p1',
      profile: { languages: ['JavaScript'], scripts: { test: 'vitest' } },
    });
  });
});

describe('HostBridge: plugins pela CLI do Claude Code', () => {
  const plugin = (rel: string, name: string) => {
    const manifest = path.join(dir, 'h', rel, '.claude-plugin', 'plugin.json');
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ name }));
    return path.join(dir, 'h', rel);
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('lista os instalados pela CLI, desativa os marcados e avisa quando terminou', async () => {
    const synced = plugin('.claude/plugins/synced/org/design~g2', 'design');
    const cached = plugin('.claude/plugins/cache/loja/fmt/1.0', 'fmt');
    plugin('.claude/plugins/marketplaces/loja/plugins/catalogo', 'catalogo');
    const calls: string[][] = [];
    router.setClaudeCli((args) => {
      calls.push(args);
      const stdout =
        args[1] === 'list'
          ? JSON.stringify([
              { id: 'design@synced', scope: 'synced', enabled: true, installPath: synced },
              { id: 'fmt@loja', scope: 'user', enabled: true, installPath: cached },
            ])
          : '{"outcome":"ok","message":"ok"}';
      return Promise.resolve({ code: 0, stdout, stderr: '' });
    });
    await flush();
    const plugins = () =>
      router
        .snapshot()
        .harness.inventory.find((t) => t.tool === 'claude')!
        .items.filter((i) => i.kind === 'plugin');
    expect(plugins().map((p) => [p.name, p.install?.id])).toEqual([
      ['design', 'design@synced'],
      ['fmt', 'fmt@loja'],
    ]);

    await bridge.handle({ type: 'harness.plugin.apply', tool: 'claude', action: 'disable', ids: ['design@synced', 'fmt@loja'] });
    expect(calls.filter((c) => c[1] === 'disable')).toEqual([
      ['plugin', 'disable', 'design@synced', '--json'],
      ['plugin', 'disable', 'fmt@loja', '--json'],
    ]);
    expect(sent.slice(-2)).toEqual([
      {
        type: 'notice',
        message:
          'Plugins desativados: design, fmt. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.',
      },
      { type: 'harness.plugin.done' },
    ]);
    // a lista é consultada de novo depois da ação
    expect(calls.filter((c) => c[1] === 'list').length).toBe(2);
  });

  it('um plugin sincronizado do claude.ai não é desinstalado, e a tela recebe o erro e o fim', async () => {
    const synced = plugin('.claude/plugins/synced/org/design', 'design');
    router.setClaudeCli((args) =>
      Promise.resolve({
        code: 0,
        stdout: args[1] === 'list' ? JSON.stringify([{ id: 'design@synced', scope: 'synced', enabled: true, installPath: synced }]) : '',
        stderr: '',
      }),
    );
    await flush();
    await bridge.handle({ type: 'harness.plugin.apply', tool: 'claude', action: 'uninstall', ids: ['design@synced'] });
    expect(sent.slice(-2)).toEqual([
      { type: 'harness.plugin.done' },
      { type: 'error', message: 'Nenhum dos plugins escolhidos aceita essa ação.' },
    ]);
  });
});

describe('HostBridge: attachment.read / attachment.write', () => {
  function createAttachment(content: string, filename = 'nota.txt'): string {
    const snap = router.snapshot();
    const story = snap.cardTypes.find((t) => t.name === 'História')!;
    const col = snap.columns.find((c) => c.workflowId === story.defaultWorkflowId)!;
    const cardId = router.createCard({ typeId: story.id, columnId: col.id, parentId: null, title: 'Card' });
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-src-'));
    const srcPath = path.join(srcDir, filename);
    fs.writeFileSync(srcPath, content, 'utf8');
    router.addAttachmentFiles(cardId, [srcPath]);
    const a = router.snapshot().attachments.find((x) => x.cardId === cardId)!;
    return a.id;
  }

  it('lê o conteúdo de um anexo de texto', async () => {
    const id = createAttachment('olá mundo');
    await bridge.handle({ type: 'attachment.read', requestId: 'r1', attachmentId: id });
    expect(sent.at(-1)).toEqual({ type: 'attachment.readResult', requestId: 'r1', content: 'olá mundo' });
  });

  it('attachment.read de anexo inexistente devolve erro correlacionado', async () => {
    await bridge.handle({ type: 'attachment.read', requestId: 'r2', attachmentId: 'nope' });
    expect(sent.at(-1)).toEqual({ type: 'attachment.readResult', requestId: 'r2', error: 'Anexo não encontrado' });
  });

  it('attachment.read de arquivo maior que o limite devolve erro', async () => {
    const id = createAttachment('x');
    const a = router.getAttachment(id)!;
    fs.writeFileSync(router.store.pathOf(a), Buffer.alloc(21 * 1024 * 1024));
    await bridge.handle({ type: 'attachment.read', requestId: 'r3', attachmentId: id });
    expect(sent.at(-1)).toEqual({ type: 'attachment.readResult', requestId: 'r3', error: 'Anexo maior que 20 MB' });
  });

  it('grava o conteúdo editado de volta no arquivo do anexo', async () => {
    const id = createAttachment('original');
    await bridge.handle({ type: 'attachment.write', requestId: 'w1', attachmentId: id, content: 'editado' });
    expect(sent.at(-1)).toEqual({ type: 'attachment.writeResult', requestId: 'w1', ok: true });
    const a = router.getAttachment(id)!;
    expect(fs.readFileSync(router.store.pathOf(a), 'utf8')).toBe('editado');
  });

  it('attachment.write de anexo inexistente devolve ok:false', async () => {
    await bridge.handle({ type: 'attachment.write', requestId: 'w2', attachmentId: 'nope', content: 'x' });
    expect(sent.at(-1)).toEqual({ type: 'attachment.writeResult', requestId: 'w2', ok: false, error: 'Anexo não encontrado' });
  });

  it('attachment.write que falha na escrita devolve ok:false com o erro, sem derrubar a sessão', async () => {
    const id = createAttachment('original');
    const a = router.getAttachment(id)!;
    fs.rmSync(path.dirname(router.store.pathOf(a)), { recursive: true, force: true });
    await bridge.handle({ type: 'attachment.write', requestId: 'w3', attachmentId: id, content: 'novo' });
    const last = sent.at(-1) as { type: string; ok: boolean; error?: string };
    expect(last.type).toBe('attachment.writeResult');
    expect(last.ok).toBe(false);
    expect(last.error).toBeTruthy();
  });
});

describe('HostBridge: backup (exportar e importar o board)', () => {
  let saved: { content: string; name: string }[];
  let picked: string | undefined;

  function createCard(title: string): string {
    const snap = router.snapshot();
    const story = snap.cardTypes.find((t) => t.name === 'História')!;
    const col = snap.columns.find((c) => c.workflowId === story.defaultWorkflowId)!;
    return router.createCard({ typeId: story.id, columnId: col.id, parentId: null, title });
  }

  beforeEach(() => {
    saved = [];
    picked = undefined;
    env.saveTextAs = async (content, name) => {
      saved.push({ content, name });
      return `/tmp/${name}`;
    };
    env.pickBackupFile = async () => picked;
    router.handle({ type: 'settings.board.update', patch: { name: 'Meu Board' } });
    createCard('Card 1');
  });

  it('backup.export grava o JSON pelo saveTextAs e avisa onde ficou', async () => {
    await bridge.handle({ type: 'backup.export' });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toMatch(/^Meu Board-\d{4}-\d{2}-\d{2}\.fazai\.json$/);
    const file = parseExportFile(saved[0]!.content);
    expect(file.board.name).toBe('Meu Board');
    expect(file.tables.cards!.map((c) => c.title)).toEqual(['Card 1']);
    expect(sent.at(-1)).toEqual({
      type: 'notice',
      message: `Board exportado em /tmp/${saved[0]!.name}. O arquivo contém conversas e anexos: guarde-o com cuidado.`,
    });
  });

  it('quando a pessoa desiste de salvar ou de escolher, só o "terminou" chega, sem aviso', async () => {
    env.saveTextAs = async () => undefined;
    await bridge.handle({ type: 'backup.export' });
    await bridge.handle({ type: 'backup.import.pick' });
    expect(sent.filter((m) => m.type !== 'boardState' && m.type !== 'viewState')).toEqual([
      { type: 'backup.done' },
      { type: 'backup.done' },
    ]);
  });

  it('backup.import.pick lê, valida e devolve o resumo com um token; apply substitui o board e avisa', async () => {
    const { text } = router.exportBoardFile();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-'));
    picked = path.join(dir, 'board.fazai.json');
    fs.writeFileSync(picked, text);
    const oldBoardId = router.boardId;
    createCard('Card 2');

    await bridge.handle({ type: 'backup.import.pick' });
    // o resumo vem antes do "terminou" (backup.done), que libera os botões da aba
    expect(sent.at(-1)).toEqual({ type: 'backup.done' });
    const summary = sent.at(-2)!;
    expect(summary.type).toBe('backup.import.summary');
    if (summary.type !== 'backup.import.summary') return;
    expect(summary.summary).toMatchObject({
      boardName: 'Meu Board',
      cards: 1,
      attachments: 0,
      sizeBytes: Buffer.byteLength(text),
      large: false,
    });

    let changes = 0;
    router.onDidChange(() => changes++);
    await bridge.handle({ type: 'backup.import.apply', token: summary.token });
    expect(sent.at(-1)).toEqual({ type: 'notice', message: 'Board "Meu Board" importado: 1 card(s) e 0 anexo(s).' });
    expect(changes).toBe(1);
    expect(router.boardId).toBe(oldBoardId); // o arquivo veio deste mesmo board: os ids se preservam
    expect(router.snapshot().cards.map((c) => c.title)).toEqual(['Card 1']);
    expect(router.snapshot().board.workspaceKey).toBe('ws');
  });

  it('o token só vale uma vez; cancelar descarta; token desconhecido responde erro', async () => {
    const { token } = router.parkImport(parseExportFile(router.exportBoardFile().text), 10);
    await bridge.handle({ type: 'backup.import.cancel', token });
    await bridge.handle({ type: 'backup.import.apply', token });
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'Importação expirada: escolha o arquivo de novo.' });
    await bridge.handle({ type: 'backup.import.apply', token: 'nope' });
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'Importação expirada: escolha o arquivo de novo.' });
  });

  it('com a IA executando um card, a importação é recusada e o board fica como está', async () => {
    const { token } = router.parkImport(parseExportFile(router.exportBoardFile().text), 10);
    createCard('Card 2');
    router.setAiRuns([
      { cardId: router.snapshot().cards[0]!.id, runId: '', mode: 'phase', origin: 'manual', phase: '', model: null, startedAt: Date.now() },
    ]);
    await bridge.handle({ type: 'backup.import.apply', token });
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'Espere a execução da IA terminar para importar o board.' });
    expect(router.snapshot().cards).toHaveLength(2);
    router.setAiRuns([]);
    await bridge.handle({ type: 'backup.import.apply', token });
    expect(router.snapshot().cards).toHaveLength(1);
  });

  it('arquivo inválido escolhido: erro com o motivo, sem resumo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-'));
    picked = path.join(dir, 'x.json');
    fs.writeFileSync(picked, '{"oi": 1}');
    await bridge.handle({ type: 'backup.import.pick' });
    expect(sent.at(-1)).toEqual({ type: 'error', message: 'Arquivo não é um export do Faz AI: falta o marcador "board-export".' });
  });

  it('as mensagens de resultado listam os cards com anexo sem arquivo', () => {
    expect(exportNotice('/x/b.fazai.json', ['#3', '#8'])).toBe(
      'Board exportado em /x/b.fazai.json. Anexos sem arquivo: #3, #8. O arquivo contém conversas e anexos: guarde-o com cuidado.',
    );
    expect(importNotice({ boardId: 'b', boardName: 'B', cards: 2, attachments: 1, warnings: ['#3'] })).toBe(
      'Board "B" importado: 2 card(s) e 1 anexo(s). Anexos sem arquivo: #3.',
    );
  });
});

describe('HostBridge: metrics.query', () => {
  const count = (table: string) => Number(rawDb.exec(`SELECT COUNT(*) FROM ${table}`)[0]!.values[0]![0]);

  it('responde metrics.result com o mesmo requestId', async () => {
    await bridge.handle({ type: 'metrics.query', requestId: 'm1', query: {} });
    const msg = sent.at(-1) as Extract<HostToWebview, { type: 'metrics.result' }>;
    expect(msg.type).toBe('metrics.result');
    expect(msg.requestId).toBe('m1');
    expect(msg.error).toBeUndefined();
    expect(msg.result).toBeDefined();
  });

  it('consulta que lança vira error dentro de metrics.result, com o requestId', async () => {
    await bridge.handle({ type: 'metrics.query', requestId: 'm2', query: { startDate: '2026-02-01', endDate: '2026-01-01' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ type: 'metrics.result', requestId: 'm2', error: 'end_date anterior a start_date.' });
  });

  it('dez consultas seguidas não escrevem nada: sem card_events, sem ai_runs, sem onDidChange, sem scheduleSave', async () => {
    let changes = 0;
    router.onDidChange(() => void changes++);
    const events = count('card_events');
    const runs = count('ai_runs');
    saves = 0;
    for (let i = 0; i < 10; i++) await bridge.handle({ type: 'metrics.query', requestId: `q${i}`, query: {} });
    expect(sent.filter((m) => m.type === 'metrics.result')).toHaveLength(10);
    expect(count('card_events')).toBe(events);
    expect(count('ai_runs')).toBe(runs);
    expect(changes).toBe(0);
    expect(saves).toBe(0);
  });
});

describe('HostBridge: card.usage.query', () => {
  it('responde card.usage.result com o mesmo requestId e o consumo do card, sem mudar o board', async () => {
    const s = router.snapshot();
    const story = s.cardTypes.find((t) => s.workflows.find((w) => w.id === t.defaultWorkflowId)?.kind === 'parent')!;
    const col = s.columns.find((c) => c.workflowId === story.defaultWorkflowId)!;
    const cardId = router.createCard({ typeId: story.id, columnId: col.id, parentId: null, title: 'Card' });
    let changes = 0;
    router.onDidChange(() => void changes++);
    await bridge.handle({ type: 'card.usage.query', requestId: 'u1', cardId });
    const msg = sent.at(-1) as Extract<HostToWebview, { type: 'card.usage.result' }>;
    expect(msg).toMatchObject({ type: 'card.usage.result', requestId: 'u1' });
    expect(msg.usage).toMatchObject({ phases: [], subtasks: null, total: { runs: 0, tokens: null } });
    expect(changes).toBe(0);
  });

  it('card que não existe vira error dentro da resposta', async () => {
    await bridge.handle({ type: 'card.usage.query', requestId: 'u2', cardId: 'nao-existe' });
    expect(sent.at(-1)).toEqual({ type: 'card.usage.result', requestId: 'u2', error: 'Card não encontrado.' });
  });
});

describe('HostBridge: Settings do editor', () => {
  it('ui.openIdeSettings pede ao editor para abrir o Settings na chave', async () => {
    const keys: (string | undefined)[] = [];
    env.openIdeSettings = (key) => void keys.push(key);
    await bridge.handle({ type: 'ui.openIdeSettings', key: 'fazai.appearance.language' });
    await bridge.handle({ type: 'ui.openIdeSettings' });
    expect(keys).toEqual(['fazai.appearance.language', undefined]);
  });

  it('sem openIdeSettings no ambiente (modo navegador), a mensagem é ignorada sem erro', async () => {
    delete env.openIdeSettings;
    await expect(bridge.handle({ type: 'ui.openIdeSettings' })).resolves.toBeUndefined();
    expect(sent.filter((m) => m.type === 'error')).toEqual([]);
  });
});
