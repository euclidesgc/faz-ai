import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { MCP_NAME_PATTERN, type McpServerInput, type McpTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { Card, TextArea, TextField } from '@radix-ui/themes';
import { FormField, SelectField, type EnumOption } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { useTargetForm } from './useTargetForm';
import { t } from '../../../i18n';

type Transport = McpServerInput['transport'];

// os rótulos ficam em português e são traduzidos onde a lista é usada
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
      { title: t('Acrescentar servidor na pasta do usuário?'), message: target.label, confirmLabel: t('Acrescentar') },
    );
  return (
    <Card className="draft-card" aria-label={t('Servidor MCP novo')}>
      <TargetPicker label={t('Arquivo')} targets={targets} value={source} onChange={setSource} />
      <FormField label={t('Nome')}>
        {(id) => <TextField.Root id={id} value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="github" />}
      </FormField>
      <FormField label={t('Tipo')}>
        {(id) => (
          <SelectField
            id={id}
            aria-label={t('Tipo')}
            options={TRANSPORTS.map((o) => ({ ...o, label: t(o.label) }))}
            value={transport}
            onChange={setTransport}
          />
        )}
      </FormField>
      {transport === 'stdio' ? (
        <>
          <FormField label={t('Comando')}>
            {(id) => <TextField.Root id={id} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />}
          </FormField>
          <FormField label={t('Argumentos')}>
            {(id) => (
              <TextArea
                id={id}
                className="code-area"
                rows={2}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={t('um por linha')}
                spellCheck={false}
              />
            )}
          </FormField>
        </>
      ) : (
        <FormField label={t('Endereço')}>
          {(id) => <TextField.Root id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.dev/mcp" />}
        </FormField>
      )}
      <FormField
        label={transport === 'stdio' ? t('Variáveis de ambiente') : t('Cabeçalhos')}
        hint={t('Gravados no arquivo como estão. Se o arquivo vai para o repositório, não ponha segredos nele.')}
      >
        {(id) => (
          <TextArea
            id={id}
            className="code-area"
            rows={2}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={t('CHAVE=valor, um por linha')}
            spellCheck={false}
          />
        )}
      </FormField>
      <FormActions label={t('Acrescentar servidor')} disabled={!ok} onSubmit={add} onCancel={onClose} />
    </Card>
  );
}
