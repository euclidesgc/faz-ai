import { useDeferredValue, useState } from 'react';
import { Badge, Callout, Tabs, TextField } from '@radix-ui/themes';
import { HARNESS_TOPICS, usageCounts, type HarnessTopic } from '../../../../shared/harnessTopics';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconWarning } from '../../ui';
import { ArtifactList } from './ArtifactList';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { t } from '../../../i18n';

const EMPTY_PICKED = (): Record<HarnessTopic, Set<string>> => ({ rules: new Set(), skill: new Set(), agent: new Set(), mcp: new Set() });

/**
 * A aba "Artefatos do board": as regras, skills, agentes e servidores MCP que o board guarda, uma aba por assunto.
 * A busca e a seleção são de cada assunto e ficam aqui, para trocar de aba não as perder; o editor de uma linha só
 * existe enquanto está aberto (monta na própria `ArtifactList`).
 */
export function ArtifactsHarness() {
  const artifacts = useBoardStore((s) => s.state!.harness.library?.artifacts) ?? [];
  const topic = useBoardStore((s) => s.harnessTopic);
  const [queries, setQueries] = useState<Record<HarnessTopic, string>>({ rules: '', skill: '', agent: '', mcp: '' });
  const [picked, setPicked] = useState(EMPTY_PICKED);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deferred = useDeferredValue(queries);
  const active = HARNESS_TOPICS.find((x) => x.id === topic) ?? HARNESS_TOPICS[0]!;
  const rules = usageCounts(artifacts, 'rule');

  return (
    <div className="scope-harness artifacts-harness">
      <div className="topic-bar">
        <TextField.Root
          className="topic-search"
          type="search"
          aria-label={t('Buscar por nome ou descrição')}
          placeholder={t('Buscar por nome ou descrição…')}
          value={queries[active.id]}
          onChange={(e) => setQueries({ ...queries, [active.id]: e.target.value })}
        />
        <ActionButton
          hint={t('Importa regras, skills, agentes e servidores MCP de uma pasta, de uma ferramenta instalada ou de um arquivo.')}
          onClick={() => setImporting(true)}
        >
          {t('Importar')}
        </ActionButton>
        <ActionButton
          variant="soft"
          hint={t(
            'Copia regras, skills e agentes do board para a pasta de uma ferramenta (Claude Code, Cursor ou Kimi Code), no formato dela.',
          )}
          onClick={() => setExporting(true)}
        >
          {t('Exportar para a ferramenta')}
        </ActionButton>
      </div>
      <Tabs.Root value={active.id} onValueChange={(next) => useBoardStore.setState({ harnessTopic: next as HarnessTopic })}>
        <Tabs.List className="harness-tabs">
          {HARNESS_TOPICS.map((x) => {
            const counts = usageCounts(artifacts, x.kind);
            const total = counts.always + counts.contextual + counts.off;
            const parts = [
              counts.always > 0 && t('{n} sempre', { n: counts.always }),
              counts.contextual > 0 && t('{n} pelo card', { n: counts.contextual }),
              counts.off > 0 && t('{n} desligadas', { n: counts.off }),
            ].filter(Boolean);
            return (
              <Tabs.Trigger key={x.id} value={x.id}>
                {t(x.label)}
                {total > 0 && (
                  <Badge color={counts.off > 0 ? 'amber' : 'gray'} variant="soft" size="1" className="topic-badge">
                    {x.kind === 'agent' ? total : parts.join(' · ')}
                  </Badge>
                )}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {HARNESS_TOPICS.map((x) => (
          <Tabs.Content key={x.id} value={x.id} id={x.id === 'agent' ? 'harness-agents' : undefined}>
            {x.id === 'rules' && rules.off > 0 && (
              <Callout.Root color="amber" size="1" className="harness-callout">
                <Callout.Icon>
                  <IconWarning />
                </Callout.Icon>
                <Callout.Text>
                  {t(
                    'Há regras desligadas: elas estão no board, mas não entram em nenhuma execução. Leia o texto de cada uma e ative ou apague; regra ativa entra em toda execução.',
                  )}
                </Callout.Text>
              </Callout.Root>
            )}
            <ArtifactList
              kind={x.kind}
              query={deferred[x.id]}
              picked={picked[x.id]}
              onPick={(next) => setPicked({ ...picked, [x.id]: next })}
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
