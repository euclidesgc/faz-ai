// @vitest-environment jsdom
// Primeira suíte de componente fora de test/ui/**: reaproveita os mesmos utilitários (seedBoard, renderThemed,
// sentOf/lastSent) em vez de mockar `../../src/webview/commands`/`useBoardStore` — é o padrão já fixado pelas
// suítes existentes (test/ui/chat.test.tsx e companhia), que renderizam com um board real (mesmo roteador do
// host) e afirmam as mensagens WebviewToHost enviadas, não chamadas de mock. Ver comentário no fim do arquivo.
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lastSent, posted, renderThemed, sentOf, seedBoard, syncStore } from '../ui/setup';
import { CommentsTab } from '../../src/webview/components/card/CommentsTab';
import { Dialog } from '../../src/webview/components/Dialog';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';

let router: MessageRouter;
let cardId: string;

/** Escreve uma mensagem comum na conversa do card, pelo mesmo caminho que a pessoa/IA usam, e atualiza a store. */
function addComment(body: string, kind?: 'summary') {
  router.handle({ type: 'comment.add', cardId, body, kind }, { author: 'Pessoa' });
  syncStore(router);
}

beforeEach(async () => {
  const seeded = await seedBoard();
  router = seeded.router;
  cardId = seeded.storyId;
  posted.mockClear();
});

describe('CommentsTab', () => {
  it('conversa vazia: não mostra o botão de resumir, só o aviso de conversa vazia', () => {
    renderThemed(<CommentsTab cardId={cardId} />);
    expect(screen.getByText('Nenhuma mensagem ainda. A conversa com a IA sobre este card acontece aqui.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resumir a conversa/ })).toBeNull();
  });

  it('conversa com 1 mensagem: ainda não mostra o botão de resumir', () => {
    addComment('primeira mensagem');
    renderThemed(<CommentsTab cardId={cardId} />);
    expect(screen.queryByRole('button', { name: /Resumir a conversa/ })).toBeNull();
  });

  it('conversa com 2 mensagens: o botão aparece e o clique chama ai.summarize', async () => {
    addComment('primeira mensagem');
    addComment('segunda mensagem');
    renderThemed(<CommentsTab cardId={cardId} />);
    const button = screen.getByRole('button', { name: /Resumir a conversa/ });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(lastSent('ai.run')).toEqual({ type: 'ai.run', cardId, mode: 'summarize' });
  });

  it('resumo gerado: mostra o convite a revisar e a recomendação de apagar com o botão de apagar em lote', () => {
    addComment('primeira mensagem');
    addComment('segunda mensagem');
    addComment('Decisões: ... Observações: ... Pendências: ...', 'summary');
    renderThemed(<CommentsTab cardId={cardId} />);
    expect(screen.getByText('Revise o resumo: concorde como está ou edite o que for preciso.')).toBeInTheDocument();
    expect(
      screen.getByText('As mensagens anteriores a este resumo já estão refletidas nele. Você pode apagá-las para liberar contexto.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apagar mensagens resumidas' })).toBeInTheDocument();
  });

  it('resumo aceito via edição: Editar, mudar o texto e Salvar chama comment.update', async () => {
    addComment('primeira mensagem');
    addComment('segunda mensagem');
    addComment('resumo original', 'summary');
    renderThemed(<CommentsTab cardId={cardId} />);
    const summaryId = router.snapshot().comments.find((c) => c.kind === 'summary')!.id;

    const summaryArticle = screen.getByText('resumo original').closest('article')!;
    await userEvent.click(within(summaryArticle).getByRole('button', { name: 'Editar' }));
    const editor = screen.getByDisplayValue('resumo original');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'resumo ajustado pela pessoa');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(lastSent('comment.update')).toEqual({ type: 'comment.update', commentId: summaryId, body: 'resumo ajustado pela pessoa' });
  });

  it('apagar em lote: apaga só os ids anteriores ao resumo, nenhum posterior', async () => {
    addComment('primeira mensagem');
    addComment('segunda mensagem');
    addComment('resumo', 'summary');
    addComment('mensagem depois do resumo');
    renderThemed(
      <>
        <Dialog />
        <CommentsTab cardId={cardId} />
      </>,
    );

    const before = router
      .snapshot()
      .comments.filter((c) => c.cardId === cardId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const priorIds = before.slice(0, 2).map((c) => c.id);
    const afterId = before[3].id;

    await userEvent.click(screen.getByRole('button', { name: 'Apagar mensagens resumidas' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar mensagens' }));

    const deleted = sentOf('comment.delete').map((m) => m.commentId);
    expect(deleted.sort()).toEqual([...priorIds].sort());
    expect(deleted).not.toContain(afterId);
    expect(posted).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'comment.delete', commentId: afterId }));
  });
});

// Decisão registrada (sub-tarefa #309): o SPEC.md sugeria mockar `../../commands` e o estado/store do
// componente. O projeto já tinha, porém, um padrão fixado em test/ui/** (seedBoard + MessageRouter real +
// afirmações sobre WebviewToHost via sentOf/lastSent), usado por todas as suítes de componente existentes
// (chat.test.tsx, card.test.tsx, cardView.test.tsx etc.). Seguir esse padrão evita duplicar dois jeitos de
// testar componente no mesmo projeto e cobre o componente de ponta a ponta (store → handlers → UI), sem abrir
// mão de nenhum dos cinco casos pedidos. Só o ambiente precisou de ajuste: o arquivo mora em test/webview/
// (fora de test/ui/**, o único glob mapeado para jsdom em vitest.config.ts), então a diretiva
// `// @vitest-environment jsdom` no topo troca o ambiente só deste arquivo, sem mexer na configuração global.
