import { useState } from 'react';
import type { Column } from '../../../../shared/model';
import { settings } from '../../../commands';
import { useAction } from '../../../useAction';
import { Button, TextField } from '@radix-ui/themes';
import { SelectField } from '../../ui';
import { dt, t } from '../../../i18n';

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
  // a linha de rascunho só fecha quando o host confirma a coluna nova
  const create = useAction(() =>
    settings.createColumn(workflowId, name.trim(), after === START ? 0 : cols.findIndex((c) => c.id === after) + 1),
  );

  const add = async () => {
    if (!ready) return;
    if (await create.run()) onDone();
  };

  return (
    <tr className="draft-row">
      <td colSpan={colSpan}>
        <div className="row wrap">
          <TextField.Root
            autoFocus
            aria-label={t('Nome da coluna')}
            placeholder={t('Nome da coluna')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
              if (e.key === 'Escape') onDone();
            }}
          />
          <SelectField
            aria-label={t('Onde a coluna entra')}
            options={[
              { value: START, label: t('No início') },
              ...cols.map((c) => ({ value: c.id, label: t('Depois de {name}', { name: dt(c.name) }) })),
            ]}
            value={after}
            onChange={setAfter}
          />
          <Button variant="soft" color="gray" onClick={onDone}>
            {t('Cancelar')}
          </Button>
          <Button disabled={!ready} loading={create.busy} onClick={() => void add()}>
            {t('Criar coluna')}
          </Button>
        </div>
      </td>
    </tr>
  );
}
