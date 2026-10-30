import { Card } from '@radix-ui/themes';
import { modelValue } from '../../../../shared/models';
import { settings } from '../../../commands';
import { t } from '../../../i18n';
import { modelDisplay } from '../../../modelText';
import { useBoardStore } from '../../../store/boardStore';
import { FormField, SelectField } from '../../ui';

/** O valor que significa "o board escolhe": o Select do Radix não aceita `value` vazio. */
const AUTO = ' auto';

/**
 * O modelo que revisa a correção de um card: um modelo do catálogo (com o esforço que a pessoa quiser) ou
 * "Automático", em que o board escolhe o revisor. Vale para o board inteiro, não para um agente só.
 */
export function ReviewerModelField() {
  const board = useBoardStore((s) => s.state!.board);
  const catalog = board.modelCatalog;
  // cada modelo com cada esforço que ele aceita (ou sem esforço, se não tem esse ajuste)
  const options = catalog.flatMap((o) => (o.efforts.length ? o.efforts.map((e) => modelValue(o.id, e)) : [modelValue(o.id, null)]));
  // um modelo que saiu do catálogo não tem opção na lista: o campo volta a Automático, que é o que o host usa nesse caso
  const current = board.reviewerModel && options.includes(board.reviewerModel) ? board.reviewerModel : AUTO;
  return (
    <Card className="form-card" aria-label={t('Modelo do revisor')}>
      <FormField label={t('Modelo do revisor')} hint={t('Usado quando só há um agente pronto; nunca o nível barato.')}>
        {(id) => (
          <SelectField
            id={id}
            options={[
              { value: AUTO, label: t('Automático') },
              ...options.map((v) => ({ value: v, label: modelDisplay(catalog, v, true) })),
            ]}
            value={current}
            onChange={(v) => settings.setReviewerModel(v === AUTO ? null : v)}
          />
        )}
      </FormField>
    </Card>
  );
}
