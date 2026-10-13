import { useState } from 'react';
import { BOARD_FIELDS, isBoardField } from '../../../shared/boardFields';
import { useBoardStore } from '../../store/boardStore';
import { dt, t } from '../../i18n';
import { Button } from '@radix-ui/themes';
import { IconPlus } from '../ui';
import { PageHeader } from './PageHeader';
import { FieldCard, NewFieldCard } from './fields/FieldCard';

/** Os campos que a pessoa criou. Os do board ficam de fora: as regras e a IA dependem deles pelo nome e pelas opções. */
export function FieldsSettings() {
  const all = useBoardStore((s) => s.state!.fieldDefs);
  const fields = all.filter((f) => !isBoardField(f));
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title={t('Campos personalizados')}
        actions={
          <Button disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> {t('Novo campo')}
          </Button>
        }
      >
        {t(
          'Campos guardam informações extras do card, como prazo, pontos ou cliente. Todos aparecem no card aberto; em "No board" você escolhe se e como cada um aparece também no card do board.',
        )}{' '}
        {t('Os campos do board ({fields}) não aparecem aqui: as regras e a IA dependem deles.', {
          fields: BOARD_FIELDS.map((b) => dt(b.name)).join(', '),
        })}
      </PageHeader>
      <div className="field-list">
        {adding && <NewFieldCard onDone={() => setAdding(false)} />}
        {!adding && fields.length === 0 && <p className="muted">{t('Nenhum campo personalizado. Use "Novo campo" para criar um.')}</p>}
        {fields.map((f) => (
          <FieldCard key={f.id} field={f} />
        ))}
      </div>
    </div>
  );
}
