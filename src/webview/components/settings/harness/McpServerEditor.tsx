import { useEffect, useState } from 'react';
import { Button, Card, Heading, IconButton, TextArea, TextField } from '@radix-ui/themes';
import type { BoardArtifact } from '../../../../shared/artifacts';
import { MCP_NAME_PATTERN, type McpServerInput } from '../../../../shared/harnessCatalog';
import { BOARD_MCP_NAME } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { FormField, SelectField, type EnumOption } from '../../ui';
import { useArtifactText } from './useArtifactText';
import { t } from '../../../i18n';

type Transport = McpServerInput['transport'];

// os rótulos ficam em português e são traduzidos onde a lista é usada
const TRANSPORTS: EnumOption<Transport>[] = [
  { value: 'stdio', label: 'Comando local (stdio)' },
  { value: 'http', label: 'Endereço (HTTP)' },
];

/** Uma variável ou cabeçalho; `saved` = já existe no board e o valor não volta do host. */
interface Row {
  key: string;
  value: string;
  saved: boolean;
}

/** Por que o nome de um servidor MCP não pode ser salvo; `null` quando está livre. */
export function mcpNameProblem(name: string, taken: readonly string[]): string | null {
  if (!name) return t('Dê um nome ao servidor.');
  if (!MCP_NAME_PATTERN.test(name)) return t('Use letras, números, hífen, ponto ou sublinhado (até 64).');
  if (name === BOARD_MCP_NAME) return t('O nome faz-ai é reservado ao MCP do board.');
  if (taken.includes(name)) return t('Já existe um servidor com este nome.');
  return null;
}

function Rows({ label, rows, onChange }: { label: string; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="form-field">
      <legend>{label}</legend>
      <p className="muted small">{t('Os valores guardados não aparecem. Deixe vazio para mantê-lo; digite para substituí-lo.')}</p>
      {rows.map((r, i) => (
        <div className="form-actions" key={i}>
          <TextField.Root
            aria-label={t('Nome em {label}', { label })}
            value={r.key}
            readOnly={r.saved}
            spellCheck={false}
            placeholder="CHAVE"
            onChange={(e) => set(i, { key: e.target.value.trim() })}
          />
          <TextField.Root
            type="password"
            autoComplete="off"
            aria-label={t('Valor de {key}', { key: r.key || label })}
            value={r.value}
            spellCheck={false}
            placeholder={r.saved ? t('Guardado: vazio mantém') : t('valor')}
            onChange={(e) => set(i, { value: e.target.value })}
          />
          <IconButton
            type="button"
            variant="ghost"
            color="gray"
            aria-label={t('Remover {key}', { key: r.key || label })}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ×
          </IconButton>
        </div>
      ))}
      <Button type="button" variant="soft" onClick={() => onChange([...rows, { key: '', value: '', saved: false }])}>
        {t('Acrescentar linha')}
      </Button>
    </fieldset>
  );
}

const toRecord = (rows: Row[]): Record<string, string> =>
  Object.fromEntries(rows.filter((r) => r.key !== '').map((r) => [r.key, r.value]));
const savedRows = (rec: Record<string, string>): Row[] => Object.keys(rec).map((key) => ({ key, value: '', saved: true }));

/**
 * Editor de um servidor MCP do board: nome, comando ou endereço, argumentos, variáveis e cabeçalhos. Ao editar, o host
 * devolve só os nomes de variáveis e cabeçalhos (valores mascarados): campo vazio mantém o valor guardado
 * (`keepSecrets`) e um valor digitado o substitui. O valor novo vai só ao host.
 */
export function McpServerEditor({ server, onClose }: { server?: BoardArtifact; onClose: () => void }) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const read = useArtifactText('mcp', server?.name);
  const [name, setName] = useState(server?.name ?? '');
  const [transport, setTransport] = useState<Transport>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(!server);
  useEffect(() => {
    const v = read.server;
    if (!v) return;
    setTransport(v.transport);
    setCommand(v.command);
    setArgs(v.args.join('\n'));
    setUrl(v.url);
    setEnv(savedRows(v.env));
    setHeaders(savedRows(v.headers));
    setLoaded(true);
  }, [read.server]);

  const trimmed = name.trim();
  const renamed = !!server && trimmed !== server.name;
  const taken = artifacts.filter((a) => a.kind === 'mcp' && a.name !== server?.name).map((a) => a.name);
  const problem = !server || renamed ? mcpNameProblem(trimmed, taken) : null;
  const rows = transport === 'stdio' ? env : headers;
  const duplicated = new Set(rows.filter((r) => r.key).map((r) => r.key)).size !== rows.filter((r) => r.key).length;
  const target = transport === 'stdio' ? command.trim() !== '' : /^https?:\/\/\S+$/.test(url.trim());

  const save = useAction(() =>
    harness.saveArtifact({
      kind: 'mcp',
      name: trimmed,
      server: {
        name: trimmed,
        transport,
        command: transport === 'stdio' ? command.trim() : '',
        args: transport === 'stdio' ? args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean) : [],
        env: transport === 'stdio' ? toRecord(env) : {},
        url: transport === 'http' ? url.trim() : '',
        headers: transport === 'http' ? toRecord(headers) : {},
      },
      keepSecrets: rows.filter((r) => r.saved && r.key && r.value === '').map((r) => r.key),
      ...(renamed ? { previous: server!.name } : {}),
      via: 'manual',
    }),
  );
  const submit = async () => {
    if (await save.run()) onClose();
  };
  const canSave = loaded && !problem && target && !duplicated && !save.busy;

  return (
    <Card className="draft-card" aria-label={server ? t('Editar servidor MCP') : t('Servidor MCP novo')}>
      <form
        className="wizard-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void submit();
        }}
      >
        <Heading as="h4" size="3">
          {server ? t('Editar servidor MCP') : t('Servidor MCP novo')}
        </Heading>
        <FormField label={t('Nome')} hint={problem ?? read.error ?? (read.loading ? t('Lendo o servidor…') : undefined)}>
          {(id) => (
            <TextField.Root
              id={id}
              color={problem && trimmed ? 'red' : undefined}
              aria-invalid={problem && trimmed ? true : undefined}
              value={name}
              spellCheck={false}
              placeholder="github"
              onChange={(e) => setName(e.target.value)}
            />
          )}
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
              {(id) => (
                <TextField.Root id={id} disabled={!loaded} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
              )}
            </FormField>
            <FormField label={t('Argumentos')} hint={t('Não ponha segredos nos argumentos: use as variáveis de ambiente.')}>
              {(id) => (
                <TextArea
                  id={id}
                  className="code-area"
                  rows={2}
                  disabled={!loaded}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder={t('um por linha')}
                  spellCheck={false}
                />
              )}
            </FormField>
            <Rows label={t('Variáveis de ambiente')} rows={env} onChange={setEnv} />
          </>
        ) : (
          <>
            <FormField label={t('Endereço')}>
              {(id) => (
                <TextField.Root
                  id={id}
                  disabled={!loaded}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://exemplo.dev/mcp"
                />
              )}
            </FormField>
            <Rows label={t('Cabeçalhos')} rows={headers} onChange={setHeaders} />
          </>
        )}
        {duplicated && (
          <p className="wizard-warning" role="alert">
            {t('Há nomes repetidos nas variáveis ou nos cabeçalhos.')}
          </p>
        )}
        {save.error && (
          <p className="wizard-warning" role="alert">
            {save.error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" disabled={!canSave} loading={save.busy}>
            {t('Salvar')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
