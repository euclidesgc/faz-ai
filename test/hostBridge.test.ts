import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
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
