import type { Card, FieldValue } from '../../../shared/model';
import { modelDisplay } from '../../modelText';
import { MODEL_EFFORT_LABEL, suggestModel } from '../../../shared/models';
import { fieldsForType, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { FieldEditor, ModelEditor } from '../FieldRenderer';
import { FieldRow } from '../ui';
import { t } from '../../i18n';

/** Campos personalizados que se aplicam ao tipo do card. */
export function FieldsSection({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const fields = fieldsForType(state, card.typeId);
  if (fields.length === 0) return null;
  const suggested = suggestModel(state, card);

  return (
    <section className="drawer-section">
      <h3>{t('Campos')}</h3>
      <div className="fields-grid">
        {fields.map((f) => {
          const value = valueOf(state, card.id, f.id);
          const set = (v: FieldValue) => cards.setField(card.id, f.id, v);
          if (f.kind !== 'model') {
            return (
              <FieldRow key={f.id} label={f.name}>
                <FieldEditor field={f} value={value} onChange={set} />
              </FieldRow>
            );
          }
          // modelo e esforço do modelo em linhas separadas, para não confundir com o esforço da atividade
          return (
            <div key={f.id} className="model-rows">
              <FieldRow label={f.name}>
                <ModelEditor part="model" value={value} onChange={set} />
              </FieldRow>
              <FieldRow label={t(MODEL_EFFORT_LABEL)}>
                <ModelEditor part="effort" value={value} onChange={set} />
              </FieldRow>
              {suggested && suggested !== value && (
                <div className="field-row">
                  <span />
                  <span className="muted small suggestion">
                    {t('Sugerido pelas regras: {model}', { model: modelDisplay(state.board.modelCatalog, suggested, true) })}{' '}
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        set(suggested);
                      }}
                    >
                      {t('Usar')}
                    </a>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
