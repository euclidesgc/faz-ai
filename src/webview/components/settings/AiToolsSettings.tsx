import { useEffect, useState } from 'react';
import { Badge, RadioGroup } from '@radix-ui/themes';
import { PROFILE_CAPABILITIES, contextEnforced, profileIsolation, type AiProfile } from '../../../shared/aiProfiles';
import type { HostToWebview } from '../../../shared/messages';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { isolationText, leaksList } from '../../isolation';
import { useAction } from '../../useAction';
import { onHostMessage } from '../../vscode';
import { ActionButton, DeleteButton, IconPlus, SwitchField } from '../ui';
import { AiProfileForm } from './AiProfileForm';
import { PageHeader } from './PageHeader';
import { SettingsCard } from './SettingsCard';

type Status = Extract<HostToWebview, { type: 'aiProfiles.status' }>['profiles'][string];
type TestResult = Extract<HostToWebview, { type: 'aiProfiles.testResult' }>;
const capabilityName: Record<(typeof PROFILE_CAPABILITIES)[number], string> = {
  conversation: 'Conversa nova',
  artifacts: 'Controle de artefatos',
  permissions: 'Permissões',
  mcp: 'MCP',
  delegation: 'Delegação',
  cancellation: 'Cancelamento',
  output: 'Saída',
};

/** A configuração fica no host; esta aba só recebe metadados, situação e o resultado redigido do Testar. */
export function AiToolsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const goToSection = useBoardStore((s) => s.goToSection);
  const ask = useBoardStore((s) => s.ask);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [editor, setEditor] = useState<AiProfile | 'new' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const probe = useAction(() => settings.probeAiProfiles());
  const enabled = useAction((id: string, on: boolean) => settings.setAiProfileEnabled(id, on));
  const selectDefault = useAction((id: string) => settings.updateBoard({ aiTool: id }));
  const duplicate = useAction((id: string) => settings.duplicateAiProfile(id));
  const remove = useAction((id: string) => settings.removeAiProfile(id));
  const test = useAction((id: string) => settings.testAiProfile(id));
  useEffect(() => {
    const off = onHostMessage((msg) => {
      if (msg.type === 'aiProfiles.status') setStatuses(msg.profiles);
      if (msg.type === 'aiProfiles.testResult') setResults((before) => ({ ...before, [msg.id]: msg }));
    });
    void probe.run();
    return off;
    // A consulta acontece na entrada da aba; salvar pede outra consulta explicitamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTest = async (id: string) => {
    setTestingId(id);
    setResults((before) => {
      const next = { ...before };
      delete next[id];
      return next;
    });
    await test.run(id);
    setTestingId(null);
  };
  const onSaved = () => {
    setEditor(null);
    void settings.probeAiProfiles();
  };
  const profiles = state.board.aiProfiles;
  const typeOf = (p: AiProfile) =>
    p.kind === 'builtin' ? t('Perfil pronto') : p.kind === 'custom' ? t('Personalizado') : t('Cópia de {base}', { base: p.base });
  const statusOf = (p: AiProfile) => {
    const s = statuses[p.id];
    if (!s) return t('A verificar');
    if (!s.found) return t('Não encontrada');
    if (s.signedIn === false) return t('Login vencido');
    if (s.signedIn === null)
      return s.version
        ? t('Encontrada · {version} · login não verificado', { version: s.version })
        : t('Encontrada · login não verificado');
    return s.version ? t('Encontrada · {version}', { version: s.version }) : t('Encontrada');
  };
  return (
    <div>
      <PageHeader
        title={t('Ferramentas de IA')}
        actions={
          <>
            <ActionButton
              hint={t('Consulta instalação, versão e login de cada perfil.')}
              loading={probe.busy}
              onClick={() => void probe.run()}
            >
              {t('Verificar situação')}
            </ActionButton>
            <ActionButton
              hint={t('Abre o formulário de um perfil de CLI personalizado.')}
              disabled={editor !== null}
              onClick={() => setEditor('new')}
            >
              <IconPlus /> {t('Novo perfil')}
            </ActionButton>
          </>
        }
      >
        {t('Os perfis de CLI são dados do board. Configuração não comprova isolamento, permissões ou acesso ao MCP.')}
      </PageHeader>
      <div className="ai-tools-layout">
        <div>
          <div className="row ai-tools-policy-link">
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Abre as políticas de execução e fallback no Harness.')}
              onClick={() => goToSection('execution-policies')}
            >
              {t('Políticas de execução e fallback')}
            </ActionButton>
          </div>
          <RadioGroup.Root value={state.board.aiTool} onValueChange={(id) => void selectDefault.run(id)} aria-label={t('Perfil padrão')}>
            {profiles.map((profile) => {
              const standard = state.board.aiTool === profile.id;
              const status = statuses[profile.id];
              const result = results[profile.id];
              return (
                <SettingsCard
                  key={profile.id}
                  title={profile.name}
                  off={!profile.enabled}
                  badge={{ text: typeOf(profile), on: profile.enabled }}
                  hint={profile.credentials?.review === 'pending' ? t('Pendente de revisão local') : undefined}
                  actions={
                    <div className="row-actions">
                      <ActionButton
                        size="1"
                        variant="soft"
                        color="gray"
                        hint={t('Executa um pedido curto nesta CLI; usa a sua assinatura.')}
                        disabled={!profile.enabled || test.busy}
                        loading={test.busy && testingId === profile.id}
                        onClick={() =>
                          ask({
                            title: t('Testar o perfil "{name}"?', { name: profile.name }),
                            message: t(
                              'O teste roda a ferramenta e usa a sua assinatura. Uma resposta OK não comprova isolamento, permissões ou MCP.',
                            ),
                            confirmLabel: t('Testar'),
                            onConfirm: () => runTest(profile.id),
                          })
                        }
                      >
                        {t('Testar')}
                      </ActionButton>
                      <ActionButton
                        size="1"
                        variant="soft"
                        color="gray"
                        hint={t('Cria uma cópia desativada, pendente de revisão.')}
                        loading={duplicate.busy}
                        onClick={() => void duplicate.run(profile.id)}
                      >
                        {t('Duplicar')}
                      </ActionButton>
                      {profile.kind !== 'builtin' && (
                        <ActionButton
                          size="1"
                          variant="soft"
                          color="gray"
                          hint={t('Edita os metadados; valores salvos não são mostrados.')}
                          onClick={() => setEditor(profile)}
                        >
                          {t('Editar')}
                        </ActionButton>
                      )}
                      {profile.kind !== 'builtin' && !standard && (
                        <DeleteButton
                          variant="ghost"
                          question={t('Apagar o perfil "{name}"?', { name: profile.name })}
                          message={t('Os cards que mencionam este perfil manterão o identificador antigo.')}
                          onConfirm={() => remove.run(profile.id)}
                        >
                          {t('Apagar')}
                        </DeleteButton>
                      )}
                    </div>
                  }
                >
                  <div className="ai-profile-controls">
                    <SwitchField
                      label={t('Ligado')}
                      checked={profile.enabled}
                      disabled={standard || enabled.busy || profile.credentials?.review === 'pending'}
                      onChange={(on) => void enabled.run(profile.id, on)}
                    />
                    <label className="row">
                      <RadioGroup.Item value={profile.id} disabled={!profile.enabled || selectDefault.busy} /> {t('Padrão')}
                    </label>
                    <span className="muted">{statusOf(profile)}</span>
                    {status && !status.found && status.installUrl && (
                      <a href={status.installUrl} target="_blank" rel="noopener noreferrer">
                        {t('Instalar')}
                      </a>
                    )}
                    {profile.kind === 'custom' && <span className="muted">{t('Não mede tokens nem custo')}</span>}
                    {(() => {
                      const iso = profileIsolation(profile);
                      const enforced = contextEnforced(profile);
                      const leaks = iso.loads.length > 0 || !!iso.unrecognized;
                      return (
                        <Badge
                          variant="soft"
                          color={enforced ? 'green' : leaks ? 'amber' : 'gray'}
                          title={leaks ? leaksList(iso) : isolationText(iso, enforced)}
                        >
                          {t(enforced ? 'Contexto vazio' : leaks ? 'Carrega por conta própria' : 'Sem prova de isolamento')}
                        </Badge>
                      );
                    })()}
                  </div>
                  <details className="ai-profile-evidence">
                    <summary>{t('Capacidades e evidências')}</summary>
                    <div className="ai-profile-capabilities">
                      {PROFILE_CAPABILITIES.map((capability) => (
                        <span key={capability}>
                          {t(capabilityName[capability])}:{' '}
                          <Badge variant="soft" color="gray">
                            {t(
                              profile.capabilities?.[capability] === 'verified'
                                ? 'Verificado'
                                : profile.capabilities?.[capability] === 'partial'
                                  ? 'Parcial'
                                  : 'Desconhecido',
                            )}
                          </Badge>
                        </span>
                      ))}
                    </div>
                    <p className="muted">
                      {t('Fonte e versão da evidência: não informadas. Uma declaração da pessoa não recebe selo de verificação.')}
                    </p>
                    {profileIsolation(profile).checked && (
                      <p className="muted">
                        {t('Conferido na documentação em {date} · versão {version}', {
                          date: profileIsolation(profile).checked!.date,
                          version: profileIsolation(profile).checked!.version,
                        })}
                      </p>
                    )}
                    {status && (
                      <p className="muted">
                        {t('Fonte da situação: sonda local do host. Versão da CLI: {version}.', {
                          version: status.version ?? t('desconhecida'),
                        })}
                      </p>
                    )}
                  </details>
                  {test.busy && testingId === profile.id && (
                    <p role="status" className="row">
                      <span className="spinner" aria-hidden="true" />
                      {t('Testando perfil…')}
                    </p>
                  )}
                  {result && (
                    <div className={result.ok ? 'ai-profile-result' : 'ai-profile-error'} role={result.ok ? 'status' : 'alert'}>
                      {result.error && <p>{t(result.error)}</p>}
                      {result.output && <pre>{result.output}</pre>}
                      {result.ok && <p className="muted">{t('A resposta não comprova isolamento, permissões ou MCP.')}</p>}
                    </div>
                  )}
                </SettingsCard>
              );
            })}
          </RadioGroup.Root>
          {profiles.length === 0 && <p className="muted">{t('Nenhum perfil cadastrado.')}</p>}
        </div>
        {editor && (
          <AiProfileForm
            key={editor === 'new' ? 'new' : editor.id}
            profile={editor === 'new' ? undefined : editor}
            onClose={() => setEditor(null)}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}
