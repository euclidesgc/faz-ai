import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { HOOK_EVENTS, type HookTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { Card, TextField } from '@radix-ui/themes';
import { FormField, SelectField } from '../../ui';
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
    <Card className="draft-card" aria-label="Hook novo">
      <TargetPicker label="Arquivo" targets={targets} value={source} onChange={setSource} />
      <FormField label="Evento">
        {(id) => (
          <SelectField
            id={id}
            aria-label="Evento"
            options={HOOK_EVENTS[tool].map((e) => ({ value: e, label: e }))}
            value={event}
            onChange={setEvent}
          />
        )}
      </FormField>
      {target.format !== 'copilot' && (
        <FormField label="Filtro (opcional)">
          {(id) => (
            <TextField.Root
              id={id}
              value={matcher}
              onChange={(e) => setMatcher(e.target.value)}
              placeholder="Ex.: Bash, ou Edit|Write; vazio = sempre"
            />
          )}
        </FormField>
      )}
      <FormField label="Comando">
        {(id) => (
          <TextField.Root
            id={id}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="./scripts/verificar.sh"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField label="Tempo limite (s)">
        {(id) => (
          <TextField.Root
            id={id}
            type="number"
            min={0}
            value={timeout}
            onChange={(e) => setTimeout_(e.target.value)}
            placeholder="padrão da ferramenta"
          />
        )}
      </FormField>
      <FormActions label="Acrescentar hook" disabled={!event || !command.trim()} onSubmit={add} onCancel={onClose} />
    </Card>
  );
}
