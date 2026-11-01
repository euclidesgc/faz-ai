import { IconButton } from '@radix-ui/themes';
import { modelValue } from '../../../shared/models';
import { modelGroups } from '../../../shared/runTarget';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { modelDisplay } from '../../modelText';
import { useBoardStore } from '../../store/boardStore';
import { IconArrowDown, IconArrowUp, IconTrash, SelectField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { useSentList } from './useSentList';

/** O valor que não existe na lista de adicionar: o Select do Radix não aceita `value` vazio. */
const NONE = '__none';

/**
 * A escada de modelos do agente: do mais barato ao mais forte, é por ela que a subida automática (uma checagem
 * que falha) escolhe o próximo nível. Só modelos do catálogo do agente entram; sem escada, a subida só aumenta o esforço.
 */
export function ModelLadderEditor({ tool }: { tool: string }) {
  const board = useBoardStore((s) => s.state)!.board;
  const ladder = board.modelLadders[tool] ?? [];
  const sent = useSentList(ladder, (next) => settings.setModelLadder(tool, next));
  const catalog = modelGroups(board).find((g) => g.cli === tool)?.options ?? [];
  // cada modelo com cada esforço que ele aceita (ou sem esforço, se não tem esse ajuste)
  const all = catalog.flatMap((o) => (o.efforts.length ? o.efforts.map((e) => modelValue(o.id, e)) : [modelValue(o.id, null)]));
  const missing = all.filter((v) => !ladder.includes(v));
  const label = (v: string) => modelDisplay(board.modelCatalog, v, true) || v;

  const move = (i: number, delta: number) => {
    const next = [...sent.current()];
    const [v] = next.splice(i, 1);
    next.splice(i + delta, 0, v!);
    sent.save(next);
  };

  return (
    <div className="model-ladder">
      <SectionHeader id="model-ladder" title={t('Escada de modelos')}>
        {t(
          'Do mais barato ao mais forte. Quando uma checagem da coluna falha, o board sobe o modelo da correção um nível por esta lista; sem escada, sobe só o esforço do mesmo modelo.',
        )}
      </SectionHeader>
      <ol className="ladder-list">
        {ladder.map((v, i) => (
          <li key={v} className="row">
            <span className="muted">{i + 1}.</span> <span>{label(v)}</span>
            <div className="row-actions">
              <IconButton
                variant="ghost"
                color="gray"
                title={t('Subir (mais barato)')}
                aria-label={t('Subir {name}', { name: label(v) })}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <IconArrowUp />
              </IconButton>
              <IconButton
                variant="ghost"
                color="gray"
                title={t('Descer (mais forte)')}
                aria-label={t('Descer {name}', { name: label(v) })}
                disabled={i === ladder.length - 1}
                onClick={() => move(i, 1)}
              >
                <IconArrowDown />
              </IconButton>
              <IconButton
                variant="ghost"
                color="red"
                title={t('Remover da escada')}
                aria-label={t('Remover {name} da escada', { name: label(v) })}
                onClick={() => sent.save(sent.current().filter((x) => x !== v))}
              >
                <IconTrash />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      {ladder.length === 0 && <p className="muted">{t('Sem escada: sobe só o esforço.')}</p>}
      <SelectField
        aria-label={t('Adicionar à escada')}
        options={[{ value: NONE, label: t('Adicionar um modelo…') }, ...missing.map((v) => ({ value: v, label: label(v) }))]}
        value={NONE}
        disabled={missing.length === 0}
        onChange={(v) => v !== NONE && sent.save([...sent.current(), v])}
      />
    </div>
  );
}
