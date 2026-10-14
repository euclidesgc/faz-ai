import { useEffect } from 'react';
import { Badge, Button, Callout, Tabs } from '@radix-ui/themes';
import { aiToolInfo, type AiTool } from '../../../../shared/harness';
import { TOOL_REGIME, topicsOf, type HarnessTopic } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconWarning } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { ImportArtifacts } from './ImportArtifacts';
import { TopicView } from './TopicView';
import { toolLabel } from './text';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/**
 * A aba de uma ferramenta de IA no Harness: uma aba por assunto (Regras, Skills, Sub-agentes, MCPs, Comandos,
 * Hooks e Demais), só os que a ferramenta tem, e dentro de cada uma a origem dos artefatos. As abas não montam
 * o conteúdo que não está à vista: é isso que mantém a tela leve num ambiente com muitos artefatos.
 */
export function ToolHarness({ tool }: { tool: AiTool }) {
  const state = useBoardStore((s) => s.state)!;
  const topicId = useBoardStore((s) => s.harnessTopic);
  // a pasta do usuário não é vigiada: relê ao abrir a aba
  useEffect(() => harness.refresh(), []);

  const inventory = state.harness.inventory.find((x) => x.tool === tool);
  const projectTool = tool === state.board.aiTool;
  const topics = topicsOf(tool, inventory?.items ?? []);
  const active = topics.find((x) => x.id === topicId) ?? topics[0]!;
  const label = toolLabel(tool);

  return (
    <div className="scope-harness">
      <SectionHeader
        id={projectTool ? 'harness-project' : undefined}
        title={t('Harness do {tool}', { tool: label })}
        actions={
          <>
            <Button variant="soft" color="gray" title={t('Relê as pastas do projeto e do usuário')} onClick={() => harness.refresh()}>
              {t('Reler pastas')}
            </Button>
            <ImportArtifacts tool={tool} />
          </>
        }
      >
        {rich(
          'Tudo que o {tool} carrega, por assunto. O <b>catálogo</b> (Projeto, Global e Importados) mostra o que existe e não ocupa o contexto da IA. Só o que você envia ao <b>Board</b> pode ser usado pelas execuções, no modo de cada artefato.',
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
      <Tabs.Root value={active.id} onValueChange={(next) => useBoardStore.setState({ harnessTopic: next as HarnessTopic })}>
        <Tabs.List className="harness-tabs">
          {topics.map((x) => (
            <Tabs.Trigger key={x.id} value={x.id}>
              {t(x.label)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {topics.map((x) => (
          <Tabs.Content key={x.id} value={x.id}>
            <TopicView key={`${tool}:${x.id}`} tool={tool} topic={x} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
