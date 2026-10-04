import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { HostBridge, exportNotice, importNotice, type HostEnv } from '../src/extension/host/hostBridge';
import { parseExportFile } from '../src/extension/db/boardExport';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { HostToWebview } from '../src/shared/messages';

let router: MessageRouter;
let sent: HostToWebview[];
let env: HostEnv;
let shown: string[];
let bridge: HostBridge;

beforeEach(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-bridge-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
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
    router.setAiRuns([router.snapshot().cards[0]!.id]);
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
