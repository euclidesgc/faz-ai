import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PROFILE_CAPABILITIES, type ProfileCapability, isReadyCli, isReadyProfile, modeLabel } from '../../../shared/aiProfiles';
import type { CapabilityState } from '../../../shared/executionAdmission';
import { toolModeEntry, toolModeOf } from '../../../shared/aiTools';
import { leaksList } from '../../isolation';
import { onHostMessage } from '../../vscode';
import { useAction } from '../../useAction';
import type { ProfileHealth } from '../../../shared/profileHealth';
import { t } from '../../i18n';
import { settings, ui } from '../../commands';
import { isWeb } from '../../vscode';
import { useBoardStore } from '../../store/boardStore';
import { useAgentConnectStore } from '../../store/agentConnectStore';
import { CopyCommand } from '../RequirementsBanner';
import { Button, IconExternal, IconMissing, IconOk, IconSkipped } from '../ui';

type RowState = 'ok' | 'missing' | 'unknown';

const ICON = {
  ok: <IconOk className="env-ok" aria-hidden />,
  missing: <IconMissing className="env-missing" aria-hidden />,
  unknown: <IconSkipped className="env-skipped" aria-hidden />,
};

/** Uma linha do bloco: o ícone, o rótulo em texto (nunca só o ícone) e o que vem junto. */
function Line({ state, label, children }: { state: RowState; label: string; children?: ReactNode }) {
  return (
    <li className={`env-item ${state === 'unknown' ? 'skipped' : state}`}>
      <div className="env-row">
        {ICON[state]}
        <span>{label}</span>
      </div>
      {children}
    </li>
  );
}

const CAPABILITY_NAME: Record<ProfileCapability, string> = {
  conversation: 'Conversa nova',
  artifacts: 'Controle de artefatos',
  permissions: 'Permissões',
  mcp: 'MCP',
  delegation: 'Delegação',
  cancellation: 'Cancelamento',
  output: 'Saída',
};
const STATE_NAME: Record<CapabilityState, string> = { verified: 'Verificada', partial: 'Parcial', unknown: 'Desconhecida' };

/**
 * Capacidades e admissão, como vieram da verificação do host: o selo de pronto só aparece na capacidade
 * verificada; parcial e desconhecida nunca são mostradas como verificadas.
 */
function Capabilities({ health }: { health: ProfileHealth }) {
  const { evidence, admission } = health;
  const when = evidence.checkedAt ? new Date(evidence.checkedAt).toLocaleDateString() : '';
  return (
    <>
      {PROFILE_CAPABILITIES.map((capability, i) => {
        const state = health.capabilities[i] ?? 'unknown';
        return (
          <Line
            key={capability}
            state={state === 'verified' ? 'ok' : 'unknown'}
            label={`${t(CAPABILITY_NAME[capability])}: ${t(STATE_NAME[state])}`}
          >
            {state === 'verified' && evidence.state === 'valid' && (
              <p className="small muted">{t('em {version}, {date}', { version: evidence.version ?? '', date: when })}</p>
            )}
          </Line>
        );
      })}
      {health.verifiable && health.capabilities.every((c) => c === 'unknown') && <VerifyCapabilities health={health} />}
      {admission && (
        <Line
          state={admission.state === 'admitted' ? 'ok' : 'missing'}
          label={
            admission.state === 'admitted'
              ? t('Admissível com o contexto {regime}', {
                  regime: admission.regime === 'exclusive' ? t('fechado (regime exclusivo)') : t('aberto (regime compatível)'),
                })
              : t('Não admissível')
          }
        >
          {admission.state !== 'admitted' && admission.reasons.length > 0 && (
            <ul className="env-commands small">
              {admission.reasons.map((r, i) => (
                <li key={`${r.code}-${r.capability ?? ''}-${r.resourceId ?? ''}-${i}`}>
                  {r.capability ? `${r.code} · ${t(CAPABILITY_NAME[r.capability])}` : r.code}
                </li>
              ))}
            </ul>
          )}
          {admission.regime === 'compatible' && health.isolation && (
            <p className="small muted">{t('Pode carregar por conta própria: {list}', { list: leaksList(health.isolation) })}</p>
          )}
        </Line>
      )}
    </>
  );
}

/**
 * O caminho para os recibos de capacidade, sem sair da tela: o perfil do catálogo verifica num passo do Conectar
 * (o botão abre a aba Conexão dele em Conectar agentes); a cópia e o personalizado ACP verificam aqui mesmo, pelo
 * mesmo pedido do "Verificar capacidades" da aba Conexão, e o relatório é refeito ao fim. A verificação roda numa
 * pasta descartável e não gasta a conta: a frase diz isso, para a pessoa não confundir com o Testar.
 */
function VerifyCapabilities({ health }: { health: ProfileHealth }) {
  const openConnect = useBoardStore((s) => s.openConnect);
  const openSettings = useBoardStore((s) => s.openSettings);
  const connectable = isReadyProfile(health) && !!toolModeEntry(health.tool, health.mode);
  const verify = useAction(async () => {
    await settings.verifyAiProfile(health.id);
    await ui.checkEnvironment();
  });
  const openProfile = () => {
    if (connectable) {
      openConnect(health.id);
      return;
    }
    useAgentConnectStore.getState().select(health.id, 'connection');
    openSettings('connect');
  };
  return (
    <li className="env-item skipped">
      <div className="env-fix">
        <p className="small muted">
          {connectable
            ? t(
                'Sem recibos de capacidade: a verificação é um passo do Conectar de {name}, em Conectar agentes. Ela roda numa pasta descartável e não gasta a sua conta.',
                {
                  name: health.name,
                },
              )
            : t('Sem recibos de capacidade: a verificação roda numa pasta descartável e não gasta a sua conta.')}
        </p>
        {connectable ? (
          <Button size="small" variant="primary" onClick={openProfile}>
            {t('Abrir Conectar agentes')}
          </Button>
        ) : (
          <>
            <Button
              size="small"
              variant="primary"
              disabled={verify.busy || health.registration !== 'enabled'}
              onClick={() => void verify.run()}
            >
              {t('Verificar capacidades')}
            </Button>
            {verify.busy && (
              <p role="status" className="small muted">
                {t('Verificando…')}
              </p>
            )}
            <Button size="small" variant="secondary" onClick={openProfile}>
              {t('Abrir o perfil')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * O Testar do Diagnóstico: o mesmo da tela Conectar agentes (a mesma mensagem ao host, que roda a
 * ferramenta pelo gateway e confere o ambiente de novo ao fim). Um clique por vez. O resultado aparece nos
 * dois sentidos (respondeu ou falhou), e o relatório da tela é refeito ao fim: sem isso a página parecia
 * parada depois de um teste que deu certo.
 */
function TestProfile({ id }: { id: string }) {
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const test = useAction(() => settings.testAiProfile(id));
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type !== 'aiProfiles.testResult' || msg.id !== id) return;
        setResult(msg.ok ? { ok: true } : { ok: false, error: msg.error ?? t('O teste não terminou com sucesso.') });
        void ui.checkEnvironment();
      }),
    [id],
  );
  const run = () => {
    if (test.busy) return;
    setResult(null);
    void test.run();
  };
  return (
    <div className="env-fix">
      <p className="small muted">
        {t('O teste roda a ferramenta uma vez e usa a sua assinatura. Ele não prova capacidades: para isso, a verificação acima.')}
      </p>
      <Button size="small" variant="secondary" disabled={test.busy} onClick={run}>
        {t('Testar')}
      </Button>
      {test.busy && (
        <p role="status" className="small muted">
          {t('Testando…')}
        </p>
      )}
      {result?.ok && !test.busy && (
        <p role="status" className="small">
          {t('A ferramenta respondeu.')}
        </p>
      )}
      {result && !result.ok && !test.busy && (
        <div role="alert" className="env-warning small">
          {result.error}
        </div>
      )}
    </div>
  );
}

/** A situação do cadastro, em palavras. */
function registrationLabel(h: ProfileHealth): string {
  return h.registration === 'enabled' ? t('Ligado') : h.registration === 'disabled' ? t('Desligado') : t('Pendente de revisão');
}

/**
 * O bloco de um perfil de CLI no Diagnóstico: situação, linha de comando (com a instalação, se falta),
 * login, credenciais e o estado da verificação real. O perfil pendente de revisão mostra só o aviso:
 * nenhum comando dele roda antes de a pessoa revisar.
 */
export function ProfileBlock({ health, focused }: { health: ProfileHealth; focused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  // o aviso do topo leva a este bloco: rola até ele
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: 'start' });
  }, [focused]);
  const id = `env-profile-${health.id}`;
  const probe = health.probe;
  // o login no terminal é o da linha do driver no catálogo (a CLI pronta e a cópia dela); o personalizado não tem
  const tool = toolModeOf(health);
  const login = tool ? toolModeEntry(tool.tool, tool.mode)?.cli?.login : undefined;
  const pending = health.registration === 'pending-review';
  return (
    <section ref={ref} aria-labelledby={id} className={`env-profile${focused ? ' focused' : ''}`}>
      <h4 id={id}>
        {health.name}
        {/* o modo em que o perfil roda (história 12): o mesmo Gemini tem requisitos diferentes na CLI, no ACP e na API */}
        {health.mode && <span className="muted"> · {modeLabel(health.mode)}</span>}
        {health.isDefault && <span className="muted"> · {t('Padrão')}</span>}
      </h4>
      <ul className="env-list">
        <Line state={health.registration === 'enabled' ? 'ok' : 'unknown'} label={registrationLabel(health)}>
          {pending && (
            <div className="env-fix">
              <p className="small muted">
                {t('Perfil importado: revise antes de usar. O board não roda nenhum comando dele enquanto isso.')}
              </p>
            </div>
          )}
        </Line>
        {!pending && (
          <>
            <Line
              state={probe?.found ? 'ok' : 'missing'}
              label={
                probe?.found
                  ? [t('Linha de comando encontrada'), probe.path, probe.version].filter(Boolean).join(' · ')
                  : t('Linha de comando não encontrada')
              }
            >
              {!probe?.found && (
                <div className="env-fix">
                  {health.install && 'steps' in health.install ? (
                    <>
                      <span className="small muted">
                        {health.install.steps.length > 1 ? t('Para instalar, em ordem:') : t('Para instalar:')}
                      </span>
                      <ol className="env-commands">
                        {health.install.steps.map((s) => (
                          <li key={s.command}>
                            <CopyCommand command={s.command} />
                          </li>
                        ))}
                      </ol>
                      <a href={health.install.docs} target="_blank" rel="noreferrer" className="small">
                        {health.install.docs.replace(/^https?:\/\//, '')} <IconExternal aria-hidden />
                      </a>
                    </>
                  ) : health.install ? (
                    <a href={health.install.url} target="_blank" rel="noreferrer" className="small">
                      {t('Como instalar')}: {health.install.url.replace(/^https?:\/\//, '')} <IconExternal aria-hidden />
                    </a>
                  ) : (
                    <span className="small muted">{t('Este perfil não informou como instalar.')}</span>
                  )}
                </div>
              )}
            </Line>
            <Line
              state={health.authExpired || probe?.login === 'signed-out' ? 'missing' : probe?.login === 'signed-in' ? 'ok' : 'unknown'}
              label={
                probe?.login === 'signed-out'
                  ? t('Login: desconectado')
                  : health.authExpired
                    ? t('Login: venceu numa execução')
                    : probe?.login === 'signed-in'
                      ? t('Login: conectado')
                      : probe?.found
                        ? t('Login: não conferido (o perfil não tem comando de status)')
                        : t('Login: não conferido (falta a linha de comando)')
              }
            >
              {(probe?.login === 'signed-out' || health.authExpired) && isReadyCli(health) && login && (
                <div className="env-fix">
                  <CopyCommand command={login} />
                  {!isWeb && (
                    <Button size="small" variant="primary" onClick={() => ui.openTerminal(login)}>
                      {t('Abrir no terminal')}
                    </Button>
                  )}
                </div>
              )}
            </Line>
          </>
        )}
        {health.credentials.map((c) => (
          <Line
            key={c.name}
            state={c.filled ? 'ok' : 'missing'}
            label={c.filled ? t('Credencial {name}: preenchida', { name: c.name }) : t('Credencial {name}: ausente', { name: c.name })}
          />
        ))}
        {!pending && (
          <Line
            state={health.evidence.state === 'valid' ? 'ok' : 'unknown'}
            label={
              health.evidence.state === 'valid'
                ? t('Verificado em {version}', { version: health.evidence.version ?? '' })
                : health.evidence.state === 'stale'
                  ? t('Precisa verificar de novo: a linha de comando mudou desde o último teste')
                  : t('Não validado: este perfil ainda não foi testado')
            }
          />
        )}
        {!pending && <Capabilities health={health} />}
      </ul>
      {!pending && health.registration === 'enabled' && <TestProfile id={health.id} />}
    </section>
  );
}
