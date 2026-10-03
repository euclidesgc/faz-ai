import type { Card, FieldValue } from '../../../shared/model';
import { MODEL_EFFORT_LABEL, modelLabel, suggestModel } from '../../../shared/models';
import { fieldsForType, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { FieldEditor, ModelEditor } from '../FieldRenderer';
import { FieldRow } from '../ui';

/** Campos personalizados que se aplicam ao tipo do card. */
export function FieldsSection({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const fields = fieldsForType(state, card.typeId);
  if (fields.length === 0) return null;
  const suggested = suggestModel(state, card);

  return (
    <section className="drawer-section">
      <h3>Campos</h3>
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
              <FieldRow label={MODEL_EFFORT_LABEL}>
                <ModelEditor part="effort" value={value} onChange={set} />
              </FieldRow>
              {suggested && suggested !== value && (
                <div className="field-row">
                  <span />
                  <span className="muted small suggestion">
                    Sugerido pelas regras: {modelLabel(state.board.modelCatalog, suggested, true)}{' '}
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        set(suggested);
                      }}
                    >
                      Usar
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
