import { useMemo, useState } from 'react';
import { Badge, Text } from '@radix-ui/themes';
import type { ProtocolLogEntry } from '../../../../shared/agentConnect';
import { agentConnect } from '../../../commands';
import { t } from '../../../i18n';
import { useAgentConnectStore } from '../../../store/agentConnectStore';
import { ActionButton, IconFromAgent, IconProcess, IconToAgent, SwitchField, type Icon, Summary } from '../../ui';
import { SectionHeader } from '../SectionHeader';

/** A partir de quanto tempo (ms) a resposta ganha destaque: um pedido lento é o primeiro suspeito. */
const SLOW_MS = 2000;

const DIR_ICON: Record<ProtocolLogEntry['dir'], Icon> = { out: IconToAgent, in: IconFromAgent, process: IconProcess };

/** 'HH:MM:SS.mmm' no fuso da máquina. */
export function clock(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** O JSON da linha indentado para ler; se não for JSON (cortado), como veio. */
function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function LogRow({ entry }: { entry: ProtocolLogEntry }) {
  const Dir = DIR_ICON[entry.dir];
  const label = entry.kind === 'stderr' ? 'stderr' : entry.dir === 'process' ? t('processo') : (entry.method ?? t('resposta'));
  const head = (
    <>
      <code className="agent-log-time">{clock(entry.at)}</code>
      <span
        className={`agent-log-dir ${entry.dir}`}
        title={entry.dir === 'out' ? t('do board para o agente') : entry.dir === 'in' ? t('do agente para o board') : undefined}
      >
        <Dir />
      </span>
      <code className="agent-log-method">{label}</code>
      {entry.id !== null && <span className="muted">#{entry.id}</span>}
      {entry.kind === 'error' && <Badge color="red">{t('erro')}</Badge>}
      {entry.ms !== null && (
        <Badge color={entry.ms >= SLOW_MS ? 'amber' : 'gray'} variant="soft">
          {entry.ms} ms
        </Badge>
      )}
      {entry.summary && <span className="agent-log-summary">{entry.summary}</span>}
    </>
  );
  if (!entry.json) return <div className="agent-log-row">{head}</div>;
  return (
    <details className="agent-log-row">
      <Summary>{head}</Summary>
      <pre className="agent-log-json">{pretty(entry.json)}</pre>
    </details>
  );
}

/**
 * O log do protocolo ACP desta tela: cada mensagem JSON-RPC das verificações de conta, dos logins e da sessão de
 * teste, nos dois sentidos, com o tempo de cada pedido. O arquivo do dia guarda tudo, com o JSON completo.
 */
export function ProtocolLogPanel() {
  const { log, logFile, clearLog } = useAgentConnectStore();
  const [hideUpdates, setHideUpdates] = useState(false);
  const shown = useMemo(() => (hideUpdates ? log.filter((e) => e.method !== 'session/update') : log), [log, hideUpdates]);
  const requests = log.filter((e) => e.ms !== null);
  const slowest = requests.reduce<ProtocolLogEntry | null>((a, e) => (!a || (e.ms ?? 0) > (a.ms ?? 0) ? e : a), null);
  return (
    <section className="agent-protocol">
      <SectionHeader
        title={t('Log do protocolo ACP')}
        count={log.length}
        actions={
          <div className="row">
            <ActionButton
              size="1"
              variant="soft"
              color="gray"
              hint={t('Limpa as linhas da tela; o arquivo continua com tudo')}
              onClick={clearLog}
            >
              {t('Limpar')}
            </ActionButton>
            <ActionButton
              size="1"
              variant="soft"
              hint={t('Abre no editor o arquivo de hoje, com o JSON completo de cada mensagem')}
              disabled={!logFile}
              disabledReason={t('Este board não tem pasta de dados para o log')}
              onClick={() => void agentConnect.openLog()}
            >
              {t('Abrir arquivo')}
            </ActionButton>
          </div>
        }
      >
        {t(
          'Cada mensagem JSON-RPC trocada com o agente, nos dois sentidos: a seta para a direita sai do board, a para a esquerda vem do agente. As respostas mostram o tempo do pedido.',
        )}
      </SectionHeader>
      <div className="row wrap agent-log-toolbar">
        <SwitchField label={t('Ocultar session/update')} checked={hideUpdates} onChange={setHideUpdates} />
        {slowest && (
          <Text size="1" color="gray">
            {t('Pedido mais lento: {method} em {ms} ms', { method: slowest.method ?? '?', ms: slowest.ms ?? 0 })}
          </Text>
        )}
        {logFile && (
          <Text size="1" color="gray" className="agent-log-file">
            {logFile}
          </Text>
        )}
      </div>
      <div className="agent-log-list" role="log" aria-label={t('Log do protocolo ACP')}>
        {shown.length === 0 ? (
          <Text size="2" color="gray">
            {t(
              'Nenhuma mensagem ainda. Verifique a conta de um agente ou abra uma sessão de teste para ver o initialize e o resto da conversa do protocolo.',
            )}
          </Text>
        ) : (
          shown.map((e) => <LogRow key={e.seq + ':' + e.at} entry={e} />)
        )}
      </div>
    </section>
  );
}
