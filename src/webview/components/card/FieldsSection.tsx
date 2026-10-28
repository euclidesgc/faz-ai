import type { Card, FieldDef, FieldValue } from '../../../shared/model';
import { modelDisplay } from '../../modelText';
import { RULES_FIELD, boardFieldNamed, isBoardField } from '../../../shared/boardFields';
import { MODEL_EFFORT_LABEL, suggestModel } from '../../../shared/models';
import { fieldsForType, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { useState } from 'react';
import { FieldBadge, FieldEditor, ModelEditor, hasValue } from '../FieldRenderer';
import { FieldRow } from '../ui';
import { t, dt } from '../../i18n';

/** Os campos do tipo do card: os do board e, numa seção à parte, os personalizados. */
export function FieldsSection({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const fields = fieldsForType(state, card.typeId);
  // o campo Rules não tem mais efeito: as regras ativas entram em todo contexto (o valor guardado fica)
  const board = fields.filter((f) => isBoardField(f) && f.name.trim().toLowerCase() !== RULES_FIELD.toLowerCase());
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
  // campos cujo valor novo ainda não voltou do host: o spinner fica ao lado do rótulo de cada um
  const [saving, setSaving] = useState<Record<string, number>>({});
  const save = (fieldId: string, v: FieldValue) => {
    setSaving((s) => ({ ...s, [fieldId]: (s[fieldId] ?? 0) + 1 }));
    const done = () => setSaving(({ [fieldId]: n, ...rest }) => (n !== undefined && n > 1 ? { ...rest, [fieldId]: n - 1 } : rest));
    cards.setField(card.id, fieldId, v).then(done, done);
  };

  return (
    <section className="drawer-section" aria-label={title}>
      <h3>{title}</h3>
      <div className="fields-grid">
        {fields.map((f) => {
          const value = valueOf(state, card.id, f.id);
          const set = (v: FieldValue) => save(f.id, v);
          const busy = (saving[f.id] ?? 0) > 0;
          // a Fase vem da história em que a sub-tarefa nasceu (ou da IA): aqui ela só aparece
          if (boardFieldNamed(f.name)?.readOnly) {
            return (
              <FieldRow key={f.id} as="div" label={dt(f.name)} hint={t('definida pelo board')}>
                <span aria-label={dt(f.name)}>
                  {hasValue(value) ? <FieldBadge field={{ ...f, display: 'badge' }} value={value} /> : <span className="muted">—</span>}
                </span>
              </FieldRow>
            );
          }
          if (f.kind !== 'model') {
            return (
              <FieldRow key={f.id} label={dt(f.name)} busy={busy}>
                <FieldEditor field={f} value={value} onChange={set} />
              </FieldRow>
            );
          }
          // modelo e esforço do modelo em linhas separadas, para não confundir com o esforço da atividade
          return (
            <div key={f.id} className="model-rows">
              <FieldRow label={dt(f.name)} busy={busy}>
                <ModelEditor part="model" value={value} onChange={set} />
              </FieldRow>
              <FieldRow label={t(MODEL_EFFORT_LABEL)} busy={busy}>
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
