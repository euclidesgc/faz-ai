import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { HOOK_EVENTS, type HookTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { EnumSelect, FieldRow } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { toolLabel } from './text';
import { useTargetForm } from './useTargetForm';

/** Formulário de um hook novo: em que arquivo, em que evento, com que filtro e que comando roda. */
export function NewHook({ tool, targets, onClose }: { tool: AiTool; targets: HookTarget[]; onClose: () => void }) {
  const { source, setSource, target, submit } = useTargetForm(targets, onClose);
  const [event, setEvent] = useState(HOOK_EVENTS[tool][0] ?? '');
  const [matcher, setMatcher] = useState('');
  const [command, setCommand] = useState('');
  const [timeout, setTimeout_] = useState('');
  // o hook roda um comando sozinho: confirma sempre, não só no destino global
  const add = () =>
    submit(() => harness.addHook(tool, source, { event, matcher, command, timeout: Number(timeout) || 0 }), {
      always: true,
      title: 'Acrescentar este hook?',
      message: `O ${toolLabel(tool)} vai rodar este comando sozinho, no seu computador, a cada "${event}":\n\n${command}\n\nArquivo: ${target.label}`,
      confirmLabel: 'Acrescentar hook',
    });
  return (
    <div className="harness-new">
      <TargetPicker label="Arquivo" targets={targets} value={source} onChange={setSource} />
      <FieldRow label="Evento">
        <EnumSelect options={HOOK_EVENTS[tool].map((e) => ({ value: e, label: e }))} value={event} onChange={setEvent} />
      </FieldRow>
      {target.format !== 'copilot' && (
        <FieldRow label="Filtro (opcional)">
          <input value={matcher} onChange={(e) => setMatcher(e.target.value)} placeholder="Ex.: Bash, ou Edit|Write; vazio = sempre" />
        </FieldRow>
      )}
      <FieldRow label="Comando">
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="./scripts/verificar.sh" spellCheck={false} />
      </FieldRow>
      <FieldRow label="Tempo limite (s)">
        <input type="number" min={0} value={timeout} onChange={(e) => setTimeout_(e.target.value)} placeholder="padrão da ferramenta" />
      </FieldRow>
      <FormActions label="Acrescentar hook" disabled={!event || !command.trim()} onSubmit={add} onCancel={onClose} />
    </div>
  );
}
