import { useEffect, useState } from 'react';
import { Badge, Callout, SegmentedControl, Tabs, TextField } from '@radix-ui/themes';
import { HARNESS_SCOPES, aiToolInfo, type AiTool } from '../../../../shared/harness';
import {
  TOOL_REGIME,
  originsOf,
  topicBadge,
  topicCount,
  topicsOf,
  type HarnessOrigin,
  type HarnessTopic,
} from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconWarning } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { ImportArtifacts } from './ImportArtifacts';
import { TopicView } from './TopicView';
import { toolLabel } from './text';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** O que cada origem é, numa frase, sob o seletor. */
const ORIGIN_HINTS: Record<HarnessOrigin, string> = {
  board: 'O que você enviou ao board: só isso entra nas execuções, no modo de cada um (Sempre, Pelo card ou Desligado).',
  project: 'Arquivos desta pasta; valem só aqui.',
  user: 'Arquivos da sua pasta de usuário; valem em todos os projetos.',
  imported: 'Encontrados nas pastas que você importou; a ferramenta não os carrega sozinha.',
};

/**
 * A aba de uma ferramenta de IA no Harness. Primeiro a origem dos artefatos (Board, Projeto, Global, Importados),
 * que vale para todos os assuntos, e a busca; depois uma aba por assunto (Regras, Skills, Sub-agentes, MCPs,
 * Comandos, Hooks e Demais), só os que a ferramenta tem. As abas não montam o conteúdo que não está à vista: é
 * isso que mantém a tela leve num ambiente com muitos artefatos.
 */
export function ToolHarness({ tool }: { tool: AiTool }) {
  const state = useBoardStore((s) => s.state)!;
  const topicId = useBoardStore((s) => s.harnessTopic);
  const chosen = useBoardStore((s) => s.harnessOrigin);
  const [query, setQuery] = useState('');
  // a pasta do usuário não é vigiada: relê ao abrir a aba. A releitura espera a lista de plugins da CLI, por isso
  // a tela diz que está relendo até o host confirmar
  const refresh = useAction(() => harness.refresh());
  useEffect(() => {
    void refresh.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventory = state.harness.inventory.find((x) => x.tool === tool);
  const items = inventory?.items ?? [];
  const projectTool = tool === state.board.aiTool;
  const topics = topicsOf(tool, items);
  const active = topics.find((x) => x.id === topicId) ?? topics[0]!;
  const label = toolLabel(tool);
  // a marcação do board só vale para a ferramenta do projeto; uma origem que esta aba não tem cai em Projeto
  const origins = originsOf(
    projectTool,
    state.harnessImports.some((x) => x.tool === tool),
  );
  const origin: HarnessOrigin = origins.includes(chosen) ? chosen : 'project';

  return (
    <div className="scope-harness">
      <SectionHeader
        id={projectTool ? 'harness-project' : undefined}
        title={t('Harness do {tool}', { tool: label })}
        actions={
          <>
            <span role="status" className="small muted">
              {refresh.busy && (
                <>
                  <span className="spinner" aria-hidden /> {t('Relendo as pastas e os plugins…')}
                </>
              )}
            </span>
            <ActionButton
              variant="soft"
              color="gray"
              loading={refresh.busy}
              hint={t('Relê as pastas do projeto e a global e atualiza o catálogo; espera também a lista de plugins da ferramenta.')}
              onClick={() => void refresh.run()}
            >
              {t('Reler pastas')}
            </ActionButton>
            <ImportArtifacts tool={tool} />
          </>
        }
      >
        {rich(
          'Tudo que o {tool} carrega. Escolha onde olhar e depois o assunto: o <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA; só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.',
          { tool: label },
        )}
      </SectionHeader>
      <div className="row wrap harness-tool-picker">
        {projectTool ? (
          <Badge color="indigo" variant="soft">
            {t('ferramenta deste projeto')}
          </Badge>
        ) : (
          <span className="muted small">
            {t('Mostrando o que o {tool} carrega. As execuções do board usam o {board}: a marcação só vale para ele.', {
              tool: label,
              board: toolLabel(state.board.aiTool),
            })}
          </span>
        )}
        {!inventory?.installed && (
          <Badge color="gray" variant="outline">
            {t('não encontrada nesta máquina')}
          </Badge>
        )}
      </div>
      {TOOL_REGIME[tool] === 'person' && (
        <Callout.Root color="amber" size="1" className="harness-callout">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t(
              'A linha de comando do {tool} não desliga artefatos: regras, servidores MCP e o mais que estiver no projeto entram no contexto conforme o {tool} decidir. Para o "tudo desligado" valer, desligue nas configurações do {tool} ou remova do projeto o que você não quer no contexto das tarefas. O board só avisa.',
              { tool: aiToolInfo(tool).label },
            )}
          </Callout.Text>
        </Callout.Root>
      )}
      <div className="topic-bar">
        <SegmentedControl.Root
          size="2"
          value={origin}
          onValueChange={(next) => useBoardStore.setState({ harnessOrigin: next as HarnessOrigin })}
          aria-label={t('Origem dos artefatos')}
        >
          {origins.map((id) => (
            <SegmentedControl.Item key={id} value={id}>
              {id === 'board' ? t('Board') : t(HARNESS_SCOPES.find((x) => x.id === id)!.label)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        <TextField.Root
          className="topic-search"
          type="search"
          aria-label={t('Buscar por nome ou descrição')}
          placeholder={t('Buscar por nome ou descrição…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="muted small topic-origin-hint">{t(ORIGIN_HINTS[origin])}</p>
      <Tabs.Root value={active.id} onValueChange={(next) => useBoardStore.setState({ harnessTopic: next as HarnessTopic })}>
        <Tabs.List className="harness-tabs">
          {topics.map((x) => {
            // o título da aba diz o que há naquele assunto na origem escolhida: no Board, quantos estão marcados e,
            // nas regras, quantas esperam revisão; no catálogo, quantos artefatos a fonte tem
            const badge = origin === 'board' ? topicBadge(state, x) : { board: 0, pending: 0 };
            const count = origin === 'board' ? badge.board : topicCount(tool, items, x, origin);
            return (
              <Tabs.Trigger key={x.id} value={x.id}>
                {t(x.label)}
                {count > 0 && (
                  <Badge
                    color={badge.pending > 0 ? 'amber' : origin === 'board' ? 'indigo' : 'gray'}
                    variant="soft"
                    size="1"
                    className="topic-badge"
                  >
                    {badge.pending > 0
                      ? t('{n} no board, {off} desligadas', { n: badge.board, off: badge.pending })
                      : origin === 'board'
                        ? t('{n} no board', { n: badge.board })
                        : count}
                  </Badge>
                )}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {topics.map((x) => (
          <Tabs.Content key={x.id} value={x.id}>
            <TopicView key={`${tool}:${x.id}`} tool={tool} topic={x} origin={origin} query={query} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
