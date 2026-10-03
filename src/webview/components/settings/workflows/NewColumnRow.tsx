import { useState } from 'react';
import type { Column } from '../../../../shared/model';
import { settings } from '../../../commands';
import { Button, TextField } from '@radix-ui/themes';
import { SelectField } from '../../ui';

const START = '__start';

/** Antes da primeira coluna de conclusão, que é onde uma fase nova costuma entrar; sem ela, no fim. */
function defaultAfter(cols: Column[]): string {
  const firstTerminal = cols.findIndex((c) => c.category !== 'open');
  return (firstTerminal === -1 ? cols[cols.length - 1] : cols[firstTerminal - 1])?.id ?? START;
}

/** Linha de rascunho da coluna nova, no fim da tabela. Enter adiciona, Esc cancela. */
export function NewColumnRow({
  workflowId,
  cols,
  colSpan,
  onDone,
}: {
  workflowId: string;
  cols: Column[];
  colSpan: number;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [after, setAfter] = useState(() => defaultAfter(cols));
  const ready = name.trim() !== '';

  const add = () => {
    if (!ready) return;
    settings.createColumn(workflowId, name.trim(), after === START ? 0 : cols.findIndex((c) => c.id === after) + 1);
    onDone();
  };

  return (
    <tr className="draft-row">
      <td colSpan={colSpan}>
        <div className="row wrap">
          <TextField.Root
            autoFocus
            aria-label="Nome da coluna"
            placeholder="Nome da coluna"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') onDone();
            }}
          />
          <SelectField
            aria-label="Onde a coluna entra"
            options={[{ value: START, label: 'No início' }, ...cols.map((c) => ({ value: c.id, label: `Depois de ${c.name}` }))]}
            value={after}
            onChange={setAfter}
          />
          <Button variant="soft" color="gray" onClick={onDone}>
            Cancelar
          </Button>
          <Button disabled={!ready} onClick={add}>
            Adicionar
          </Button>
        </div>
      </td>
    </tr>
  );
}
