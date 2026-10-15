import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { cardDetail, needsTriage } from '../src/extension/mcp/format';
import type { BoardState, Card } from '../src/shared/model';

async function setup() {
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: '/tmp',
    workspaceDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-ws-')),
    homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-home-')),
  });
  // os quatro campos de triagem são campos do board: o board padrão já os cria
  const s0 = router.snapshot();
  const typeId = s0.cardTypes[0]!.id;
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
    router.handle({ type: 'field.setValue', cardId, fieldId: tags.id, value: ['docs'] });
    const s = router.snapshot();
    const card = s.cards.find((c) => c.id === cardId)!;
    expect(needsTriage(s, card)).toBe(false);
  });

  it('ignora campo fora de appliesToTypes do tipo do card', async () => {
    const { router, cardId, typeId } = await setup();
    const outraTypeId = router.snapshot().cardTypes.find((t) => t.id !== typeId)?.id;
    // os tipos de um campo do board não mudam pelas configurações: o estado é montado à mão
    const s0 = router.snapshot();
    const s = {
      ...s0,
      fieldDefs: s0.fieldDefs.map((f) => (f.name === 'Modelo' ? { ...f, appliesToTypes: outraTypeId ? [outraTypeId] : [] } : f)),
    };
    const card = s.cards.find((c) => c.id === cardId)!;
    expect(needsTriage(s, card)).toBe(true);
  });
});

describe('workspace do get_card (#462)', () => {
  /** monta o estado à mão: a principal detectada vem do BoardState e as branches, do cartão */
  async function withBranch(
    patch: Partial<Card> | ((s0: BoardState) => Partial<Card>),
    mainBranch: BoardState['mainBranch'] = { name: 'main', source: 'origin' },
    extra: Card[] = [],
  ) {
    const { router, cardId } = await setup();
    const s0 = router.snapshot();
    const s: BoardState = {
      ...s0,
      mainBranch,
      cards: [...s0.cards.map((c) => (c.id === cardId ? { ...c, ...(typeof patch === 'function' ? patch(s0) : patch) } : c)), ...extra],
    };
    return { s, card: s.cards.find((c) => c.id === cardId)! };
  }
  const detail = (s: BoardState, c: Card) =>
    cardDetail(s, c, () => '/anexo') as { workspace?: Record<string, unknown>; phase?: { autonomousNote?: string } };

  it('traz baseBranch, prBase e prNote com o comando, sem stackNote fora da pilha', async () => {
    const { s, card } = await withBranch({ branch: 'feature/1-card', worktreePath: '/w', baseBranch: 'develop' });
    const ws = detail(s, card).workspace!;
    expect(ws).toMatchObject({
      branch: 'feature/1-card',
      baseBranch: 'develop',
      prBase: 'develop',
      prNote: 'Abra o pull request com --base develop (ex.: gh pr create --base develop).',
    });
    expect(ws).not.toHaveProperty('stackNote');
  });

  it('história anterior ao gitflow (base vazia): prBase é a principal detectada', async () => {
    const { s, card } = await withBranch(
      { branch: 'historia/1-card', worktreePath: '/w', baseBranch: '' },
      { name: 'master', source: 'name' },
    );
    expect(detail(s, card).workspace).toMatchObject({ baseBranch: 'master', prBase: 'master' });
  });

  it('sem repositório detectado e com a base vazia: prBase fica de fora e a nota fala da branch principal', async () => {
    const { s, card } = await withBranch({ branch: 'historia/1-card', worktreePath: '/w', baseBranch: '' }, null);
    const ws = detail(s, card).workspace!;
    expect(ws).not.toHaveProperty('prBase');
    expect(ws).not.toHaveProperty('baseBranch');
    expect(ws.prNote).toContain('a branch principal do repositório');
  });

  it('na pilha: prBase é a branch da história anterior e a stackNote diz de qual PR ela depende', async () => {
    const { s, card } = await withBranch({ branch: 'feature/1-card', worktreePath: '/w', baseBranch: 'feature/99-anterior' }, undefined, [
      // a anterior é outra história com essa branch
      { ...(await withBranch({})).card, id: 'anterior', number: 99, branch: 'feature/99-anterior' },
    ]);
    const ws = detail(s, card).workspace!;
    expect(ws).toMatchObject({ baseBranch: 'feature/99-anterior', prBase: 'feature/99-anterior' });
    expect(ws.prNote).toContain('--base feature/99-anterior');
    expect(ws.stackNote).toContain('empilhada sobre feature/99-anterior');
  });

  it('get_card: stackNote só quando a base é branch de outra história', async () => {
    const dev = await withBranch({ branch: 'feature/1-card', worktreePath: '/w', baseBranch: 'develop' });
    expect(detail(dev.s, dev.card).workspace).not.toHaveProperty('stackNote');

    const outra = { ...(await withBranch({})).card, id: 'anterior', number: 99, branch: 'feature/99-anterior', parentId: null };
    const viva = await withBranch({ branch: 'feature/1-card', worktreePath: '/w', baseBranch: 'feature/99-anterior' }, undefined, [outra]);
    expect(detail(viva.s, viva.card).workspace!.stackNote).toContain('empilhada sobre feature/99-anterior');

    // a anterior concluída (coluna done) já foi mesclada: a base continua exposta, a nota some
    const done = viva.s.columns.find(
      (c) => c.category === 'done' && c.workflowId === viva.s.columns.find((k) => k.id === viva.card.columnId)?.workflowId,
    );
    expect(done).toBeDefined();
    const s2 = { ...viva.s, cards: viva.s.cards.map((c) => (c.id === 'anterior' ? { ...c, columnId: done!.id } : c)) };
    const ws = detail(s2, viva.card).workspace!;
    expect(ws.baseBranch).toBe('feature/99-anterior');
    expect(ws).not.toHaveProperty('stackNote');
  });

  it('a nota do modo autônomo na última coluna manda abrir o pull request com --base na base do PR', async () => {
    const { s, card } = await withBranch((s0) => ({
      branch: 'feature/1-card',
      worktreePath: '/w',
      baseBranch: 'develop',
      yolo: true,
      columnId: s0.columns.find((c) => c.name === 'Homologação')!.id,
    }));
    expect(detail(s, card).phase?.autonomousNote).toContain('abra o pull request com --base develop e registre-o');
  });

  it('sub-tarefa mostra o workspace e a base do PR da história', async () => {
    const { router, cardId } = await setup();
    const s0 = router.snapshot();
    const childCol = s0.columns.find((c) => s0.workflows.find((w) => w.id === c.workflowId)?.kind === 'child')!;
    const childType = s0.cardTypes.find((t) => t.defaultWorkflowId === childCol.workflowId)!;
    const childId = router.createCard({ typeId: childType.id, columnId: childCol.id, parentId: cardId, title: 'sub' });
    const s1 = router.snapshot();
    const s: BoardState = {
      ...s1,
      mainBranch: { name: 'main', source: 'origin' },
      cards: s1.cards.map((c) => (c.id === cardId ? { ...c, branch: 'feature/1-card', worktreePath: '/w', baseBranch: 'develop' } : c)),
    };
    const sub = s.cards.find((c) => c.id === childId)!;
    expect(detail(s, sub).workspace).toMatchObject({ branch: 'feature/1-card', prBase: 'develop' });
  });
});
