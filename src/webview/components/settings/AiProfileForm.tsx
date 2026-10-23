import { useState } from 'react';
import { Button, Card, TextArea, TextField } from '@radix-ui/themes';
import {
  ISOLATION_KINDS,
  profileIsolation,
  type AiProfile,
  type AiProfileConfig,
  type AiProfileDraft,
  type BoardServerVia,
  type IsolationKind,
  type IsolationLeak,
  type PromptVia,
} from '../../../shared/aiProfiles';
import type { RunnerPermission } from '../../../shared/runner';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { useAction } from '../../useAction';
import { FormField, SelectField } from '../ui';

const kindLabel: Record<IsolationKind, string> = {
  instructions: 'Regras e instruções',
  skill: 'Skills',
  agent: 'Agentes',
  hook: 'Hooks',
  mcp: 'Servidores MCP',
};
const scopes = [
  ['project', 'Projeto'],
  ['user', 'Usuário'],
] as const;

const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
type TextKey =
  'command' | 'extraArgs' | 'args' | 'versionArgs' | 'statusArgs' | 'authPatterns' | 'installUrl' | 'mcpProjectFile' | 'acpAgent';

/** O host não devolve configuração privada. Campos vazios numa edição mantêm o valor salvo. */
export function AiProfileForm({ profile, onClose, onSaved }: { profile?: AiProfile; onClose: () => void; onSaved: () => void }) {
  const kind = profile?.kind === 'copy' ? 'copy' : 'custom';
  const [name, setName] = useState(profile?.name ?? '');
  const [values, setValues] = useState<Partial<Record<TextKey, string>>>({});
  const [touched, setTouched] = useState<Set<TextKey>>(new Set());
  const [promptVia, setPromptVia] = useState<PromptVia | '__keep'>(profile ? '__keep' : 'stdin');
  const [boardServer, setBoardServer] = useState<BoardServerVia | '__keep'>(profile ? '__keep' : 'none');
  const [envRows, setEnvRows] = useState([{ name: '', value: '', show: false }]);
  const [envTouched, setEnvTouched] = useState(false);
  const [permission, setPermission] = useState<Record<RunnerPermission, string>>({ board: '', edits: '', full: '' });
  const [permissionTouched, setPermissionTouched] = useState<Set<RunnerPermission>>(new Set());
  const [loads, setLoads] = useState<IsolationLeak[]>(() => (profile ? profileIsolation(profile).loads : []));
  const [loadsTouched, setLoadsTouched] = useState(false);
  const toggleLoad = (leak: IsolationLeak, on: boolean) => {
    setLoads((before) => [...before.filter((l) => !(l.kind === leak.kind && l.scope === leak.scope)), ...(on ? [leak] : [])]);
    setLoadsTouched(true);
  };
  const save = useAction((draft: AiProfileDraft) => settings.saveAiProfile(draft));
  const value = (key: TextKey) => values[key] ?? '';
  const set = (key: TextKey, text: string) => {
    setValues((before) => ({ ...before, [key]: text }));
    setTouched((before) => new Set(before).add(key));
  };
  // com um agente ACP o comando é o do catálogo: o campo de comando deixa de ser obrigatório
  const acp = kind === 'custom' && !!value('acpAgent').trim();
  const commandMissing = kind === 'custom' && !acp && !value('command').trim() && (!profile || !profile.credentials?.available);
  const projectPathMissing = boardServer === 'project' && !value('mcpProjectFile').trim();
  const nameMissing = !name.trim();
  const valid = !nameMissing && !commandMissing && !projectPathMissing && !save.busy;

  const submit = async () => {
    if (!valid) return;
    const config: AiProfileConfig = {};
    for (const key of touched) {
      const text = value(key);
      if (!text.trim() && key !== 'extraArgs' && key !== 'args' && key !== 'authPatterns') continue;
      if (key === 'extraArgs' || key === 'args' || key === 'authPatterns') config[key] = lines(text);
      else config[key] = text.trim();
    }
    if (kind === 'custom') {
      if (promptVia !== '__keep') config.promptVia = promptVia;
      if (boardServer !== '__keep') config.boardServer = boardServer;
      if (permissionTouched.size)
        config.permissionArgs = Object.fromEntries(
          [...permissionTouched].map((level) => [level, lines(permission[level])]),
        ) as AiProfileConfig['permissionArgs'];
    }
    // a declaração só é gravada quando a pessoa mexe nela; vazia continua sendo "nenhum item conhecido", não prova
    if (loadsTouched) config.isolation = { loads };
    if (envTouched) {
      config.env = Object.fromEntries(envRows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), row.value]));
    }
    const draft: AiProfileDraft = {
      ...(profile ? { id: profile.id } : {}),
      name: name.trim(),
      kind,
      base: kind === 'copy' ? profile!.base : 'generic',
      enabled: profile?.enabled ?? true,
      position: profile?.position ?? 100,
      config,
    };
    if (await save.run(draft)) onSaved();
  };
  const field = (key: TextKey, label: string, hint?: string, multiline = false) => (
    <FormField label={t(label)} hint={hint ? t(hint) : undefined}>
      {(id) =>
        multiline ? (
          <TextArea id={id} value={value(key)} onChange={(e) => set(key, e.target.value)} rows={3} />
        ) : (
          <TextField.Root id={id} value={value(key)} onChange={(e) => set(key, e.target.value)} />
        )
      }
    </FormField>
  );

  return (
    <Card
      className="form-card ai-profile-form"
      aria-label={profile ? t('Editar perfil {name}', { name: profile.name }) : t('Novo perfil de CLI')}
    >
      <h3>{profile ? t('Editar perfil {name}', { name: profile.name }) : t('Novo perfil de CLI')}</h3>
      {profile && <p className="muted">{t('Os valores salvos não são mostrados. Deixe um campo vazio para manter o valor atual.')}</p>}
      {profile?.credentials?.review === 'pending' && (
        <p className="ai-profile-notice">
          {t('Este perfil está pendente de revisão local. Salvar a configuração confirma a revisão; ligar é uma ação separada.')}
        </p>
      )}
      <div className="form-grid">
        <FormField label={t('Nome')} hint={nameMissing ? t('Informe o nome do perfil.') : undefined}>
          {(id) => <TextField.Root id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        {kind === 'custom' &&
          field(
            'acpAgent',
            'Agente ACP',
            'Id do agente no catálogo ACP (gemini, antigravity-acp, opencode, codex-acp, cursor, kimi, github-copilot-cli, qwen-code, goose). Vazio: CLI de uma passada.',
          )}
        {!acp && (
          <FormField
            label={t('Comando')}
            hint={
              commandMissing ? t('Informe o comando do perfil personalizado.') : profile ? t('Vazio mantém o comando salvo.') : undefined
            }
          >
            {(id) => <TextField.Root id={id} value={value('command')} onChange={(e) => set('command', e.target.value)} />}
          </FormField>
        )}
        {acp && (
          <p className="ai-profile-notice">
            {t(
              'O perfil roda pelo Agent Client Protocol: o comando, os argumentos e as permissões são os do agente, respondidas pelo card.',
            )}
          </p>
        )}
        {kind === 'copy' ? (
          field('extraArgs', 'Argumentos extras', 'Um argumento por linha.', true)
        ) : acp ? null : (
          <>
            {field(
              'args',
              'Argumentos',
              'Um argumento por linha. Use {prompt}, {model}, {effort}, {mcpConfig} ou {addDir}. Um argumento literal com espaços não é suportado.',
              true,
            )}
            <FormField label={t('Entrada do pedido')}>
              {(id) => (
                <SelectField
                  id={id}
                  value={promptVia}
                  onChange={setPromptVia}
                  options={[
                    ...(profile ? [{ value: '__keep' as const, label: t('Manter valor salvo') }] : []),
                    { value: 'stdin', label: t('Entrada padrão') },
                    { value: 'arg', label: t('Argumento') },
                  ]}
                />
              )}
            </FormField>
            {promptVia === 'arg' && (
              <p className="ai-profile-notice">
                {t('No Windows, um argumento pode ultrapassar o limite de 8191 caracteres da linha de comando.')}
              </p>
            )}
            <FormField label={t('Servidor do board')}>
              {(id) => (
                <SelectField
                  id={id}
                  value={boardServer}
                  onChange={setBoardServer}
                  options={[
                    ...(profile ? [{ value: '__keep' as const, label: t('Manter valor salvo') }] : []),
                    { value: 'cli', label: t('Arquivo pela linha de comando') },
                    { value: 'project', label: t('Arquivo do projeto') },
                    { value: 'none', label: t('Nenhum') },
                  ]}
                />
              )}
            </FormField>
            {boardServer === 'project' &&
              field(
                'mcpProjectFile',
                'Caminho do arquivo MCP no projeto',
                projectPathMissing ? 'Informe o arquivo MCP do projeto.' : undefined,
              )}
            {boardServer === 'none' && (
              <p className="ai-profile-notice">{t('Sem servidor do board, a CLI não poderá mover cards por MCP.')}</p>
            )}
            {(['board', 'edits', 'full'] as const).map((level) => (
              <FormField
                key={level}
                label={t(
                  level === 'board'
                    ? 'Argumentos: só o board'
                    : level === 'edits'
                      ? 'Argumentos: board e arquivos'
                      : 'Argumentos: sem restrições',
                )}
                hint={t('Um argumento por linha. Ausente não significa isolamento verificado.')}
              >
                {(id) => (
                  <TextArea
                    id={id}
                    value={permission[level]}
                    rows={2}
                    onChange={(e) => {
                      setPermission((before) => ({ ...before, [level]: e.target.value }));
                      setPermissionTouched((before) => new Set(before).add(level));
                    }}
                  />
                )}
              </FormField>
            ))}
            {field('versionArgs', 'Argumentos de versão')}
            {field('statusArgs', 'Argumentos do status do login')}
            {field('authPatterns', 'Frases de login vencido', 'Uma frase por linha.', true)}
          </>
        )}
        <FormField
          label={t('Variáveis de ambiente')}
          hint={t('O valor é privado; vazio com um nome preenchido remove essa variável salva.')}
        >
          {(id) => (
            <div className="ai-profile-env-list">
              {envRows.map((row, index) => (
                <div className="row" key={index}>
                  <TextField.Root
                    id={index === 0 ? id : undefined}
                    aria-label={t('Nome da variável {number}', { number: index + 1 })}
                    placeholder={t('Nome da variável')}
                    value={row.name}
                    onChange={(e) => {
                      setEnvRows((before) => before.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)));
                      setEnvTouched(true);
                    }}
                  />
                  <TextField.Root
                    aria-label={t('Valor da variável {number}', { number: index + 1 })}
                    type={row.show ? 'text' : 'password'}
                    placeholder={t('Valor')}
                    value={row.value}
                    onChange={(e) => {
                      setEnvRows((before) => before.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)));
                      setEnvTouched(true);
                    }}
                  />
                  <Button
                    variant="soft"
                    color="gray"
                    onClick={() => setEnvRows((before) => before.map((item, i) => (i === index ? { ...item, show: !item.show } : item)))}
                  >
                    {row.show ? t('Ocultar') : t('Mostrar')}
                  </Button>
                </div>
              ))}
              <Button variant="soft" color="gray" onClick={() => setEnvRows((before) => [...before, { name: '', value: '', show: false }])}>
                {t('Adicionar variável')}
              </Button>
            </div>
          )}
        </FormField>
        {field('installUrl', 'Endereço de instalação')}
        <fieldset className="ai-profile-isolation">
          <legend>{t('O que a CLI carrega por conta própria')}</legend>
          {profile && kind === 'copy' && profileIsolation(profile).args.length > 0 && (
            <p className="muted">
              {t('Argumentos de isolamento: {args}', {
                args: profileIsolation(profile)
                  .args.map((a) => a || '""')
                  .join(' '),
              })}
            </p>
          )}
          {profile && kind === 'copy' && profileIsolation(profile).checked && (
            <p className="muted">
              {t('Conferido na documentação em {date} · versão {version}', {
                date: profileIsolation(profile).checked!.date,
                version: profileIsolation(profile).checked!.version,
              })}
            </p>
          )}
          <p className="muted">
            {t(
              'Marque o que a CLI lê sozinha mesmo com os argumentos acima. Sem nada marcado, o board não conhece itens carregados, mas isso não prova contexto vazio: só a verificação do host prova.',
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th />
                {scopes.map(([, label]) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ISOLATION_KINDS.map((k) => (
                <tr key={k}>
                  <th scope="row">{t(kindLabel[k])}</th>
                  {scopes.map(([scope, label]) => (
                    <td key={scope}>
                      <input
                        type="checkbox"
                        aria-label={`${t(kindLabel[k])} · ${t(label)}`}
                        checked={loads.some((l) => l.kind === k && l.scope === scope)}
                        onChange={(e) => toggleLoad({ kind: k, scope }, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      </div>
      {save.error && (
        <p className="ai-profile-error" role="alert">
          {t(save.error)}
        </p>
      )}
      <div className="form-actions">
        <Button variant="soft" color="gray" onClick={onClose}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!valid} loading={save.busy} onClick={() => void submit()}>
          {t('Salvar perfil')}
        </Button>
      </div>
    </Card>
  );
}
