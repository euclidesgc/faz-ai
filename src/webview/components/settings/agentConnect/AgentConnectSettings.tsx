import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, Heading, Tabs, Text, TextField } from '@radix-ui/themes';
import { agentList, type AgentListItem } from '../../../../shared/agentConnect';
import { modeLabel, type AiProfile } from '../../../../shared/aiProfiles';
import { toolEntry } from '../../../../shared/aiTools';
import { settings } from '../../../commands';
import { formatDateTime, t } from '../../../i18n';
import { listenAgentConnect, useAgentConnectStore, type AgentTab } from '../../../store/agentConnectStore';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { contextScopeState } from '../../../../shared/contextScope';
import { ActionButton, Hint, IconConnect, IconExternal, IconLock, IconPlus } from '../../ui';
import { AiProfileForm } from '../AiProfileForm';
import { PageHeader } from '../PageHeader';
import { ExecutionPoliciesSettings } from '../policies/ExecutionPoliciesSettings';
import { AgentConnection } from './AgentConnection';
import { AgentDetails } from './AgentDetails';
import { AgentModels } from './AgentModels';
import { AgentTest } from './AgentTest';
import { STATE_COLOR, STATE_LABEL, agentState, profileHeadline } from './agentStatus';

/**
 * O ícone do registro: um SVG monocromático preto. Como `<img>` (a máscara CSS esbarra no CORS do CDN); no tema
 * escuro o CSS inverte as cores para ele não sumir no fundo.
 */
function AgentIcon({ icon }: { icon: string | null }) {
  return icon ? <img className="agent-icon" src={icon} alt="" aria-hidden /> : <span className="agent-icon empty" aria-hidden />;
}

function AgentRow({ item, selected, onSelect }: { item: AgentListItem; selected: boolean; onSelect(): void }) {
  const connections = useBoardStore((s) => s.state!.connections);
  const installed = useAgentConnectStore((s) => s.installed);
  const scope = useBoardStore((s) => (item.profile ? s.state!.contextScopes?.[item.profile.id] : undefined));
  const state = agentState(item, connections, installed);
  return (
    <button type="button" className={`agent-row ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <AgentIcon icon={item.icon} />
      <span className="agent-row-text">
        <span className="agent-row-name">{item.name}</span>
        <span className="muted">
          {item.profile ? modeLabel(item.profile.mode) : 'ACP'} · {t(STATE_LABEL[state])}
          {/* o cadeado compara os agentes sem abrir cada um: o contexto fechado foi verificado */}
          {contextScopeState(scope) === 'closed' && (
            <span className="agent-row-lock" role="img" aria-label={t('Contexto fechado')}>
              <IconLock />
            </span>
          )}
        </span>
      </span>
      {/* a linha já diz a situação: o selo fica para o que pede atenção (o Conectar parado ou à espera) */}
      {item.inUse ? (
        <Badge color="indigo">{t('Padrão')}</Badge>
      ) : (
        (state === 'waiting' || state === 'failed') && (
          <Badge color={STATE_COLOR[state]} variant="soft">
            {t(STATE_LABEL[state])}
          </Badge>
        )
      )}
    </button>
  );
}

/** A lista: os agentes do board e, à parte, os do registro do ACP que o board ainda só testa. */
function AgentList({
  board,
  others,
  selected,
  onSelect,
  onNew,
}: {
  board: AgentListItem[];
  others: AgentListItem[];
  selected: string;
  onSelect(key: string): void;
  onNew(): void;
}) {
  const { listing, loadingRegistry, registryError } = useAgentConnectStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (i: AgentListItem) =>
    !q || i.name.toLowerCase().includes(q) || i.key.includes(q) || (i.registry?.description.toLowerCase().includes(q) ?? false);
  const shownOthers = others.filter(match);
  return (
    <Card className="agent-list">
      <TextField.Root
        aria-label={t('Buscar agente')}
        placeholder={t('Buscar agente')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="agent-rows" role="list" aria-label={t('Agentes do board')}>
        {board.filter(match).map((i) => (
          <AgentRow key={i.key} item={i} selected={selected === i.key} onSelect={() => onSelect(i.key)} />
        ))}
      </div>
      <ActionButton size="1" variant="soft" color="gray" hint={t('Abre o formulário de um perfil de CLI personalizado.')} onClick={onNew}>
        <IconPlus /> {t('Agente personalizado (CLI)')}
      </ActionButton>
      <details className="agent-others" open={!!q && shownOthers.length > 0}>
        <summary>
          {t('Outros agentes do registro do ACP')} <span className="muted">({shownOthers.length})</span>
        </summary>
        <Text as="p" size="1" color="gray">
          {t('O board ainda não executa cards com eles: dá para entrar na conta e conversar com cada um na sessão de teste.')}
        </Text>
        {loadingRegistry && !listing && (
          <Text size="1" color="gray">
            {t('Carregando o registro…')}
          </Text>
        )}
        {registryError && (
          <Text size="1" color={listing?.agents.length ? 'gray' : 'red'}>
            {listing?.agents.length
              ? t('Não deu para atualizar o registro ({error}); a lista é a de {date}.', {
                  error: t(registryError),
                  date: listing.fetchedAt ? formatDateTime(listing.fetchedAt) : '?',
                })
              : t(registryError)}
          </Text>
        )}
        <div className="agent-rows" role="list" aria-label={t('Outros agentes do registro do ACP')}>
          {shownOthers.map((i) => (
            <AgentRow key={i.key} item={i} selected={selected === i.key} onSelect={() => onSelect(i.key)} />
          ))}
        </div>
      </details>
    </Card>
  );
}

/** O agente escolhido: a descrição e as abas Conexão, Modelos, Testar e Detalhes. */
function AgentDetail({ item, onEdit }: { item: AgentListItem; onEdit(profile: AiProfile): void }) {
  const { tab, setTab } = useAgentConnectStore();
  const p = item.profile;
  // a página e a descrição do agente: as do catálogo da extensão para o perfil (o Claude Code roda pela CLI, e a
  // entrada do registro dele é o adaptador ACP), as do registro para o agente que só existe lá
  const entry = p ? toolEntry(p.tool) : undefined;
  const docs = entry?.docs ?? item.registry?.url ?? null;
  const description = p && p.mode !== 'acp' && entry ? t(entry.billing) : item.registry?.description || (entry ? t(entry.billing) : '');
  const tabs: AgentTab[] = p ? ['connection', 'models', 'test', 'details'] : ['connection', 'test', 'details'];
  const current = tabs.includes(tab) ? tab : 'connection';
  return (
    <Card className="agent-detail" aria-label={item.name}>
      <div className="agent-detail-head">
        <AgentIcon icon={item.icon} />
        <div>
          <Heading as="h4" size="3">
            {item.name}
          </Heading>
          <Text size="1" color="gray">
            {p ? profileHeadline(p) : t('Registro do ACP · {version}', { version: item.registry?.version ?? '?' })}
          </Text>
        </div>
        {item.inUse && (
          <Hint content={t('Roda os cards que não dizem qual modelo usar. Para trocar, use Tornar padrão na aba Conexão de outro agente.')}>
            <Badge color="indigo" tabIndex={0}>
              {t('Padrão')}
            </Badge>
          </Hint>
        )}
      </div>
      {description && <Text size="2">{description}</Text>}
      {docs && (
        <a href={docs} target="_blank" rel="noopener noreferrer">
          <IconExternal /> {t('Página do agente')}
        </a>
      )}
      <Tabs.Root value={current} onValueChange={(v) => setTab(v as AgentTab)}>
        <Tabs.List>
          <Tabs.Trigger value="connection">{t('Conexão')}</Tabs.Trigger>
          {p && <Tabs.Trigger value="models">{t('Modelos')}</Tabs.Trigger>}
          <Tabs.Trigger value="test">{t('Testar')}</Tabs.Trigger>
          <Tabs.Trigger value="details">{t('Detalhes')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="connection" className="agent-tab-content">
          <AgentConnection item={item} />
        </Tabs.Content>
        {p && (
          <Tabs.Content value="models" className="agent-tab-content">
            <AgentModels profile={p} />
          </Tabs.Content>
        )}
        <Tabs.Content value="test" className="agent-tab-content">
          <AgentTest item={item} />
        </Tabs.Content>
        <Tabs.Content value="details" className="agent-tab-content">
          <AgentDetails item={item} onEdit={onEdit} />
        </Tabs.Content>
      </Tabs.Root>
    </Card>
  );
}

/**
 * Configurações › Conectar agentes: escolher o agente de IA que roda os cards, entrar na conta dele, conectá-lo ao
 * board, ajustar os modelos e testar. A lista junta os agentes que o board executa (o catálogo da extensão e os
 * perfis personalizados) com o registro oficial do ACP, de onde vêm o ícone, a descrição e a versão publicada.
 */
export function AgentConnectSettings() {
  const state = useBoardStore((s) => s.state)!;
  const requested = useBoardStore((s) => s.connectTool);
  const { listing, loadingRegistry, loadRegistry, selected, select } = useAgentConnectStore();
  const [editor, setEditor] = useState<AiProfile | 'new' | null>(null);
  const probe = useAction(() => settings.probeAiProfiles());
  useEffect(() => {
    listenAgentConnect();
    loadRegistry();
    void probe.run();
    // a consulta acontece na entrada da aba; "Atualizar" pede outra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // o aviso do topo abre a tela já no agente do perfil
  useEffect(() => {
    if (!requested) return;
    select(requested, 'connection');
    // o pedido foi atendido: o mesmo aviso pode pedir de novo depois
    useBoardStore.setState({ connectTool: null });
  }, [requested, select]);
  const aiTool = state.board.aiTool;
  const { board, others } = useMemo(
    () => agentList(state.board.aiProfiles, listing?.agents ?? null, aiTool),
    [state.board.aiProfiles, listing, aiTool],
  );
  const all = [...board, ...others];
  const item = all.find((i) => i.key === (selected ?? aiTool)) ?? board[0];
  const onSaved = () => {
    setEditor(null);
    void settings.probeAiProfiles();
  };
  return (
    <div className="agents">
      <PageHeader
        title={t('Conectar agentes')}
        actions={
          <ActionButton
            variant="soft"
            color="gray"
            hint={t(
              'Confere de novo quais agentes estão instalados, a versão de cada um e se você está com a conta conectada. Use depois de instalar um agente, entrar na conta dele ou atualizá-lo fora do board.',
            )}
            loading={probe.busy || loadingRegistry}
            onClick={() => {
              // um botão só: a lista do registro (agente recém-instalado) e a situação de cada perfil (versão e login)
              loadRegistry(true);
              void probe.run();
            }}
          >
            {t('Atualizar')}
          </ActionButton>
        }
      >
        {t(
          'Conecte os agentes de IA ao board, entre na conta de cada um e ajuste os modelos. Todo agente ligado roda cards, ao mesmo tempo que os outros: cada card vai para o agente do modelo dele (o do card, o do agente do harness ou o da regra de sugestão), e o padrão roda os cards sem modelo.',
        )}
      </PageHeader>
      <div className="agents-grid">
        <AgentList
          board={board}
          others={others}
          selected={item?.key ?? ''}
          onSelect={(key) => {
            setEditor(null);
            select(key);
          }}
          onNew={() => setEditor('new')}
        />
        {editor ? (
          <AiProfileForm
            key={editor === 'new' ? 'new' : editor.id}
            profile={editor === 'new' ? undefined : editor}
            onClose={() => setEditor(null)}
            onSaved={onSaved}
          />
        ) : item ? (
          <AgentDetail key={item.key} item={item} onEdit={setEditor} />
        ) : (
          <Card className="agent-detail">
            <IconConnect /> {t('Escolha um agente na lista.')}
          </Card>
        )}
      </div>
      {/* as regras de fallback são do agente escolhido: cada uma parte de um modelo dele que falha */}
      {item?.profile && <ExecutionPoliciesSettings key={item.profile.id} profileId={item.profile.id} />}
    </div>
  );
}
