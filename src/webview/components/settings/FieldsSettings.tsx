import { useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { Button, IconPlus } from '../ui';
import { PageHeader } from './PageHeader';
import { FieldCard, NewFieldCard } from './fields/FieldCard';

export function FieldsSettings() {
  const fields = useBoardStore((s) => s.state!.fieldDefs);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title="Campos personalizados"
        actions={
          <Button variant="primary" disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> Novo campo
          </Button>
        }
      >
        Campos guardam informações extras do card, como prazo, pontos ou tags. Todos aparecem no card aberto; em "No board" você escolhe se
        e como cada um aparece também no card do board.
      </PageHeader>
      <div className="field-list">
        {adding && <NewFieldCard onDone={() => setAdding(false)} />}
        {fields.map((f) => (
          <FieldCard key={f.id} field={f} />
        ))}
      </div>
    </div>
  );
}
