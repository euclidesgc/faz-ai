import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PROFILE_CAPABILITIES, type ProfileCapability, isReadyCli } from '../../../shared/aiProfiles';
import type { CapabilityState } from '../../../shared/executionAdmission';
import { baseValue } from '../../../shared/harness';
import { leaksList } from '../../isolation';
import { onHostMessage } from '../../vscode';
import { useAction } from '../../useAction';
import type { ProfileHealth } from '../../../shared/profileHealth';
import { LOGIN_COMMAND } from '../../../shared/requirements';
import { t } from '../../i18n';
import { settings, ui } from '../../commands';
import { isWeb } from '../../vscode';
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
      {health.verifiable && !isWeb && health.capabilities.every((c) => c === 'unknown') && (
        <li className="env-item skipped">
          <p className="small muted">
            {t(
              'Sem recibos de capacidade deste perfil: rode "Faz AI: Verificar o isolamento da CLI de IA" na paleta de comandos e escolha {name}.',
              { name: health.name },
            )}
          </p>
        </li>
      )}
      {admission && (
        <Line
          state={admission.state === 'admitted' ? 'ok' : 'missing'}
          label={
            admission.state === 'admitted'
              ? t('Admissível no regime {regime}', { regime: admission.regime === 'exclusive' ? t('exclusivo') : t('compatível') })
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
 * O Testar do Diagnóstico: o mesmo da tela Ferramentas de IA (a mesma mensagem ao host, que roda a
 * ferramenta pelo gateway e confere o ambiente de novo ao fim). Um clique por vez.
 */
function TestProfile({ id }: { id: string }) {
  const [failure, setFailure] = useState<string | null>(null);
  const test = useAction(() => settings.testAiProfile(id));
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type === 'aiProfiles.testResult' && msg.id === id)
          setFailure(msg.ok ? null : (msg.error ?? t('O teste não terminou com sucesso.')));
      }),
    [id],
  );
  const run = () => {
    if (test.busy) return;
    setFailure(null);
    void test.run();
  };
  return (
    <div className="env-fix">
      <p className="small muted">{t('O teste roda a ferramenta e usa a sua assinatura.')}</p>
      <Button size="small" variant="secondary" disabled={test.busy} onClick={run}>
        {t('Testar')}
      </Button>
      {test.busy && (
        <p role="status" className="small muted">
          {t('Testando…')}
        </p>
      )}
      {failure && !test.busy && (
        <div role="alert" className="env-warning small">
          {failure}
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
  const login = baseValue(LOGIN_COMMAND, health.base);
  const pending = health.registration === 'pending-review';
  return (
    <section ref={ref} aria-labelledby={id} className={`env-profile${focused ? ' focused' : ''}`}>
      <h4 id={id}>
        {health.name}
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
