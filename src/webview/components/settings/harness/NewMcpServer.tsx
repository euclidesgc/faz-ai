import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { MCP_NAME_PATTERN, type McpServerInput, type McpTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { Card, TextArea, TextField } from '@radix-ui/themes';
import { FormField, SelectField, type EnumOption } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { useTargetForm } from './useTargetForm';

type Transport = McpServerInput['transport'];

const TRANSPORTS: EnumOption<Transport>[] = [
  { value: 'stdio', label: 'Comando local (stdio)' },
  { value: 'http', label: 'Endereço (HTTP)' },
];

/** `CHAVE=valor`, um por linha. */
const pairs = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );

/** Formulário de um servidor MCP novo: em que arquivo gravar, e o comando ou o endereço. */
export function NewMcpServer({ tool, targets, onClose }: { tool: AiTool; targets: McpTarget[]; onClose: () => void }) {
  const { source, setSource, target, submit } = useTargetForm(targets, onClose);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [extra, setExtra] = useState('');
  const ok = MCP_NAME_PATTERN.test(name) && (transport === 'stdio' ? command.trim() !== '' : /^https?:\/\/\S+$/.test(url.trim()));
  const add = () =>
    submit(
      () =>
        harness.addMcp(tool, source, {
          name,
          transport,
          command,
          args: args
            .split(/\r?\n/)
            .map((a) => a.trim())
            .filter(Boolean),
          env: transport === 'stdio' ? pairs(extra) : {},
          url,
          headers: transport === 'http' ? pairs(extra) : {},
        }),
      { title: 'Acrescentar servidor na pasta do usuário?', message: target.label, confirmLabel: 'Acrescentar' },
    );
  return (
    <Card className="draft-card" aria-label="Servidor MCP novo">
      <TargetPicker label="Arquivo" targets={targets} value={source} onChange={setSource} />
      <FormField label="Nome">
        {(id) => <TextField.Root id={id} value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="github" />}
      </FormField>
      <FormField label="Tipo">
        {(id) => <SelectField id={id} aria-label="Tipo" options={TRANSPORTS} value={transport} onChange={setTransport} />}
      </FormField>
      {transport === 'stdio' ? (
        <>
          <FormField label="Comando">
            {(id) => <TextField.Root id={id} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />}
          </FormField>
          <FormField label="Argumentos">
            {(id) => (
              <TextArea
                id={id}
                className="code-area"
                rows={2}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="um por linha"
                spellCheck={false}
              />
            )}
          </FormField>
        </>
      ) : (
        <FormField label="Endereço">
          {(id) => <TextField.Root id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.dev/mcp" />}
        </FormField>
      )}
      <FormField
        label={transport === 'stdio' ? 'Variáveis de ambiente' : 'Cabeçalhos'}
        hint="Gravados no arquivo como estão. Se o arquivo vai para o repositório, não ponha segredos nele."
      >
        {(id) => (
          <TextArea
            id={id}
            className="code-area"
            rows={2}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="CHAVE=valor, um por linha"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormActions label="Acrescentar servidor" disabled={!ok} onSubmit={add} onCancel={onClose} />
    </Card>
  );
}
