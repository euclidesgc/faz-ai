import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { PERMISSION_LIST_LABEL, type PermissionTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { EnumSelect, FieldRow } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { useTargetForm } from './useTargetForm';

/** Formulário de uma regra de permissão: o arquivo, a lista (permitir, perguntar, negar) e a regra. */
export function NewPermission({ tool, targets, onClose }: { tool: AiTool; targets: PermissionTarget[]; onClose: () => void }) {
  const { source, setSource, target, submit } = useTargetForm(targets, onClose);
  const [list, setList] = useState(target.lists[0]!);
  const [rule, setRule] = useState('');
  // cada arquivo tem suas listas: se a escolhida não existe no novo destino, vai a primeira dele
  const add = () =>
    submit(() => harness.addPermission(tool, source, target.lists.includes(list) ? list : target.lists[0]!, rule), {
      title: 'Acrescentar regra na pasta do usuário?',
      message: target.label,
      confirmLabel: 'Acrescentar',
    });
  return (
    <div className="harness-new">
      <TargetPicker label="Arquivo" targets={targets} value={source} onChange={setSource} />
      <FieldRow label="Lista">
        <EnumSelect
          options={target.lists.map((l) => ({ value: l, label: `${PERMISSION_LIST_LABEL[l] ?? l} (${l})` }))}
          value={list}
          onChange={setList}
        />
      </FieldRow>
      <FieldRow label="Regra">
        <input
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          placeholder={tool === 'cursor' ? 'Ex.: Shell(git), Read(src/**)' : 'Ex.: Bash(npm run test *), Read(./.env)'}
          spellCheck={false}
        />
      </FieldRow>
      <FormActions label="Acrescentar regra" disabled={!rule.trim()} onSubmit={add} onCancel={onClose} />
    </div>
  );
}
