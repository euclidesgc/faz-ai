import type { Card, FieldDef, FieldValue } from '../../../shared/model';
import { modelDisplay } from '../../modelText';
import { isBoardField } from '../../../shared/boardFields';
import { MODEL_EFFORT_LABEL, suggestModel } from '../../../shared/models';
import { fieldsForType, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { FieldEditor, ModelEditor } from '../FieldRenderer';
import { FieldRow } from '../ui';
import { t, dt } from '../../i18n';

/** Os campos do tipo do card: os do board e, numa seção à parte, os personalizados. */
export function FieldsSection({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const fields = fieldsForType(state, card.typeId);
  const board = fields.filter(isBoardField);
  const custom = fields.filter((f) => !isBoardField(f));

  return (
    <>
      {board.length > 0 && <FieldsGroup title={t('Campos')} card={card} fields={board} />}
      {custom.length > 0 && <FieldsGroup title={t('Campos personalizados')} card={card} fields={custom} />}
    </>
  );
}

function FieldsGroup({ title, card, fields }: { title: string; card: Card; fields: FieldDef[] }) {
  const state = useBoardStore((s) => s.state)!;
  const suggested = suggestModel(state, card);

  return (
    <section className="drawer-section" aria-label={title}>
      <h3>{title}</h3>
      <div className="fields-grid">
        {fields.map((f) => {
          const value = valueOf(state, card.id, f.id);
          const set = (v: FieldValue) => cards.setField(card.id, f.id, v);
          if (f.kind !== 'model') {
            return (
              <FieldRow key={f.id} label={dt(f.name)}>
                <FieldEditor field={f} value={value} onChange={set} />
              </FieldRow>
            );
          }
          // modelo e esforço do modelo em linhas separadas, para não confundir com o esforço da atividade
          return (
            <div key={f.id} className="model-rows">
              <FieldRow label={dt(f.name)}>
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
