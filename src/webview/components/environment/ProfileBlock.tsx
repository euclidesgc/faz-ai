import { useEffect, useRef, type ReactNode } from 'react';
import { baseValue } from '../../../shared/harness';
import type { ProfileHealth } from '../../../shared/profileHealth';
import { LOGIN_COMMAND } from '../../../shared/requirements';
import { t } from '../../i18n';
import { ui } from '../../commands';
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
              {(probe?.login === 'signed-out' || health.authExpired) && health.kind === 'builtin' && login && (
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
      </ul>
    </section>
  );
}
