import { useEffect, useState } from 'react';
import { Callout } from '@radix-ui/themes';
import type { AiTool } from '../../../../shared/harness';
import { HARNESS_GROUPS, groupOf } from '../../../../shared/harnessCatalog';
import { catalogOriginOf, groupsFor, matchesQuery, type HarnessOrigin, type TopicInfo } from '../../../../shared/harnessTopics';
import { ai, harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconRules, IconSkills, IconWarning } from '../../ui';
import { BoardList } from './BoardList';
import { HarnessGroupCard } from './HarnessGroupCard';
import { ImportedFolders } from './ImportedFolders';
import { RuleWizard } from './RuleWizard';
import { SkillWizard } from './SkillWizard';
import { useItemActions } from './useItemActions';
import { t } from '../../../i18n';

/**
 * Um assunto de uma ferramenta (Regras, Skills, Sub-agentes…) numa origem (Board, Projeto, Global ou Importados),
 * escolhida na aba da ferramenta junto com a busca: os grupos do catálogo ou a lista do board.
 */
export function TopicView({ tool, topic, origin, query }: { tool: AiTool; topic: TopicInfo; origin: HarnessOrigin; query: string }) {
  const state = useBoardStore((s) => s.state)!;
  const [open, setOpen] = useState<string | null>(null);
  // o assistente de criação aberto (regra ou skill); vale para a origem à vista
  const [wizard, setWizard] = useState<'rule' | 'skill' | null>(null);
  // trocar de origem fecha o formulário e o assistente abertos: eles eram da origem anterior
  useEffect(() => {
    setOpen(null);
    setWizard(null);
  }, [origin]);
  const all = state.harness.inventory.find((x) => x.tool === tool)?.items ?? [];
  const actions = useItemActions(tool, all);
  const projectTool = tool === state.board.aiTool;
  const setChosen = (next: HarnessOrigin) => useBoardStore.setState({ harnessOrigin: next });
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

  // comandos, hooks e os demais não têm marcação: a ferramenta os carrega sozinha, e no Board só há o aviso
  if (origin === 'board' && !topic.kind)
    return (
      <div className="topic-view">
        <p className="muted small scope-empty">
          {t('Este assunto não entra no board: a ferramenta carrega esses arquivos por conta própria. Veja em Projeto ou Global.')}
        </p>
      </div>
    );

  return (
    <div className="topic-view">
      {canSuggest && (
        <div className="actions-toolbar topic-suggest">
          <ActionButton
            variant="soft"
            color="gray"
            disabled={busy}
            disabledReason={t('A IA ainda está respondendo no chat do board.')}
            hint={t(
              'A IA lê o projeto e o catálogo deste assunto e deixa pré-selecionados os artefatos que fazem mais sentido; você confirma.',
            )}
            onClick={suggest}
          >
            {asked && busy ? t('Indicando…') : t('Indicar artefatos')}
          </ActionButton>
          {suggested && !suggestions?.error && (
            <span className="muted small">
              {suggestions!.items.length
                ? t('{n} indicados: confira a seleção e use "Enviar para o board".', { n: suggestions!.items.length })
                : t('A IA não indicou nenhum artefato deste assunto.')}
            </span>
          )}
          {suggested && (
            <ActionButton
              variant="ghost"
              hint={t('Limpa a pré-seleção indicada pela IA; nada foi enviado ao board.')}
              onClick={() => harness.clearSuggestions()}
            >
              {t('Descartar indicação')}
            </ActionButton>
          )}
        </div>
      )}
      {assist && (
        <div className="actions-toolbar topic-suggest">
          <ActionButton
            variant="soft"
            color="gray"
            hint={
              assist === 'rule'
                ? t('Um passo a passo para escrever uma regra no formato da ferramenta; ela entra no board desligada.')
                : t('Um passo a passo para escrever uma skill no formato da ferramenta; ela entra no board em "Pelo card".')
            }
            onClick={() => setWizard(wizard === assist ? null : assist)}
          >
            {assist === 'rule' ? <IconRules /> : <IconSkills />}{' '}
            {assist === 'rule' ? t('Criar regra com ajuda') : t('Criar skill com ajuda')}
          </ActionButton>
          <ActionButton
            variant="soft"
            color="gray"
            disabled={busy}
            disabledReason={t('A IA ainda está respondendo no chat do board.')}
            hint={
              assist === 'rule'
                ? t('A IA lê o projeto e escreve de 3 a 5 regras, desligadas no board; acompanhe no chat do board.')
                : t('A IA lê o projeto e cria de 3 a 5 skills, em "Pelo card"; acompanhe no chat do board.')
            }
            onClick={() => (assist === 'rule' ? ai.suggestRules() : ai.suggestSkills())}
          >
            {assist === 'rule' ? t('Sugerir regras com IA') : t('Sugerir skills com IA')}
          </ActionButton>
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
