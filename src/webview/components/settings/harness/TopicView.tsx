import { useEffect, useState } from 'react';
import { Button, Callout, SegmentedControl, TextField } from '@radix-ui/themes';
import { HARNESS_SCOPES, type AiTool } from '../../../../shared/harness';
import { HARNESS_GROUPS, groupOf } from '../../../../shared/harnessCatalog';
import { catalogOriginOf, groupsFor, matchesQuery, type HarnessOrigin, type TopicInfo } from '../../../../shared/harnessTopics';
import { ai, harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconRules, IconSkills, IconWarning } from '../../ui';
import { BoardList } from './BoardList';
import { HarnessGroupCard } from './HarnessGroupCard';
import { ImportedFolders } from './ImportedFolders';
import { RuleWizard } from './RuleWizard';
import { SkillWizard } from './SkillWizard';
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
  // o assistente de criação aberto (regra ou skill); vale para a origem à vista
  const [wizard, setWizard] = useState<'rule' | 'skill' | null>(null);
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
  // "Indicar artefatos": a IA pré-seleciona no catálogo; o resultado vale para este assunto e esta ferramenta
  const suggestions = state.harnessSuggestions;
  const suggested =
    suggestions && suggestions.tool === tool && suggestions.kind === topic.kind
      ? Object.fromEntries(suggestions.items.map((x) => [x.location, x.reason]))
      : undefined;
  const [asked, setAsked] = useState(false);
  const busy = state.chat.busy;
  // a resposta chegou (ou falhou): o botão volta ao normal
  useEffect(() => {
    if (suggestions || !busy) setAsked(false);
  }, [suggestions, busy]);
  const canSuggest = !!topic.kind && projectTool && origin !== 'board';
  // os assistentes de regras e de skills gravam arquivos da ferramenta do projeto, no Projeto ou no Global
  const assist =
    projectTool && (origin === 'project' || origin === 'user')
      ? topic.id === 'rules'
        ? 'rule'
        : topic.id === 'skill'
          ? 'skill'
          : null
      : null;
  const suggest = () => {
    setAsked(true);
    harness.suggest(tool, topic.kind!);
  };

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
            setWizard(null);
          }}
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
      {canSuggest && (
        <div className="row wrap topic-suggest">
          <Button
            variant="soft"
            color="gray"
            size="1"
            disabled={busy}
            title={
              busy
                ? t('A IA ainda está respondendo no chat do board.')
                : t(
                    'A IA lê o projeto e o catálogo deste assunto e deixa pré-selecionados os artefatos que fazem mais sentido; você confirma.',
                  )
            }
            onClick={suggest}
          >
            {asked && busy ? t('Indicando…') : t('Indicar artefatos')}
          </Button>
          {suggested && !suggestions?.error && (
            <span className="muted small">
              {suggestions!.items.length
                ? t('{n} indicados: confira a seleção e use "Enviar para o board".', { n: suggestions!.items.length })
                : t('A IA não indicou nenhum artefato deste assunto.')}
            </span>
          )}
          {suggested && (
            <Button variant="ghost" size="1" onClick={() => harness.clearSuggestions()}>
              {t('Descartar indicação')}
            </Button>
          )}
        </div>
      )}
      {assist && (
        <div className="row wrap topic-suggest">
          <Button
            variant="soft"
            color="gray"
            size="1"
            title={
              assist === 'rule'
                ? t('Um passo a passo para escrever uma regra no formato da ferramenta; ela entra no board desligada.')
                : t('Um passo a passo para escrever uma skill no formato da ferramenta; ela entra no board em "Pelo card".')
            }
            onClick={() => setWizard(wizard === assist ? null : assist)}
          >
            {assist === 'rule' ? <IconRules /> : <IconSkills />}{' '}
            {assist === 'rule' ? t('Criar regra com ajuda') : t('Criar skill com ajuda')}
          </Button>
          <Button
            variant="soft"
            color="gray"
            size="1"
            disabled={busy}
            title={
              busy
                ? t('A IA ainda está respondendo no chat do board.')
                : assist === 'rule'
                  ? t('A IA lê o projeto e escreve de 3 a 5 regras, desligadas no board; acompanhe no chat do board.')
                  : t('A IA lê o projeto e cria de 3 a 5 skills, em "Pelo card"; acompanhe no chat do board.')
            }
            onClick={() => (assist === 'rule' ? ai.suggestRules() : ai.suggestSkills())}
          >
            {assist === 'rule' ? t('Sugerir regras com IA') : t('Sugerir skills com IA')}
          </Button>
        </div>
      )}
      {assist && wizard === 'rule' && (
        <RuleWizard key={`rule:${origin}`} tool={tool} scope={origin as 'project' | 'user'} onClose={() => setWizard(null)} />
      )}
      {assist && wizard === 'skill' && (
        <SkillWizard key={`skill:${origin}`} tool={tool} scope={origin as 'project' | 'user'} onClose={() => setWizard(null)} />
      )}
      {canSuggest && suggestions?.tool === tool && suggestions.kind === topic.kind && suggestions.error && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(suggestions.error)}</Callout.Text>
        </Callout.Root>
      )}
      {origin === 'board' && topic.kind && <BoardList kind={topic.kind} query={query} onOpenCatalog={(next) => setChosen(next)} />}
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
            suggested={suggested}
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
