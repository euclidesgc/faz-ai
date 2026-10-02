// Base dos testes de interação (jsdom + testing-library). Este arquivo é .tsx (e não .ts) de propósito:
// o tsconfig.extension.json inclui test/**/*.ts sem a lib DOM, e um helper .ts com DOM quebraria o typecheck.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebviewToHost } from '../../src/shared/messages';
import { EMPTY_FILTERS } from '../../src/shared/filters';
import { openInMemory } from '../../src/extension/db/database';
import { MessageRouter } from '../../src/extension/panel/messageRouter';
import { useBoardStore } from '../../src/webview/store/boardStore';

/** Tudo que a tela mandaria ao host passa por `postToHost`: aqui ele só anota as mensagens. */
export const posted = vi.fn<(msg: WebviewToHost) => void>();

// tanto `send` quanto os filtros compartilhados (`view.set`) chamam postToHost; trocar só ele cobre os dois
vi.mock('../../src/webview/vscode', async (original) => {
  const mod = await original<typeof import('../../src/webview/vscode')>();
  return { ...mod, postToHost: (msg: WebviewToHost) => posted(msg) };
});

// jsdom não implementa matchMedia (useAppearance/applyTheme) nem scrollIntoView
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
});
Element.prototype.scrollIntoView = () => {};

/** Mensagens de um tipo, na ordem em que foram enviadas. */
export const sentOf = <T extends WebviewToHost['type']>(type: T): Extract<WebviewToHost, { type: T }>[] =>
  posted.mock.calls.map(([m]) => m).filter((m): m is Extract<WebviewToHost, { type: T }> => m.type === type);

/** A última mensagem de um tipo; falha o teste se não houve nenhuma. */
export function lastSent<T extends WebviewToHost['type']>(type: T): Extract<WebviewToHost, { type: T }> {
  const all = sentOf(type);
  const last = all[all.length - 1];
  if (!last)
    throw new Error(
      `nenhuma mensagem "${type}" foi enviada; enviadas: ${posted.mock.calls.map(([m]) => m.type).join(', ') || '(nenhuma)'}`,
    );
  return last;
}

export interface SeededBoard {
  router: MessageRouter;
  storyId: string;
  subId: string;
}

/**
 * Monta um board real (mesmo roteador do host) com uma história, uma sub-tarefa e um item de checklist,
 * e coloca o snapshot na store. Os testes afirmam as mensagens enviadas, não o DOM.
 */
export async function seedBoard(): Promise<SeededBoard> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-ui-'));
  const db = await openInMemory(path.resolve(__dirname, '../../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
  });
  const s = router.snapshot();
  const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
  const childWf = s.workflows.find((w) => w.kind === 'child')!;
  const typeOf = (wf: string) => s.cardTypes.find((t) => t.defaultWorkflowId === wf)!;
  const firstCol = (wf: string) => s.columns.find((c) => c.workflowId === wf)!;
  const storyId = router.createCard({
    typeId: typeOf(parentWf.id).id,
    columnId: firstCol(parentWf.id).id,
    parentId: null,
    title: 'Login com Google',
  });
  const subId = router.createCard({ typeId: typeOf(childWf.id).id, columnId: firstCol(childWf.id).id, parentId: storyId, title: 'Tarefa' });
  router.handle({ type: 'checklist.add', cardId: storyId, text: 'item' });
  syncStore(router);
  return { router, storyId, subId };
}

/** Copia o estado atual do roteador para a store (como o host faria ao mandar `boardState`). */
export function syncStore(router: MessageRouter): void {
  useBoardStore.setState({ state: router.snapshot() });
}

afterEach(() => {
  cleanup();
  posted.mockClear();
  // estado de tela volta ao padrão para um teste não vazar no outro
  useBoardStore.setState({ dialog: null, openCardId: null, filters: EMPTY_FILTERS, selectedParentId: null, collapsed: {}, view: 'board' });
});
