import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { LinksSection } from '../../src/webview/components/card/LinksSection';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
let a: string;
let b: string;
beforeAll(async () => {
  board = await seedBoard();
  const s = board.router.snapshot();
  const wf = s.workflows[0]!;
  const typeId = s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
  const columnId = s.columns.find((c) => c.workflowId === wf.id)!.id;
  a = board.router.createCard({ typeId, columnId, parentId: null, title: 'Spec do login' });
  b = board.router.createCard({ typeId, columnId, parentId: null, title: 'Tela de cadastro' });
});
beforeEach(() => {
  for (const l of board.router.snapshot().links) board.router.handle({ type: 'link.remove', linkId: l.id });
  syncStore(board.router);
});

const show = (cardId: string) => {
  const card = useBoardStore.getState().state!.cards.find((c) => c.id === cardId)!;
  return render(
    <Theme>
      <LinksSection card={card} />
    </Theme>,
  );
};
const section = () => within(screen.getByRole('region', { name: 'Vínculos' }));

describe('LinksSection', () => {
  it('sem vínculos, diz isso e oferece a busca', () => {
    show(a);
    expect(section().getByText('Este card não está vinculado a nenhum outro.')).toBeInTheDocument();
    expect(section().getByLabelText('Buscar card para vincular')).toBeInTheDocument();
  });

  it('busca por título ou número e vincula como filho (padrão): o card atual é o pai', async () => {
    show(a);
    await userEvent.type(section().getByLabelText('Buscar card para vincular'), 'cadastro');
    await userEvent.click(within(section().getByRole('list', { name: 'Cards encontrados' })).getByRole('button'));
    expect(lastSent('link.add')).toEqual({ type: 'link.add', fromId: a, toId: b, kind: 'child' });
    // a busca limpa depois de vincular
    expect(section().getByLabelText('Buscar card para vincular')).toHaveValue('');
  });

  it('"é o pai deste card" inverte as pontas e "é relativo" não tem hierarquia', async () => {
    show(a);
    await choose(section().getByRole('combobox', { name: 'Tipo de vínculo' }), /é o pai/);
    await userEvent.type(section().getByLabelText('Buscar card para vincular'), 'cadastro');
    await userEvent.click(within(section().getByRole('list', { name: 'Cards encontrados' })).getByRole('button'));
    expect(lastSent('link.add')).toEqual({ type: 'link.add', fromId: b, toId: a, kind: 'child' });
    await choose(section().getByRole('combobox', { name: 'Tipo de vínculo' }), /é relativo/);
    await userEvent.type(
      section().getByLabelText('Buscar card para vincular'),
      '#' + String(useBoardStore.getState().state!.cards.find((c) => c.id === b)!.number),
    );
    await userEvent.click(within(section().getByRole('list', { name: 'Cards encontrados' })).getByRole('button'));
    expect(lastSent('link.add')).toMatchObject({ fromId: a, toId: b, kind: 'related' });
  });

  it('mostra pai, filhos com o progresso e relativos, e remove um vínculo', async () => {
    board.router.handle({ type: 'link.add', fromId: a, toId: b, kind: 'child' });
    board.router.handle({ type: 'link.add', fromId: a, toId: board.storyId, kind: 'related' });
    syncStore(board.router);
    show(a);
    const kids = within(section().getByRole('group', { name: 'Filhos' }));
    expect(kids.getByText('Tela de cadastro')).toBeInTheDocument();
    expect(section().getByText('0/1 encerrados')).toBeInTheDocument();
    expect(within(section().getByRole('group', { name: 'Relativos' })).getByText(/Login com Google/)).toBeInTheDocument();
    await userEvent.click(kids.getByRole('button', { name: /Remover o vínculo/ }));
    const id = useBoardStore.getState().state!.links.find((l) => l.toId === b)!.id;
    expect(lastSent('link.remove')).toEqual({ type: 'link.remove', linkId: id });
  });

  it('quem já está vinculado ou fecharia um ciclo não aparece na busca', async () => {
    board.router.handle({ type: 'link.add', fromId: a, toId: b, kind: 'child' });
    syncStore(board.router);
    show(b);
    // b é filho de a: vincular a como filho de b fecharia um ciclo, e como relativo já há vínculo
    await userEvent.type(section().getByLabelText('Buscar card para vincular'), 'spec do');
    expect(section().queryByRole('list', { name: 'Cards encontrados' })).toBeNull();
    expect(section().getByText(/Nenhum card disponível/)).toBeInTheDocument();
    expect(sentOf('link.add')).toHaveLength(0);
  });
});
