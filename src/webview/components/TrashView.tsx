import { badgeStyle } from '../../shared/color';
import { cardRef } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';
import { Button, DeleteButton } from './ui';

export function TrashView() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);

  const deleted = state.cards.filter((c) => c.deletedAt !== null);
  const deletedIds = new Set(deleted.map((c) => c.id));
  // mostra no topo só quem não foi junto com o pai; os filhos aparecem como contagem
  const roots = deleted.filter((c) => !c.parentId || !deletedIds.has(c.parentId)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return (
    <div className="trash">
      <div className="row">
        <h2>Lixeira</h2>
        <span className="spacer" />
        {/* botão sem classe de perigo de propósito: a confirmação é que é vermelha, não ele */}
        <Button
          disabled={!deleted.length}
          onClick={() =>
            ask({
              title: 'Esvaziar a lixeira?',
              message: `${deleted.length} card(s) serão apagados definitivamente, com comentários e anexos. Não dá para desfazer.`,
              confirmLabel: 'Esvaziar',
              danger: true,
              onConfirm: () => send({ type: 'trash.empty' }),
            })
          }
        >
          Esvaziar lixeira
        </Button>
      </div>
      {roots.length === 0 ? (
        <p className="muted">A lixeira está vazia. Cards excluídos ficam aqui até você restaurar ou apagar de vez.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Card</th><th>Tipo</th><th>Estava em</th><th>Excluído em</th><th></th></tr></thead>
          <tbody>
            {roots.map((c) => {
              const kids = deleted.filter((k) => k.parentId === c.id).length;
              const type = state.cardTypes.find((t) => t.id === c.typeId);
              const column = state.columns.find((col) => col.id === c.columnId);
              const parent = c.parentId ? state.cards.find((p) => p.id === c.parentId) : undefined;
              return (
                <tr key={c.id}>
                  <td>
                    <span className="card-id">{cardRef(c)}</span> <strong>{c.title}</strong>
                    {kids > 0 && <span className="muted"> + {kids} sub-tarefa(s)</span>}
                    {parent && <div className="muted small">↳ {cardRef(parent)} {parent.title}</div>}
                  </td>
                  <td><span className="type-badge" style={badgeStyle(type?.color)}>{type?.name}</span></td>
                  <td>{column?.name}</td>
                  <td>{new Date(c.deletedAt!).toLocaleString()}</td>
                  <td className="row end">
                    <Button onClick={() => send({ type: 'card.restore', cardId: c.id })}>Restaurar</Button>
                    <DeleteButton
                      variant="ghost"
                      question={`Apagar "${c.title}" definitivamente?`}
                      message="Comentários, anexos e sub-tarefas deste card também serão apagados. Não dá para desfazer."
                      onConfirm={() => send({ type: 'card.deletePermanent', cardId: c.id })}
                    >
                      Apagar de vez
                    </DeleteButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
