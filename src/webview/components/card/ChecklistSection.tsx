import type { ChecklistItem as Item } from '../../../shared/model';
import { checklistOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { checklist } from '../../commands';
import { useAction } from '../../useAction';
import { Checkbox } from '@radix-ui/themes';
import { AddInput, Button, IconClose } from '../ui';
import { t } from '../../i18n';

/** Checklist do card: marcar, renomear, excluir e adicionar itens. */
export function ChecklistSection({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const items = checklistOf(state, cardId);
  // o campo de item novo trava até o host confirmar (e o texto fica se falhar)
  const add = useAction((text: string) => checklist.add(cardId, text));

  return (
    <section className="drawer-section">
      <h3>
        {t('Checklist')}{' '}
        {items.length > 0 && (
          <small>
            {items.filter((i) => i.done).length}/{items.length}
          </small>
        )}
      </h3>
      <ul className="checklist">
        {items.map((item) => (
          <ChecklistItem key={item.id} item={item} />
        ))}
      </ul>
      <AddInput
        placeholder={t('+ Novo item (Enter)')}
        loading={add.busy}
        onAdd={(text) => {
          void add.run(text);
        }}
      />
    </section>
  );
}

/** Um item: marcar, renomear ou remover esmaece a linha e trava os controles até o host responder. */
function ChecklistItem({ item }: { item: Item }) {
  const update = useAction((patch: { text?: string; done?: boolean }) => checklist.update(item.id, patch));
  const remove = useAction(() => checklist.delete(item.id));
  const busy = update.busy || remove.busy;
  return (
    <li className={item.done ? 'done' : ''} aria-busy={busy || undefined}>
      <Checkbox
        aria-label={t('Concluir "{text}"', { text: item.text })}
        checked={item.done}
        disabled={busy}
        onCheckedChange={(v) => void update.run({ done: v === true })}
      />
      <input
        className="inline-edit"
        defaultValue={item.text}
        disabled={busy}
        onBlur={(e) => e.target.value !== item.text && void update.run({ text: e.target.value })}
      />
      <Button
        variant="icon"
        title={t('Remover o item')}
        aria-label={t('Remover o item')}
        loading={remove.busy}
        disabled={busy}
        onClick={() => void remove.run()}
      >
        <IconClose />
      </Button>
    </li>
  );
}
