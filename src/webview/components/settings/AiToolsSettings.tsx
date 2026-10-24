import { useEffect, useState } from 'react';
import { Badge, RadioGroup } from '@radix-ui/themes';
import {
  PROFILE_CAPABILITIES,
  contextEnforced,
  isReadyProfile,
  modeLabel,
  profileIsolation,
  toolLabel,
  verifiableProfile,
  type AiProfile,
} from '../../../shared/aiProfiles';
import type { HostToWebview } from '../../../shared/messages';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { isolationText, leaksList } from '../../isolation';
import { useAction } from '../../useAction';
import { onHostMessage } from '../../vscode';
import { ActionButton, DeleteButton, IconPlus, SwitchField } from '../ui';
import { AiProfileForm } from './AiProfileForm';
import { ConnectTool, STEP_NAMES, connectionSummary, reviewText } from './ConnectTool';
import { SectionHeader } from './SectionHeader';
import { toolModeEntry } from '../../../shared/aiTools';
import { ExecutionPoliciesSettings } from './policies/ExecutionPoliciesSettings';
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
  const reconnect = useAction((id: string) => settings.connectAiProfile(id));
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  // os perfis em verificação, cada um com o próprio estado: verificar um não trava o botão dos outros (o host
  // coordena uma verificação por perfil). O erro chega pelo aviso do host, como nas outras ações
  const [verifying, setVerifying] = useState<ReadonlySet<string>>(new Set());
  const runVerify = async (id: string) => {
    if (verifying.has(id)) return;
    setVerifying((before) => new Set(before).add(id));
    try {
      await settings.verifyAiProfile(id);
    } catch {
      // a recusa já virou aviso na tela
    } finally {
      setVerifying((before) => {
        const next = new Set(before);
        next.delete(id);
        return next;
      });
    }
  };
  const openConnect = useBoardStore((s) => s.openConnect);
  /**
   * O personalizado pelo ACP (o de uma versão anterior, a cópia de um agente pronto, o importado): segue rodando,
   * com o aviso e o caminho do Conectar; o formulário novo é só de CLI.
   */
  const customAcp = (p: AiProfile) => p.kind === 'custom' && p.mode === 'acp';
  /** O perfil pronto de um modo que o catálogo oferece: é ele que o Conectar conduz. */
  const connectable = (p: AiProfile) => isReadyProfile(p) && !!toolModeEntry(p.tool, p.mode);
  /** O estado do Conectar do perfil: versão, login, regime, modelos e data, ou o passo em que parou. */
  const connectionLine = (p: AiProfile): string => {
    const c = state.connections?.[p.id];
    if (!c) return t('Não conectada pelo Conectar');
    if (c.status === 'connected') return `${t('Conectada')} · ${connectionSummary(c.summary, reviewOf(p))}`;
    const step = t(STEP_NAMES[c.step]);
    if (c.status === 'waiting')
      return t('O Conectar espera você no passo "{step}": continue no cartão em Conectar ferramenta, acima.', { step });
    return t(c.status === 'failed' ? 'Conectar parou com erro no passo "{step}"' : 'Conectar em andamento: "{step}"', { step });
  };
  const review = useAction((id: string, accept: boolean) => settings.reviewAiProfile(id, accept));
  /** A ciência do regime compatível do perfil, a de agora (o runner do board), ou null. */
  const reviewOf = (p: AiProfile): number | null => state.board.runner.compatibilityReviews?.[p.id] ?? null;
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
  // o rótulo é "ferramenta · modo" ("Gemini · ACP"); a cópia e o personalizado dizem também de onde vêm
  const typeOf = (p: AiProfile) => {
    const mode = modeLabel(p.mode);
    return isReadyProfile(p)
      ? `${toolLabel(p.tool)} · ${mode}`
      : p.kind === 'custom'
        ? t('Personalizado · {mode}', { mode })
        : t('Cópia de {base}', { base: `${toolLabel(p.tool)} · ${mode}` });
  };
  const statusOf = (p: AiProfile) => {
    const s = statuses[p.id];
    if (!s) return t('A verificar');
    if (s.skipped === 'off') return t('Desligada: ligue para verificar');
    if (s.skipped === 'pending') return t('Pendente de revisão: salve o perfil para verificar');
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
          </>
        }
      >
        {t('Os perfis de CLI são dados do board. Configuração não comprova isolamento, permissões ou acesso ao MCP.')}
      </PageHeader>
      <ConnectTool />
      <div className="ai-tools-layout">
        <div>
          <SectionHeader title={t('Perfis')} count={profiles.length} />
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
                      {!isReadyProfile(profile) && (
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
                      {!isReadyProfile(profile) && !standard && (
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
                    {connectable(profile) && (
                      <>
                        <span className="muted" data-testid={`connection-${profile.id}`}>
                          {connectionLine(profile)}
                        </span>
                        <ActionButton
                          size="1"
                          variant="soft"
                          color="gray"
                          hint={t('Refaz o login, a verificação e a leitura dos modelos deste perfil.')}
                          disabled={state.connections?.[profile.id]?.status === 'running'}
                          loading={reconnect.busy && reconnectingId === profile.id}
                          onClick={() => {
                            setReconnectingId(profile.id);
                            void reconnect.run(profile.id);
                          }}
                        >
                          {t(state.connections?.[profile.id] ? 'Reconectar' : 'Conectar')}
                        </ActionButton>
                      </>
                    )}
                    {/* quem não passa pelo Conectar (cópias, personalizados) dá ou revoga a ciência aqui; o
                        perfil do Conectar com ciência também a revoga daqui */}
                    {(reviewOf(profile) !== null || (!connectable(profile) && verifiableProfile(profile))) && (
                      <>
                        <span className="muted" data-testid={`review-${profile.id}`}>
                          {reviewOf(profile) !== null
                            ? t('Regime compatível com a sua ciência (revisão {n})', { n: reviewOf(profile)! })
                            : t('Sem ciência do regime compatível')}
                        </span>
                        <ActionButton
                          size="1"
                          variant="soft"
                          color="gray"
                          hint={
                            reviewOf(profile) !== null
                              ? t('Tira a sua ciência do regime compatível: o perfil deixa de rodar até você dar a ciência de novo.')
                              : t('Grava a sua ciência do regime compatível para este perfil, depois de ler o que ele carrega.')
                          }
                          disabled={!profile.enabled || review.busy}
                          disabledReason={t('Ligue o perfil antes.')}
                          onClick={() =>
                            reviewOf(profile) !== null
                              ? void review.run(profile.id, false)
                              : ask({
                                  title: t('Dar ciência do regime compatível ao perfil "{name}"?', { name: profile.name }),
                                  message: reviewText(profile.name),
                                  confirmLabel: t('Entendo o que a ferramenta carrega'),
                                  onConfirm: () => review.run(profile.id, true),
                                })
                          }
                        >
                          {t(reviewOf(profile) !== null ? 'Revogar ciência' : 'Dar ciência do regime compatível')}
                        </ActionButton>
                      </>
                    )}
                    {/* o perfil verificável sem Conectar (a cópia do Claude Code, o personalizado ACP) refaz as provas
                        por aqui: é o caminho que ficou no lugar do comando da paleta (história 13) */}
                    {!connectable(profile) && verifiableProfile(profile) && (
                      <ActionButton
                        size="1"
                        variant="soft"
                        color="gray"
                        hint={t(
                          'Refaz as sondas de capacidade deste perfil numa pasta descartável e grava as provas, sem gastar a sua conta.',
                        )}
                        disabled={!profile.enabled || profile.credentials?.review === 'pending'}
                        disabledReason={
                          profile.credentials?.review === 'pending'
                            ? t('Revise o perfil antes: salve a configuração dele no formulário.')
                            : t('Ligue o perfil antes.')
                        }
                        // trava só o perfil em verificação: os outros seguem verificáveis ao mesmo tempo
                        loading={verifying.has(profile.id)}
                        onClick={() => void runVerify(profile.id)}
                      >
                        {t('Verificar capacidades')}
                      </ActionButton>
                    )}
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
                  {customAcp(profile) && (
                    <div className="ai-profile-notice ai-profile-legacy" role="note">
                      <p>
                        {t(
                          'Personalizado pelo ACP: continua rodando como está. O caminho normal é Conectar ferramenta, com o agente do catálogo no modo ACP; perfis personalizados novos são só de CLI.',
                        )}
                      </p>
                      {/* só quando o catálogo oferece o modo ACP do agente: o Cursor e o Kimi Code têm só o cartão da
                          CLI, e o botão levaria a pessoa a outro modo */}
                      {toolModeEntry(String(profile.config.acpAgent), 'acp') && (
                        <ActionButton
                          size="1"
                          variant="soft"
                          hint={t('Abre o Conectar ferramenta no agente deste perfil.')}
                          onClick={() => openConnect(String(profile.config.acpAgent))}
                        >
                          {t('Abrir o Conectar')}
                        </ActionButton>
                      )}
                    </div>
                  )}
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
          {/* o perfil personalizado saiu do caminho normal (história 13): as ferramentas do catálogo entram pelo
              Conectar, e o formulário fica atrás de "Avançado", só para uma CLI que o catálogo não traz */}
          <details className="ai-tools-advanced">
            <summary>{t('Avançado')}</summary>
            <p className="muted">
              {t(
                'Perfil de CLI personalizado, para uma linha de comando que o catálogo não traz. Ele roda pela CLI de uma passada: o board não mede tokens nem custo, não verifica as capacidades e só orienta pelo pedido o agente, as skills, o MCP e as ferramentas. Para as ferramentas do catálogo, use Conectar ferramenta, acima.',
              )}
            </p>
            <ActionButton
              hint={t('Abre o formulário de um perfil de CLI personalizado.')}
              disabled={editor !== null}
              onClick={() => setEditor('new')}
            >
              <IconPlus /> {t('Novo perfil de CLI personalizado')}
            </ActionButton>
          </details>
          <ExecutionPoliciesSettings />
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
