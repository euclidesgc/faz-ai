import { useState } from 'react';
import { SegmentedControl, TextField } from '@radix-ui/themes';
import { HARNESS_SCOPES, type AiTool } from '../../../../shared/harness';
import { HARNESS_GROUPS, groupOf } from '../../../../shared/harnessCatalog';
import { catalogOriginOf, groupsFor, matchesQuery, type HarnessOrigin, type TopicInfo } from '../../../../shared/harnessTopics';
import { useBoardStore } from '../../../store/boardStore';
import { BoardList } from './BoardList';
import { HarnessGroupCard } from './HarnessGroupCard';
import { ImportedFolders } from './ImportedFolders';
import { useItemActions } from './useItemActions';
import { t } from '../../../i18n';

/** O que cada origem é, numa frase, antes da lista. */
const ORIGIN_HINTS: Record<HarnessOrigin, string> = {
  board: 'O que você enviou ao board: só isso entra nas execuções, no modo de cada um (Sempre, Pelo card ou Desligado).',
  project: 'Arquivos desta pasta; valem só aqui.',
  user: 'Arquivos da sua pasta de usuário; valem em todos os projetos.',
  imported: 'Encontrados nas pastas que você importou; a ferramenta não os carrega sozinha.',
};

/**
 * Um assunto de uma ferramenta (Regras, Skills, Sub-agentes…): a busca, a origem (Board, Projeto, Global ou
 * Importados) e, na origem, os grupos do catálogo ou a lista do board. Só a origem à vista é renderizada.
 */
export function TopicView({ tool, topic }: { tool: AiTool; topic: TopicInfo }) {
  const state = useBoardStore((s) => s.state)!;
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<HarnessOrigin>('project');
  const [open, setOpen] = useState<string | null>(null);
  const all = state.harness.inventory.find((x) => x.tool === tool)?.items ?? [];
  const actions = useItemActions(tool, all);
  const projectTool = tool === state.board.aiTool;
  const hasImports = state.harnessImports.some((x) => x.tool === tool);
  // a marcação do board só vale para a ferramenta do projeto
  const origins: HarnessOrigin[] = [
    ...(topic.kind && projectTool ? (['board'] as const) : []),
    'project',
    'user',
    ...(hasImports ? (['imported'] as const) : []),
  ];
  const origin = origins.includes(chosen) ? chosen : 'project';

  const fromCatalog =
    origin === 'board' ? [] : all.filter((i) => catalogOriginOf(tool, i) === origin && matchesQuery(query, i.name, i.description));
  const groups = origin === 'board' ? [] : HARNESS_GROUPS.filter((g) => groupsFor(topic, origin).includes(g.id));
  // a tabela dos agentes tem a própria busca e a própria mensagem de vazio
  const ownTable = topic.id === 'agent' && projectTool && origin !== 'imported';
  const nothingFound =
    query.trim() !== '' && !ownTable && origin !== 'board' && !fromCatalog.some((i) => groups.some((g) => g.id === groupOf(tool, i)));

  return (
    <div className="topic-view">
      <div className="topic-bar">
        <SegmentedControl.Root
          size="1"
          value={origin}
          onValueChange={(next) => {
            setChosen(next as HarnessOrigin);
            setOpen(null);
          }}
          aria-label={t('Origem dos artefatos')}
        >
          {origins.map((id) => (
            <SegmentedControl.Item key={id} value={id}>
              {id === 'board' ? 'Board' : t(HARNESS_SCOPES.find((x) => x.id === id)!.label)}
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
      {origin === 'board' && topic.kind && <BoardList kind={topic.kind} query={query} />}
      {origin === 'imported' && <ImportedFolders tool={tool} />}
      {nothingFound && <p className="muted small scope-empty">{t('Nada encontrado para a busca.')}</p>}
      {!nothingFound &&
        groups.map((g) => (
          <HarnessGroupCard
            key={`${tool}:${origin}:${g.id}`}
            group={g}
            tool={tool}
            scope={origin === 'board' ? 'project' : origin}
            query={query}
            items={fromCatalog.filter((i) => groupOf(tool, i) === g.id)}
            all={all}
            actions={actions}
            open={open}
            onOpen={setOpen}
          />
        ))}
    </div>
  );
}
