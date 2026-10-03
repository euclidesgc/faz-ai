import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { needsTriage } from '../src/extension/mcp/format';

async function setup() {
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: '/tmp',
    workspaceDir: '/tmp',
    homeDir: '/tmp',
  });
  const s0 = router.snapshot();
  const typeId = s0.cardTypes[0]!.id;
  for (const [name, kind] of [
    ['Tags', 'multiselect'],
    ['Esforço da atividade', 'select'],
    ['Modelo', 'model'],
    ['Skills', 'multiselect'],
  ] as const) {
    router.handle({ type: 'settings.field.create', name, kind, options: ['x'], appliesToTypes: null, display: 'chip' });
  }
  const columnId = router.snapshot().columns[0]!.id;
  const cardId = router.createCard({ typeId, columnId, parentId: null, title: 'card' });
  return { router, cardId, typeId };
}

describe('needsTriage', () => {
  it('é true quando os quatro campos de triagem estão vazios', async () => {
    const { router, cardId } = await setup();
    const s = router.snapshot();
    const card = s.cards.find((c) => c.id === cardId)!;
    expect(needsTriage(s, card)).toBe(true);
  });

  it('é false quando qualquer um dos quatro campos está preenchido', async () => {
    const { router, cardId } = await setup();
    const tags = router.snapshot().fieldDefs.find((f) => f.name === 'Tags')!;
    router.handle({ type: 'field.setValue', cardId, fieldId: tags.id, value: ['x'] });
    const s = router.snapshot();
    const card = s.cards.find((c) => c.id === cardId)!;
    expect(needsTriage(s, card)).toBe(false);
  });

  it('ignora campo fora de appliesToTypes do tipo do card', async () => {
    const { router, cardId, typeId } = await setup();
    const outraTypeId = router.snapshot().cardTypes.find((t) => t.id !== typeId)?.id;
    const modelo = router.snapshot().fieldDefs.find((f) => f.name === 'Modelo')!;
    router.handle({
      type: 'settings.field.update',
      fieldId: modelo.id,
      patch: { appliesToTypes: outraTypeId ? [outraTypeId] : [] },
    });
    const s = router.snapshot();
    const card = s.cards.find((c) => c.id === cardId)!;
    expect(needsTriage(s, card)).toBe(true);
  });
});
