import { badgeStyle } from '../../shared/color';
import { cardRef } from '../../shared/model';
import { columnOf } from '../../shared/selectors';
import { useBoardStore, withOverlay } from '../store/boardStore';
import { useCardBusy } from '../store/busyCards';
import type { Card } from '../../shared/model';
import { formatDateTime, t, dt } from '../i18n';
import { cards, trash } from '../commands';
import { Button, DeleteButton, IconParent } from './ui';

export function TrashView() {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);

  const deleted = state.cards.filter((c) => c.deletedAt !== null);
  const deletedIds = new Set(deleted.map((c) => c.id));
  // mostra no topo só quem não foi junto com o pai; os filhos aparecem como contagem
  const roots = deleted.filter((c) => !c.parentId || !deletedIds.has(c.parentId)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return (
    <div className="trash">
      <div className="row">
        <h2>{t('Lixeira')}</h2>
        <span className="spacer" />
        {/* botão sem classe de perigo de propósito: a confirmação é que é vermelha, não ele */}
        <Button
          disabled={!deleted.length}
          onClick={() =>
            ask({
              title: t('Esvaziar a lixeira?'),
              message: t('{n} card(s) serão apagados definitivamente, com comentários e anexos. Não dá para desfazer.', {
                n: deleted.length,
              }),
              confirmLabel: t('Esvaziar lixeira'),
              danger: true,
              onConfirm: () => withOverlay(t('Esvaziando a lixeira…'), () => trash.empty()),
            })
          }
        >
          {t('Esvaziar lixeira')}
        </Button>
      </div>
      {roots.length === 0 ? (
        <p className="muted">{t('A lixeira está vazia. Cards excluídos ficam aqui até você restaurar ou apagar de vez.')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('Card')}</th>
              <th>{t('Tipo')}</th>
              <th>{t('Estava em')}</th>
              <th>{t('Excluído em')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roots.map((c) => (
              <TrashRow key={c.id} card={c} kids={deleted.filter((k) => k.parentId === c.id).length} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Uma linha da lixeira: restaurar e apagar mostram a espera no botão clicado enquanto o host responde. */
function TrashRow({ card: c, kids }: { card: Card; kids: number }) {
  const state = useBoardStore((s) => s.state)!;
  const busy = useCardBusy(c.id);
  const type = state.cardTypes.find((ct) => ct.id === c.typeId);
  const column = columnOf(state, c);
  const parent = c.parentId ? state.cards.find((p) => p.id === c.parentId) : undefined;
  return (
    <tr aria-busy={busy || undefined}>
      <td>
        <span className="card-id">{cardRef(c)}</span> <strong>{c.title}</strong>
        {kids > 0 && <span className="muted"> + {t('{n} sub-tarefa(s)', { n: kids })}</span>}
        {parent && (
          <div className="muted small">
            <IconParent /> {cardRef(parent)} {parent.title}
          </div>
        )}
      </td>
      <td>
        <span className="type-badge" style={badgeStyle(type?.color)}>
          {type && dt(type.name)}
        </span>
      </td>
      <td>{column && dt(column.name)}</td>
      <td>{formatDateTime(c.deletedAt!)}</td>
      <td className="row end">
        <Button loading={busy} onClick={() => void cards.restore(c.id)}>
          {t('Restaurar')}
        </Button>
        <DeleteButton
          variant="ghost"
          disabled={busy}
          question={t('Apagar "{title}" definitivamente?', { title: c.title })}
          message={t('Comentários, anexos e sub-tarefas deste card também serão apagados. Não dá para desfazer.')}
          onConfirm={() => void cards.deletePermanent(c.id)}
        >
          {t('Apagar de vez')}
        </DeleteButton>
      </td>
    </tr>
  );
}
