import { useEffect, useRef, useState } from 'react';
import { Badge, Callout, Card, Text, TextArea } from '@radix-ui/themes';
import type { AgentListItem, TestItem, TestPhase } from '../../../../shared/agentConnect';
import { agentConnect, settings } from '../../../commands';
import { t } from '../../../i18n';
import { useAgentConnectStore } from '../../../store/agentConnectStore';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, IconRun, IconStop, IconWarning } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { ProtocolLogPanel } from './ProtocolLogPanel';
import { SessionOptions } from './SessionControls';

const PHASE_LABEL: Record<TestPhase, string> = {
  idle: 'Fechada',
  connecting: 'Abrindo…',
  connected: 'Aberta',
  'needs-auth': 'Pede login',
  prompting: 'Respondendo…',
  error: 'Erro',
};

const PHASE_COLOR: Record<TestPhase, 'gray' | 'indigo' | 'amber' | 'red'> = {
  idle: 'gray',
  connecting: 'gray',
  connected: 'indigo',
  'needs-auth': 'amber',
  prompting: 'indigo',
  error: 'red',
};

function ConversationItem({ item }: { item: TestItem }) {
  switch (item.kind) {
    case 'prompt':
      return <div className="agent-item agent-prompt">{item.text}</div>;
    case 'message':
      return <div className="agent-item agent-message">{item.text}</div>;
    case 'thought':
      return (
        <details className="agent-item agent-thought">
          <summary>{t('Raciocínio')}</summary>
          <div>{item.text}</div>
        </details>
      );
    case 'tool':
      return (
        <div className="agent-item agent-tool">
          <code>{item.toolKind ?? 'tool'}</code> {item.title}{' '}
          <Badge color={item.status === 'failed' ? 'red' : 'gray'} variant="soft">
            {item.status}
          </Badge>
        </div>
      );
    case 'plan':
      return (
        <div className="agent-item agent-plan">
          <Text size="1" weight="medium">
            {t('Plano')}
          </Text>
          <ul>
            {item.entries.map((e, i) => (
              <li key={i}>
                <code>{e.status}</code> {e.content}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'permission':
      return (
        <Card className="agent-item agent-permission">
          <Text size="2" weight="medium">
            <IconWarning /> {t('O agente pede permissão: {title}', { title: item.title })}
          </Text>
          {item.answer ? (
            <Text size="1" color="gray">
              {t('Resposta: {answer}', { answer: item.answer })}
            </Text>
          ) : (
            <div className="row">
              {item.options.map((o) => (
                <ActionButton
                  key={o.optionId}
                  size="1"
                  variant={o.kind.startsWith('allow') ? 'solid' : 'soft'}
                  color={o.kind.startsWith('reject') ? 'red' : undefined}
                  hint={t('Responde ao agente: {option}', { option: o.name })}
                  onClick={() => agentConnect.answer(item.permissionId, o.optionId)}
                >
                  {o.name}
                </ActionButton>
              ))}
            </div>
          )}
        </Card>
      );
    case 'note':
      return (
        <div className={`agent-item agent-note ${item.tone === 'error' ? 'error' : 'muted'}`}>
          {item.translate ? t(item.text) : item.text}
        </div>
      );
    case 'end':
      return (
        <div className="agent-item agent-end muted">
          {t('Fim do turno')}: <code>{item.stopReason}</code>
        </div>
      );
  }
}

/** A conversa da sessão de teste aberta: as opções da sessão, os eventos na ordem e o campo do prompt. */
function Conversation() {
  const { test, items, usage, clearItems } = useAgentConnectStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const busy = test.phase === 'prompting';
  const open = test.phase === 'connected' || test.phase === 'prompting';
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [items]);
  const send = async () => {
    const value = text.trim();
    if (!value || busy || !open) return;
    setText('');
    await agentConnect.prompt(value).catch(() => setText(value));
  };
  return (
    <>
      {test.connection && open && <SessionOptions connection={test.connection} disabled={busy} />}
      <div className="agent-log" role="log" aria-live="polite" aria-label={t('Eventos do agente')}>
        {items.length === 0 ? (
          <Text size="2" color="gray">
            {t('Nenhum evento ainda. Envie um prompt para ver a resposta chegar em tempo real.')}
          </Text>
        ) : (
          items.map((item, i) => <ConversationItem key={i} item={item} />)
        )}
        <div ref={endRef} />
      </div>
      {usage && (
        <Text size="1" color="gray">
          {t('Contexto: {used} de {size} tokens', { used: usage.used.toLocaleString(), size: usage.size.toLocaleString() })}
        </Text>
      )}
      <TextArea
        aria-label={t('Prompt de teste')}
        placeholder={t('Liste os arquivos da raiz do projeto')}
        value={text}
        disabled={!open}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
        }}
      />
      <div className="row end">
        <ActionButton variant="soft" color="gray" hint={t('Limpa os eventos da tela; a sessão continua')} onClick={clearItems}>
          {t('Limpar')}
        </ActionButton>
        {busy ? (
          <ActionButton color="red" variant="soft" hint={t('Manda session/cancel: o agente encerra o turno')} onClick={agentConnect.cancel}>
            <IconStop /> {t('Interromper')}
          </ActionButton>
        ) : (
          <ActionButton
            hint={t('Envia o prompt ao agente (Ctrl+Enter)')}
            disabled={!text.trim() || !open}
            disabledReason={!open ? t('Abra a sessão de teste antes') : t('Escreva o prompt')}
            onClick={() => void send()}
          >
            <IconRun /> {t('Enviar')}
          </ActionButton>
        )}
      </div>
    </>
  );
}

/**
 * A sessão de teste pelo ACP: abre o agente, mostra o que ele declara e conversa com ele em tempo real. Fecha sozinha
 * depois de 10 minutos parada, ou quando a pessoa encerra; a conexão do board (a dos cards) não depende dela.
 */
function LiveSession({ item }: { item: AgentListItem }) {
  const { test, testKey, openTest } = useAgentConnectStore();
  const open = useAction(() => openTest(item.key));
  const reopen = useAction(() => agentConnect.reopenTest());
  const close = useAction(() => agentConnect.closeTest());
  const mine = testKey === item.key;
  const otherName = !mine && testKey && test.phase !== 'idle' ? (test.connection?.agent.name ?? null) : null;
  const connection = mine ? test.connection : null;
  // a sessão de teste roda pelo ACP: o agente do catálogo do board ou a entrada do registro
  const unavailable = !item.profile && !item.registry?.available;
  return (
    <section className="agent-session" aria-label={t('Sessão de teste')} aria-busy={mine && test.phase === 'connecting'}>
      <SectionHeader
        title={t('Sessão de teste pelo ACP')}
        actions={
          mine && test.phase !== 'idle' ? (
            <div className="row">
              <Badge color={PHASE_COLOR[test.phase]}>{t(PHASE_LABEL[test.phase])}</Badge>
              <ActionButton
                size="1"
                variant="soft"
                color="gray"
                loading={reopen.busy}
                hint={t('Fecha e abre de novo: o agente relê o login e começa uma sessão nova')}
                onClick={() => void reopen.run()}
              >
                {t('Abrir de novo')}
              </ActionButton>
              <ActionButton
                size="1"
                variant="soft"
                color="gray"
                loading={close.busy}
                hint={t('Encerra a sessão e o processo do agente')}
                onClick={() => void close.run()}
              >
                {t('Encerrar sessão')}
              </ActionButton>
            </div>
          ) : (
            <ActionButton
              loading={open.busy}
              disabled={unavailable}
              disabledReason={item.registry?.note ? t(item.registry.note) : t('O agente não está disponível nesta máquina')}
              hint={t('Inicia o agente pelo ACP e abre uma sessão na pasta do projeto, para conversar com ele aqui')}
              onClick={() => void open.run()}
            >
              {t('Abrir sessão de teste')}
            </ActionButton>
          )
        }
      >
        {t(
          'Conversa com o agente em tempo real: o texto, o raciocínio, as ferramentas, o plano e os pedidos de permissão, que você responde aqui. Fecha sozinha depois de 10 minutos parada.',
        )}
        {otherName && ` ${t('Abrir esta fecha a sessão de teste do {name}.', { name: otherName })}`}
      </SectionHeader>
      {connection && (
        <Text as="p" size="1" color="gray">
          ACP v{connection.protocolVersion}
          {connection.agentInfo ? ` · ${connection.agentInfo.name} ${connection.agentInfo.version}` : ''}
          {connection.sessionId ? ` · ${t('sessão {id}', { id: connection.sessionId.slice(0, 8) })}` : ''}
          {connection.account && connection.account.kind !== 'none'
            ? ` · ${[connection.account.label, connection.account.detail].filter(Boolean).join(' · ')}`
            : ''}
          {connection.capabilities.length > 0 && ` · ${connection.capabilities.join(', ')}`}
        </Text>
      )}
      {mine && test.phase === 'needs-auth' && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t('O agente pediu login. Entre na conta na aba Conexão e depois clique em Abrir de novo.')}</Callout.Text>
        </Callout.Root>
      )}
      {mine && test.phase === 'error' && test.error && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(test.error)}</Callout.Text>
        </Callout.Root>
      )}
      {mine && <Conversation />}
    </section>
  );
}

/** O teste rápido: um pedido curto pelo mesmo caminho dos cards (a CLI, o ACP ou a API do perfil). */
function QuickTest({ item }: { item: AgentListItem }) {
  const profile = item.profile!;
  const ask = useBoardStore((s) => s.ask);
  const result = useAgentConnectStore((s) => s.quickTests[profile.id]);
  const test = useAction(() => settings.testAiProfile(profile.id));
  return (
    <section className="agent-quick-test" aria-label={t('Teste rápido')}>
      <SectionHeader
        title={t('Teste rápido pelo caminho dos cards')}
        actions={
          <ActionButton
            variant="soft"
            hint={t('Executa um pedido curto como numa execução de card; usa a sua assinatura.')}
            disabled={!profile.enabled}
            disabledReason={t('Ligue o agente antes.')}
            loading={test.busy}
            onClick={() =>
              ask({
                title: t('Testar o {name}?', { name: profile.name }),
                message: t('O teste roda a ferramenta e usa a sua assinatura. Uma resposta OK não comprova isolamento, permissões ou MCP.'),
                confirmLabel: t('Testar'),
                onConfirm: () => void test.run(),
              })
            }
          >
            {t('Testar')}
          </ActionButton>
        }
      >
        {t('Um pedido curto pelo mesmo caminho das execuções dos cards, para conferir que o agente responde.')}
      </SectionHeader>
      {test.busy && (
        <p role="status" className="row">
          <span className="spinner" aria-hidden="true" />
          {t('Testando…')}
        </p>
      )}
      {result && !test.busy && (
        <div className={result.ok ? 'ai-profile-result' : 'ai-profile-error'} role={result.ok ? 'status' : 'alert'}>
          {result.error && <p>{t(result.error)}</p>}
          {result.output && <pre>{result.output}</pre>}
          {result.ok && <p className="muted">{t('A resposta não comprova isolamento, permissões ou MCP.')}</p>}
        </div>
      )}
    </section>
  );
}

/** A aba Testar do agente: o teste rápido (agentes do board), a sessão de teste e o log do protocolo. */
export function AgentTest({ item }: { item: AgentListItem }) {
  return (
    <div className="agent-test">
      {item.profile && <QuickTest item={item} />}
      <LiveSession item={item} />
      <ProtocolLogPanel />
    </div>
  );
}
