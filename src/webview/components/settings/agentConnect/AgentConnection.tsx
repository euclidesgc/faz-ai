import { useEffect, useState } from 'react';
import { Badge, Callout, SegmentedControl, Text } from '@radix-ui/themes';
import type { AgentListItem } from '../../../../shared/agentConnect';
import { modeLabel, type AiProfile } from '../../../../shared/aiProfiles';
import { recommendedOffered, toolEntry, toolModeEntry, type ToolMode } from '../../../../shared/aiTools';
import { agentConnect, settings } from '../../../commands';
import { t } from '../../../i18n';
import { useAgentConnectStore } from '../../../store/agentConnectStore';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, Hint, IconCheck, IconExternal, IconWarning, SwitchField, Summary } from '../../ui';
import { AccountPanel } from './AccountPanel';
import { ProfileActions, connectable } from './ProfileActions';
import { ConnectProgress, ModeSheetList } from './connectProgress';
import { ContextScope } from './ContextScope';
import { QuotaReading } from './QuotaReading';

/** A ferramenta nesta máquina: achada (com a versão) ou não, com onde instalar. */
function ToolStep({ item }: { item: AgentListItem }) {
  const installed = useAgentConnectStore((s) => (item.profile ? s.installed[item.profile.id] : undefined));
  const status = useAgentConnectStore((s) => (item.profile ? s.statuses[item.profile.id] : undefined));
  const p = item.profile;
  // o modo API não tem binário: quem fala com a API é a extensão
  if (p?.mode === 'api')
    return (
      <div className="agent-step done">
        <IconCheck />
        <Text size="2">{t('Sem programa para instalar: no modo API, quem fala com o modelo é a extensão.')}</Text>
      </div>
    );
  // a sonda do host pula o perfil desligado (`skipped`): aí vale o comando achado no PATH, sem rodar nada
  const probed = status && !status.skipped ? status : undefined;
  const found = p ? (probed?.found ?? installed) : item.registry?.available;
  const docs = status?.installUrl ?? (p ? (toolEntry(p.tool)?.docs ?? null) : null) ?? item.registry?.url ?? null;
  return (
    <div className={`agent-step ${found ? 'done' : found === false ? 'missing' : ''}`}>
      {found ? <IconCheck /> : <IconWarning />}
      <Text size="2">
        {found
          ? probed?.version
            ? t('Instalado · versão {version}', { version: probed.version })
            : t('Instalado')
          : found === false
            ? t('Não encontrado nesta máquina')
            : t('Ainda não verificado')}
      </Text>
      {!p && item.registry?.note && (
        <Text size="1" color="gray">
          {t(item.registry.note)}
        </Text>
      )}
      {!found && docs && (
        <a href={docs} target="_blank" rel="noopener noreferrer">
          <IconExternal /> {t('Como instalar')}
        </a>
      )}
    </div>
  );
}

/**
 * O Conectar do board para o perfil pronto: acha a ferramenta, confere o login, verifica o que ela carrega por conta
 * própria e lê os modelos. Na ferramenta com mais de um modo (o Gemini), escolhe-se o modo aqui.
 */
function BoardConnection({ profile }: { profile: AiProfile }) {
  const state = useBoardStore((s) => s.state)!;
  const entry = toolEntry(profile.tool);
  const [mode, setMode] = useState<ToolMode>(profile.mode);
  useEffect(() => setMode(profile.mode), [profile.mode]);
  const modeEntry = toolModeEntry(profile.tool, mode);
  const recommended = entry ? recommendedOffered(entry) : null;
  const raw = state.connections?.[profile.id];
  // a conexão é do perfil, e a tela mostra a do modo escolhido: a em curso dele, ou a concluída do modo em uso
  const connection = raw && (raw.mode ?? profile.mode) === mode ? raw : undefined;
  const connect = useAction(() => settings.connectAiProfile(profile.id, { mode }));
  // a CLI pronta entra pelo login do terminal que o board acompanha: o passo do login que falhou leva a ele
  const cliLogin = profile.mode === 'cli' && ['claude', 'cursor', 'kimi'].includes(profile.base);
  const switching = mode !== profile.mode;
  const connected = !switching && connection?.status === 'connected';
  return (
    <section className="agent-board-connection" aria-label={t('Conexão com o board')}>
      <Text size="2" weight="medium">
        {t('Conexão com o board')}
      </Text>
      {entry && entry.modes.length > 1 && (
        <div className="agent-modes">
          <SegmentedControl.Root value={mode} onValueChange={(v) => setMode(v as ToolMode)} aria-label={t('Modo de conexão')}>
            {entry.modes.map((m) => (
              <SegmentedControl.Item key={m.mode} value={m.mode}>
                {modeLabel(m.mode)}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
          {mode === profile.mode && profile.enabled && (
            <Badge color="gray" variant="soft">
              {t('Modo em uso')}
            </Badge>
          )}
          {recommended === mode && (
            <Badge color="indigo" variant="solid">
              {t('Recomendado')}
            </Badge>
          )}
        </div>
      )}
      {recommended === mode && entry && entry.modes.length > 1 && (
        <Text as="p" size="1">
          {t(entry.recommended.reason)}
        </Text>
      )}
      {/* conectado, a ficha do modo vai para o "Ver detalhes" do progresso: aqui ela só ajuda a escolher e conectar */}
      {modeEntry && connection?.status !== 'connected' && (
        <details className="agent-mode-sheet">
          <Summary>{t('Como funciona o modo {mode}', { mode: modeLabel(mode) })}</Summary>
          <ModeSheetList mode={modeEntry} />
        </details>
      )}
      {connection ? (
        <ConnectProgress
          profile={profile}
          state={connection}
          mode={modeEntry}
          {...(cliLogin ? { login: () => void agentConnect.login(profile.id, 'cli-login') } : {})}
        />
      ) : (
        <Text as="p" size="1" color="gray">
          {t(
            'Ainda não conectado pelo board. O Conectar acha a ferramenta, confere o login, verifica o que ela carrega por conta própria (sem gastar a sua conta) e lê os modelos.',
          )}
        </Text>
      )}
      <div className="row end">
        {/* conectado, refazer é raro: o botão fica discreto, e o azul cheio fica para quem ainda precisa conectar */}
        <ActionButton
          {...(connected ? { size: '1' as const, variant: 'soft' as const, color: 'gray' as const } : {})}
          hint={
            switching
              ? t('Passa o agente para este modo quando o login der certo, com a mesma chave e os mesmos modelos.')
              : connected
                ? t('Use se algo parou de funcionar: refaz o login, a verificação e a leitura dos modelos.')
                : t('Acha a ferramenta, faz o login, verifica as capacidades e lê os modelos.')
          }
          disabled={raw?.status === 'running'}
          disabledReason={t('O Conectar está em curso.')}
          loading={connect.busy}
          onClick={() => void connect.run()}
        >
          {switching ? t('Conectar no modo {mode}', { mode: modeLabel(mode) }) : t(connected ? 'Reconectar' : 'Conectar')}
        </ActionButton>
      </div>
    </section>
  );
}

/**
 * Ligar, desligar e tornar padrão: ligado, o board executa com este agente os cards com um modelo dele. Vem no topo da
 * aba porque é a decisão da tela; a situação técnica fica nos blocos de baixo, sem repetir aqui.
 */
function ProfileUse({ profile }: { profile: AiProfile }) {
  const state = useBoardStore((s) => s.state)!;
  const standard = state.board.aiTool === profile.id;
  const pending = profile.credentials?.review === 'pending';
  const enabled = useAction((on: boolean) => settings.setAiProfileEnabled(profile.id, on));
  const useInCards = useAction(() => settings.updateBoard({ aiTool: profile.id }));
  const toggle = (
    <SwitchField
      label={t('Ligado')}
      checked={profile.enabled}
      disabled={standard || enabled.busy || pending}
      onChange={(on) => void enabled.run(on)}
    />
  );
  return (
    <section className="agent-use" aria-label={t('Uso nos cards')}>
      <Text size="2" weight="medium">
        {t('Uso nos cards')}
      </Text>
      <div className="row wrap">
        {/* a chave travada do padrão diz por quê, para não parecer quebrada */}
        {standard ? (
          <Hint
            content={t(
              'Este agente roda os cards sem modelo e não pode ser desligado: use "Usar nos cards sem modelo" em outro agente antes.',
            )}
          >
            <span tabIndex={0}>{toggle}</span>
          </Hint>
        ) : (
          toggle
        )}
        {!standard && (
          <ActionButton
            size="1"
            variant="soft"
            disabled={!profile.enabled || pending}
            disabledReason={
              pending ? t('Revise o perfil antes: salve a configuração dele no formulário.') : t('Ligue ou conecte o agente antes.')
            }
            loading={useInCards.busy}
            hint={t(
              'Os cards sem modelo (nem no card, nem no agente, nem por uma regra) passam a rodar com este. Os outros seguem no agente do modelo deles.',
            )}
            onClick={() => void useInCards.run()}
          >
            {t('Usar nos cards sem modelo')}
          </ActionButton>
        )}
      </div>
      <Text as="p" size="1" color="gray">
        {standard
          ? t('Roda os cards que não escolhem modelo. Os que escolhem um modelo de outro agente rodam nele, ao mesmo tempo.')
          : profile.enabled
            ? t(
                'Roda os cards que escolhem um modelo dele, ao mesmo tempo que os outros agentes. Os modelos dele aparecem no campo Modelo dos cards e no chat.',
              )
            : t('Desligado: o board não usa este agente.')}
      </Text>
    </section>
  );
}

/** A aba Conexão: o uso nos cards, a ferramenta nesta máquina, a conta, a conexão com o board e as ações do perfil. */
export function AgentConnection({ item, onEdit }: { item: AgentListItem; onEdit(profile: AiProfile): void }) {
  const p = item.profile;
  const installed = useAgentConnectStore((s) => (p ? s.installed[p.id] : undefined));
  return (
    <div className="agent-connection">
      {p && <ProfileUse profile={p} />}
      <ToolStep item={item} />
      <AccountPanel agentKey={item.key} name={item.name} profile={p} autoCheck={!!p && p.enabled && installed !== false} />
      {p && connectable(p) && <BoardConnection profile={p} />}
      {p && p.tool === 'claude' && <QuotaReading profile={p} />}
      {p && <ContextScope profile={p} />}
      {p && !connectable(p) && (
        <Text as="p" size="1" color="gray">
          {t(
            'Cópias e perfis personalizados não passam pelo Conectar: verifique as capacidades e dê a ciência do regime nas ações abaixo; depois, ligue o perfil.',
          )}
        </Text>
      )}
      {p && <ProfileActions profile={p} onEdit={onEdit} />}
      {!p && (
        <Callout.Root color="gray" size="1">
          <Callout.Text>
            {t(
              'O board ainda não executa cards com este agente: ele está no registro do ACP, mas não no catálogo da extensão. Dá para entrar na conta e conversar com ele na aba Testar.',
            )}
          </Callout.Text>
        </Callout.Root>
      )}
    </div>
  );
}
