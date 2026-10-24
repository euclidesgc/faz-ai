import { useEffect, useState } from 'react';
import { Badge, Callout, Text, TextField } from '@radix-ui/themes';
import type { AccountStatus, AgentAuthMethod } from '../../../../shared/agentConnect';
import { VAULT_KEY_TOOLS } from '../../../../shared/aiTools';
import { isReadyProfile, type AiProfile } from '../../../../shared/aiProfiles';
import { agentConnect, settings } from '../../../commands';
import { formatDateTime, t } from '../../../i18n';
import { accountOf, useAgentConnectStore } from '../../../store/agentConnectStore';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { isWeb } from '../../../vscode';
import { ActionButton, FormField, IconWarning } from '../../ui';

const STATUS_LABEL: Record<AccountStatus, string> = {
  checking: 'Verificando…',
  'signed-in': 'Com login',
  'signed-out': 'Sem login',
  unknown: 'Não verificada',
  error: 'Não deu para verificar',
};
const STATUS_COLOR: Record<AccountStatus, 'indigo' | 'amber' | 'gray' | 'red'> = {
  checking: 'gray',
  'signed-in': 'indigo',
  'signed-out': 'amber',
  unknown: 'gray',
  error: 'red',
};

/** Um jeito de entrar: no terminal (o board acompanha até ele fechar), pelo próprio agente ou com uma chave. */
function LoginMethod({
  method,
  busy,
  onLogin,
  onKey,
}: {
  method: AgentAuthMethod;
  busy: boolean;
  onLogin(): void;
  onKey(apiKey: string): Promise<boolean>;
}) {
  const [key, setKey] = useState('');
  return (
    <div className="agent-login-method">
      <Text size="2" weight="medium">
        {t(method.name)}
        {method.description ? <span className="muted"> · {method.description}</span> : null}
      </Text>
      {method.apiKey ? (
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void onKey(key.trim()).then((ok) => ok && setKey(''));
          }}
        >
          <FormField label={t('Chave de API')}>
            {(id) => (
              <TextField.Root
                id={id}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={t('Cole a chave aqui')}
                onChange={(e) => setKey(e.target.value)}
              />
            )}
          </FormField>
          <ActionButton
            size="1"
            type="submit"
            disabled={busy || !key.trim()}
            disabledReason={busy ? t('Espere a operação em andamento') : t('Informe a chave')}
            hint={t('Entrega a chave à ferramenta; ela não volta para esta tela nem vai para o log.')}
          >
            {t('Entrar com a chave')}
          </ActionButton>
        </form>
      ) : method.type === 'terminal' ? (
        <>
          {method.terminalCommand && <code className="agent-command">{method.terminalCommand}</code>}
          {isWeb ? (
            <Text size="1" color="gray">
              {t('Rode o comando acima num terminal desta máquina e depois clique em Verificar a conta.')}
            </Text>
          ) : (
            <div className="row">
              <ActionButton
                size="1"
                variant="soft"
                disabled={busy}
                disabledReason={t('Espere a operação em andamento')}
                hint={t('Abre o login num terminal do editor; quando ele fechar, o board confere a conta sozinho.')}
                onClick={onLogin}
              >
                {t('Entrar no terminal')}
              </ActionButton>
            </div>
          )}
        </>
      ) : (
        <div className="row">
          <ActionButton
            size="1"
            variant="soft"
            disabled={busy}
            disabledReason={t('Espere a operação em andamento')}
            hint={t('Pede ao agente que faça o login (ele pode abrir o navegador); o board espera você terminar.')}
            onClick={onLogin}
          >
            {t('Entrar')}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

/**
 * A conta do agente: se há login e qual conta, como entrar e como sair. A verificação é curta (o status da CLI, ou
 * pelo ACP o `initialize` e uma sessão sem pedido) e não deixa processo aberto.
 */
export function AccountPanel({
  agentKey,
  name,
  profile,
  autoCheck = false,
}: {
  agentKey: string;
  name: string;
  profile: AiProfile | null;
  /** confere a conta ao abrir, quando ainda não foi conferida (o agente ligado e instalado: é rápido e não gasta a conta) */
  autoCheck?: boolean;
}) {
  const account = useAgentConnectStore((s) => accountOf(s.accounts, agentKey));
  const neverChecked = account.status === 'unknown' && !account.checkedAt;
  useEffect(() => {
    if (autoCheck && neverChecked) void agentConnect.check(agentKey).catch(() => {});
    // só ao abrir o agente: depois, a pessoa confere pelo botão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey, autoCheck]);
  const ask = useBoardStore((s) => s.ask);
  const check = useAction(() => agentConnect.check(agentKey));
  const login = useAction((methodId: string, apiKey?: string) => agentConnect.login(agentKey, methodId, apiKey));
  const logout = useAction(() => agentConnect.logout(agentKey));
  // a chave das ferramentas que entram pelo cofre vai pelo Conectar: ele a confere, guarda e as execuções a usam
  const vaultKey = !!profile && isReadyProfile(profile) && VAULT_KEY_TOOLS.includes(profile.tool);
  const connectKey = useAction((apiKey: string) => settings.connectAiProfile(profile!.id, { apiKey }));
  const busy = account.status === 'checking' || !!account.loggingIn || logout.busy;
  const loggingIn = account.loggingIn ? account.methods.find((m) => m.id === account.loggingIn) : undefined;
  const showMethods = account.status === 'signed-out' || account.status === 'unknown' || account.status === 'error';
  return (
    <section className="agent-account" aria-label={t('Conta do agente')} aria-busy={busy}>
      <div className="row wrap">
        <Text size="2" weight="medium">
          {t('Conta')}
        </Text>
        <Badge color={STATUS_COLOR[account.status]}>{t(STATUS_LABEL[account.status])}</Badge>
        {account.label && <Text size="2">{account.label}</Text>}
        {account.checkedAt && account.status !== 'checking' && (
          <Text size="1" color="gray">
            {t('verificada em {date}', { date: formatDateTime(account.checkedAt) })}
          </Text>
        )}
      </div>
      {loggingIn && (
        <p role="status" className="row">
          <span className="spinner" aria-hidden="true" />
          {loggingIn.type === 'terminal'
            ? t('Login em curso no terminal. Termine lá: quando o terminal fechar, o board confere a conta sozinho.')
            : t('Login em curso pelo {name}. Termine onde ele pediu (o navegador, por exemplo).', { name })}
        </p>
      )}
      {account.error && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(account.error)}</Callout.Text>
        </Callout.Root>
      )}
      {showMethods && account.methods.length > 0 && (
        <div className="agent-login-methods">
          {account.methods.map((m) => (
            <LoginMethod
              key={m.id}
              method={m}
              busy={busy}
              onLogin={() => void login.run(m.id)}
              onKey={(apiKey) => (vaultKey ? connectKey.run(apiKey) : login.run(m.id, apiKey))}
            />
          ))}
        </div>
      )}
      {showMethods && account.status !== 'unknown' && account.methods.length === 0 && (
        <Text size="1" color="gray">
          {t('O agente não anuncia como entrar: ele usa a conta que já estiver configurada nesta máquina.')}
        </Text>
      )}
      <div className="row wrap">
        <ActionButton
          size="1"
          variant="soft"
          color="gray"
          loading={account.status === 'checking'}
          disabled={!!account.loggingIn}
          disabledReason={t('Espere o login terminar')}
          hint={t('Confere o login agora, sem gastar a sua conta: o status da CLI ou uma sessão do agente sem pedido.')}
          onClick={() => void check.run()}
        >
          {t('Verificar a conta')}
        </ActionButton>
        {account.canLogout && account.status === 'signed-in' && (
          <ActionButton
            size="1"
            variant="soft"
            color="red"
            disabled={busy}
            disabledReason={t('Espere a operação em andamento')}
            loading={logout.busy}
            hint={t('Sai da conta da ferramenta nesta máquina: ela sai também fora do board (terminal, editor).')}
            onClick={() =>
              ask({
                title: t('Sair da conta do {name}?', { name }),
                message: t(
                  'A ferramenta sai da conta nesta máquina inteira, não só no board: o terminal e o editor também ficam sem login até você entrar de novo.',
                ),
                confirmLabel: t('Sair da conta'),
                danger: true,
                onConfirm: () => void logout.run(),
              })
            }
          >
            {t('Sair da conta')}
          </ActionButton>
        )}
      </div>
    </section>
  );
}
