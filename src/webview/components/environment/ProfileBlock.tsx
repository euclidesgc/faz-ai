import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PROFILE_CAPABILITIES, type ProfileCapability, isReadyCli, isReadyProfile, modeLabel } from '../../../shared/aiProfiles';
import { EXECUTOR_CAPABILITIES, type CapabilityState } from '../../../shared/executionAdmission';
import { toolModeEntry, toolModeOf } from '../../../shared/aiTools';
import { leaksList } from '../../isolation';
import { onHostMessage } from '../../vscode';
import { useAction } from '../../useAction';
import type { CapabilityReasonInfo, ProfileHealth } from '../../../shared/profileHealth';
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

/** Os checks com explicação própria; os demais aparecem pelo id, que é o que a verificação registra. */
const CHECK_TEXT: Record<string, string> = {
  // o agente ACP lê os próprios arquivos de contexto de propósito: a capacidade fica parcial, e o perfil vale no compatível
  'own-context-files': 'o agente lê os próprios arquivos de contexto: vale no regime compatível',
};

/** Por que a capacidade não está verificada, em palavras: o que a pessoa precisa fazer sai do motivo, não de "Desconhecida". */
function reasonText(r: CapabilityReasonInfo): string {
  switch (r.reason) {
    case 'no-evidence':
      return t('sem prova');
    case 'changed-binding':
      return t('prova de outra versão da CLI');
    case 'expired':
      return t('prova vencida');
    case 'failed':
      return r.check ? t('falhou: {check}', { check: r.check }) : t('falhou');
    case 'incomplete':
      return r.check ? (CHECK_TEXT[r.check] ? t(CHECK_TEXT[r.check]!) : t('{check} indisponível', { check: r.check })) : t('parcial');
    case 'invalid':
      return t('prova inválida');
  }
}

/** O perfil teve (ou pode ter) prova: é verificável, ou alguma prova chegou. Sem isso, as linhas de capacidade só confundem. */
const hasProbe = (h: ProfileHealth): boolean =>
  !!h.verifiable || h.evidence.state !== 'never' || h.capabilities.some((c) => c !== 'unknown');

/**
 * Capacidades e admissão, como vieram da verificação do host: o selo de pronto só aparece na capacidade
 * verificada; parcial e desconhecida nunca são mostradas como verificadas, e dizem o motivo entre parênteses. A
 * ferramenta sem sonda (Cursor, Kimi, o modo API) ganha uma linha só: sete "Desconhecida" sem motivo pareciam
 * algo a resolver. Cancelamento e saída não têm sonda em ferramenta nenhuma, e a linha diz isso.
 */
function Capabilities({ health }: { health: ProfileHealth }) {
  const { admission } = health;
  return (
    <>
      {hasProbe(health) ? (
        PROFILE_CAPABILITIES.map((capability, i) => {
          const state = health.capabilities[i] ?? 'unknown';
          const probed = (EXECUTOR_CAPABILITIES as readonly string[]).includes(capability);
          const reason = state === 'verified' ? null : (health.capabilityReasons?.[i] ?? null);
          const detail = reason ? reasonText(reason) : !probed && state === 'unknown' ? t('sem sonda') : '';
          return (
            <Line
              key={capability}
              state={state === 'verified' ? 'ok' : 'unknown'}
              label={`${t(CAPABILITY_NAME[capability])}: ${t(STATE_NAME[state])}${detail ? ` (${detail})` : ''}`}
            />
          );
        })
      ) : (
        <Line state="unknown" label={t('Capacidades: esta ferramenta não tem sonda; o perfil roda no regime compatível')} />
      )}
      {health.verifiable && <VerifyCapabilities health={health} />}
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
 * Os recibos de capacidade, sem sair da tela: todo perfil verificável (o do catálogo incluído) refaz as provas aqui
 * mesmo, pelo mesmo pedido do "Verificar capacidades" de Conectar agentes, com o resultado no próprio bloco e o
 * relatório refeito ao fim. Antes, o perfil do catálogo só tinha "Abrir Conectar agentes", que abria a aba e não
 * dizia o que clicar (o Reconectar), e a pessoa saía de lá sem prova nova. O atalho para Conectar agentes fica como
 * botão secundário só enquanto o perfil do catálogo não foi conectado: aí o Conectar faz mais que verificar. A
 * verificação roda numa pasta descartável e não gasta a conta: a frase diz isso, para não confundir com o Testar.
 */
function VerifyCapabilities({ health }: { health: ProfileHealth }) {
  const openConnect = useBoardStore((s) => s.openConnect);
  const openSettings = useBoardStore((s) => s.openSettings);
  const connected = useBoardStore((s) => s.state?.connections?.[health.id]?.status === 'connected');
  const connectable = isReadyProfile(health) && !!toolModeEntry(health.tool, health.mode);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const verify = useAction(async () => {
    setResult(null);
    await settings.verifyAiProfile(health.id);
    await ui.checkEnvironment();
  });
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type === 'aiProfiles.verifyResult' && msg.id === health.id) setResult({ ok: msg.ok, message: msg.message });
      }),
    [health.id],
  );
  const openProfile = () => {
    if (connectable) {
      openConnect(health.id);
      return;
    }
    useAgentConnectStore.getState().select(health.id, 'connection');
    openSettings('connect');
  };
  const none = health.capabilities.every((c) => c === 'unknown');
  return (
    <li className="env-item skipped">
      <div className="env-fix">
        <p className="small muted">
          {none
            ? t('Sem recibos de capacidade: a verificação roda numa pasta descartável e não gasta a sua conta.')
            : t('Refazer a verificação roda as sondas numa pasta descartável e não gasta a sua conta.')}
        </p>
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
        {/* a frase do verificador, no lugar: antes só saía como aviso passageiro, e a tela parecia não ter mudado */}
        {result?.ok && !verify.busy && (
          <p role="status" className="small">
            {t(result.message)}
          </p>
        )}
        {result && !result.ok && !verify.busy && (
          <div role="alert" className="env-warning small">
            {t(result.message)}
          </div>
        )}
        {verify.error && !verify.busy && (
          <div role="alert" className="env-warning small">
            {t(verify.error)}
          </div>
        )}
        {connectable && !connected && (
          <Button size="small" variant="secondary" onClick={openProfile}>
            {t('Abrir Conectar agentes')}
          </Button>
        )}
        {!connectable && (
          <Button size="small" variant="secondary" onClick={openProfile}>
            {t('Abrir o perfil')}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * A linha "Precisa verificar de novo": diz de quando é a última prova e qual é a versão da CLI agora, e termina com o
 * que fazer. Antes só dizia que a linha de comando mudou, e a pessoa não sabia que "Verificar de novo" não refazia a prova.
 */
function staleLabel(evidence: ProfileHealth['evidence']): string {
  const date = evidence.checkedAt ? new Date(evidence.checkedAt).toLocaleDateString() : '';
  if (date && evidence.version)
    return t(
      'Precisa verificar de novo: a última prova é de {date}, e a linha de comando agora é a {version}. Clique em Verificar capacidades.',
      {
        date,
        version: evidence.version,
      },
    );
  if (evidence.version)
    return t(
      'Precisa verificar de novo: a linha de comando mudou desde a última prova (agora {version}). Clique em Verificar capacidades.',
      {
        version: evidence.version,
      },
    );
  return t('Precisa verificar de novo: a linha de comando mudou desde a última prova. Clique em Verificar capacidades.');
}

/**
 * O Testar do Diagnóstico: o mesmo da tela Conectar agentes (a mesma mensagem ao host, que roda a
 * ferramenta pelo gateway e confere o ambiente de novo ao fim). Um clique por vez. O resultado aparece nos
 * dois sentidos (respondeu ou falhou), e o relatório da tela é refeito ao fim: sem isso a página parecia
 * parada depois de um teste que deu certo.
 */
function TestProfile({ health }: { health: ProfileHealth }) {
  const id = health.id;
  const openConnect = useBoardStore((s) => s.openConnect);
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string; output: string } | null>(null);
  const test = useAction(() => settings.testAiProfile(id));
  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type !== 'aiProfiles.testResult' || msg.id !== id) return;
        setResult(msg.ok ? { ok: true } : { ok: false, error: msg.error ?? t('O teste não terminou com sucesso.'), output: msg.output });
        void ui.checkEnvironment();
      }),
    [id],
  );
  const run = () => {
    if (test.busy) return;
    setResult(null);
    void test.run();
  };
  // o modo API não tem modelo padrão da ferramenta, e o Testar daqui não tem onde escolher um: o de Conectar agentes tem
  if (health.mode === 'api')
    return (
      <div className="env-fix">
        <p className="small muted">
          {t('No modo API o teste precisa de um modelo: escolha-o na aba Testar do perfil, em Conectar agentes.')}
        </p>
        <Button size="small" variant="secondary" onClick={() => openConnect(id)}>
          {t('Testar em Conectar agentes')}
        </Button>
      </div>
    );
  // as últimas linhas da saída da ferramenta, para a falha não ficar só na frase
  const outputTail = result && !result.ok ? result.output.split('\n').filter(Boolean).slice(-5) : [];
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
          {t(result.error)}
          {outputTail.length > 0 && (
            <details>
              <summary>{t('Saída da ferramenta')}</summary>
              <pre className="small">{outputTail.join('\n')}</pre>
            </details>
          )}
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
        {/* a última verificação real, com a data da prova; a ferramenta sem sonda não tem esta linha (ver Capabilities) */}
        {!pending && hasProbe(health) && (
          <Line
            state={health.evidence.state === 'valid' ? 'ok' : 'unknown'}
            label={
              health.evidence.state === 'valid'
                ? health.evidence.checkedAt
                  ? t('Verificado em {version}, {date}', {
                      version: health.evidence.version ?? '',
                      date: new Date(health.evidence.checkedAt).toLocaleDateString(),
                    })
                  : t('Verificado em {version}', { version: health.evidence.version ?? '' })
                : health.evidence.state === 'stale'
                  ? staleLabel(health.evidence)
                  : t('Não validado: este perfil ainda não foi testado')
            }
          />
        )}
        {!pending && <Capabilities health={health} />}
      </ul>
      {!pending && health.registration === 'enabled' && <TestProfile health={health} />}
    </section>
  );
}
