import { useEffect, useState } from 'react';
import { Badge, Tabs } from '@radix-ui/themes';
import { activeCounts, type StatusFilter } from '../../../../shared/artifactLibrary';
import { HARNESS_TOPICS, type HarnessTopic } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton } from '../../ui';
import { ArtifactList } from './ArtifactList';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { t } from '../../../i18n';

const BY_TOPIC = <T,>(v: T): Record<HarnessTopic, T> => ({ rules: v, skill: v, agent: v, mcp: v });

/**
 * A aba "Artefatos do board", a biblioteca: as regras, skills, agentes e servidores MCP que o board guarda, uma aba por
 * assunto. Importar e exportar valem para todos e ficam acima das abas; a busca, o filtro de estado e a pasta das skills
 * são de cada assunto e ficam aqui, para trocar de aba não os perder. O formulário de uma linha só existe aberto (monta
 * na própria `ArtifactList`).
 */
export function ArtifactsHarness() {
  const artifacts = useBoardStore((s) => s.state!.harness.library?.artifacts) ?? [];
  const topic = useBoardStore((s) => s.harnessTopic);
  const [queries, setQueries] = useState(() => BY_TOPIC(''));
  const [statuses, setStatuses] = useState<Record<HarnessTopic, StatusFilter>>(() => BY_TOPIC<StatusFilter>('all'));
  // a pasta selecionada nas skills (`null` = todas)
  const [folder, setFolder] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const active = HARNESS_TOPICS.find((x) => x.id === topic) ?? HARNESS_TOPICS[0]!;
  // abrir os artefatos relê as origens das cópias: a lista mostra o que mudou desde a cópia
  useEffect(() => void harness.refresh(), []);

  return (
    <div className="scope-harness artifacts-harness">
      <div className="actions-toolbar">
        <ActionButton
          hint={t('Importa regras, skills, agentes e servidores MCP de uma pasta, de uma ferramenta instalada ou de um arquivo.')}
          onClick={() => setImporting(true)}
        >
          {t('Importar')}
        </ActionButton>
        <ActionButton
          variant="soft"
          hint={t(
            'Copia regras, skills e agentes do board para a pasta de uma ferramenta (Claude Code, Cursor ou Kimi Code), no formato dela. Os servidores MCP não vão: o Conectar registra o do board.',
          )}
          onClick={() => setExporting(true)}
        >
          {t('Exportar para a ferramenta')}
        </ActionButton>
      </div>
      <Tabs.Root value={active.id} onValueChange={(next) => useBoardStore.setState({ harnessTopic: next as HarnessTopic })}>
        <Tabs.List className="harness-tabs">
          {HARNESS_TOPICS.map((x) => {
            const { active: on, total } = activeCounts(artifacts, x.kind);
            const feminine = x.kind === 'rule' || x.kind === 'skill';
            return (
              <Tabs.Trigger key={x.id} value={x.id}>
                {t(x.label)}
                {total > 0 && (
                  <Badge color={on < total ? 'amber' : 'gray'} variant="soft" size="1" className="topic-badge">
                    {feminine ? t('{on}/{total} ativas', { on, total }) : t('{on}/{total} ativos', { on, total })}
                  </Badge>
                )}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {HARNESS_TOPICS.map((x) => (
          <Tabs.Content key={x.id} value={x.id} id={x.id === 'agent' ? 'harness-agents' : undefined}>
            <ArtifactList
              kind={x.kind}
              topicLabel={t(x.label)}
              query={queries[x.id]}
              onQuery={(next) => setQueries({ ...queries, [x.id]: next })}
              status={statuses[x.id]}
              onStatus={(next) => setStatuses({ ...statuses, [x.id]: next })}
              folder={folder}
              onFolder={setFolder}
              onImport={() => setImporting(true)}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}
