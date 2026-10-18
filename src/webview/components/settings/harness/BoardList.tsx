import { useState } from 'react';
import { Badge, Button, Callout, Checkbox } from '@radix-ui/themes';
import { HARNESS_SCOPES, type HarnessItem } from '../../../../shared/harness';
import {
  HARNESS_USAGES,
  missingSelections,
  selectedItems,
  selectionKey,
  usageOptions,
  type HarnessUsage,
  type SelectableKind,
} from '../../../../shared/harnessSelection';
import { matchesQuery, type HarnessOrigin } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconWarning } from '../../ui';
import { UsageSelect } from './UsageSelect';
import { t } from '../../../i18n';

/** O que a pessoa lê como origem do artefato: Projeto, Global, Importados ou de plugin. */
const originLabel = (item: HarnessItem): string => t(HARNESS_SCOPES.find((x) => x.id === item.scope)?.label ?? item.scope);

/**
 * A origem Board de um assunto: o que a pessoa enviou ao board, com o modo de cada um (o que decide se
 * entra nas execuções), de onde vem e como tirar. Uma origem que sumiu aparece como ausente na mesma
 * lista, sem quebrar os cards que a listam.
 */
export function BoardList({
  kind,
  query,
  onOpenCatalog,
  central = false,
}: {
  central?: boolean;
  kind: SelectableKind;
  query: string;
  /** leva à origem do catálogo (Projeto ou Global), de onde se envia ao board */
  onOpenCatalog: (origin: HarnessOrigin) => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const allItems = selectedItems(state, kind);
  const items = allItems.filter((i) => matchesQuery(query, i.name, i.description));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const keyOf = (item: HarnessItem) => item.boardArtifactId ?? selectionKey(item);
  const chosen = allItems.filter((item) => picked.has(keyOf(item)));
  const bulkEnabled = central && ['skill', 'agent', 'mcp'].includes(kind);
  const bulkLabels =
    kind === 'agent'
      ? { group: 'Ações em massa de subagentes', visible: 'Selecionar subagentes visíveis', item: 'Selecionar subagente: {name}' }
      : kind === 'mcp'
        ? { group: 'Ações em massa de MCPs', visible: 'Selecionar MCPs visíveis', item: 'Selecionar MCP: {name}' }
        : { group: 'Ações em massa de skills', visible: 'Selecionar skills visíveis', item: 'Selecionar skill: {name}' };
  const pick = (list: HarnessItem[], checked: boolean) =>
    setPicked((previous) => {
      const next = new Set(previous);
      for (const item of list) {
        if (checked) next.add(keyOf(item));
        else next.delete(keyOf(item));
      }
      return next;
    });
  const bulk = useAction(async (targets: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null) => {
    await harness.setSelection(targets, usage);
    setPicked(new Set());
  });
  const targets = chosen.map((item) => ({ kind, location: selectionKey(item) }));
  const missing = missingSelections(state).filter((x) => x.kind === kind && matchesQuery(query, x.location));
  const remove = (location: string) => harness.setSelection([{ kind, location }], null);
  const modes = usageOptions(kind);
  const total = selectedItems(state, kind).length + missingSelections(state).filter((x) => x.kind === kind).length;

  return (
    <div className="board-list">
      {!central && kind === 'instructions' && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t(
              'As regras entram desligadas: escritas para outro contexto, elas podem conflitar com o fluxo e as definições do board (fases, aprovação, uso do MCP). Leia o texto de cada uma antes de ativar; regra ativa entra em toda execução.',
            )}
          </Callout.Text>
        </Callout.Root>
      )}
      {!central &&
        (total === 0 && state.harness.library && kind === 'skill' ? (
          <p className="muted small">
            {t(
              'Nenhuma skill na biblioteca. Use Importar de uma pasta acima ou cole uma pasta com SKILL.md na biblioteca e clique em Atualizar lista.',
            )}
          </p>
        ) : (
          total === 0 && (
            <div className="board-empty">
              <p className="muted small">
                {kind === 'agent'
                  ? t(
                      'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um em Projeto ou Global, com "Criar agente com ajuda" ou pelas sugestões prontas.',
                    )
                  : kind === 'instructions'
                    ? t(
                        'Nenhuma regra no board. Envie as do projeto a partir de Projeto ou Global; elas entram desligadas, para você revisar antes de ativar.',
                      )
                    : t(
                        'Nada neste assunto no board: o planejamento dos cards não tem de onde escolher. Vá a Projeto ou Global, use "Indicar artefatos" e envie ao board.',
                      )}
              </p>
              <div className="row">
                <Button size="1" variant="soft" onClick={() => onOpenCatalog('project')}>
                  {t('Ir para Projeto')}
                </Button>
                <Button size="1" variant="soft" color="gray" onClick={() => onOpenCatalog('user')}>
                  {t('Ir para Global')}
                </Button>
              </div>
            </div>
          )
        ))}
      {central && total === 0 && (
        <p className="muted small">{t('Nenhum artefato nesta aba. Crie um aqui ou importe uma pasta para começar.')}</p>
      )}
      {total > 0 && items.length + missing.length === 0 && <p className="muted small scope-empty">{t('Nada encontrado para a busca.')}</p>}
      {bulkEnabled && allItems.length > 0 && (
        <div className="item-list-head" role="group" aria-label={t(bulkLabels.group)}>
          <label className="item-check-all">
            <Checkbox
              aria-label={t(bulkLabels.visible)}
              disabled={bulk.busy || items.length === 0}
              checked={
                items.length > 0 && items.every((item) => picked.has(keyOf(item)))
                  ? true
                  : items.some((item) => picked.has(keyOf(item)))
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(checked) => pick(items, checked === true)}
            />
            <span className="muted small">{t('Selecionar todos')}</span>
          </label>
          {chosen.length > 0 && (
            <>
              <span className="muted small">{t('{n} selecionados', { n: chosen.length })}</span>
              <Button size="1" variant="ghost" disabled={bulk.busy} onClick={() => setPicked(new Set())}>
                {t('Limpar seleção')}
              </Button>
              {HARNESS_USAGES.filter((mode) => kind !== 'agent' || mode.id === 'contextual').map((mode) => (
                <ActionButton
                  key={mode.id}
                  size="1"
                  variant="soft"
                  loading={bulk.busy}
                  hint={t(mode.hint)}
                  onClick={() => void bulk.run(targets, mode.id)}
                >
                  {t(kind === 'agent' ? 'Disponível no board' : mode.label)}
                </ActionButton>
              ))}
              <ActionButton
                size="1"
                variant="soft"
                color="red"
                loading={bulk.busy}
                hint={t('Exclui os artefatos selecionados da biblioteca. Os arquivos de origem serão preservados.')}
                onClick={() =>
                  useBoardStore.getState().ask({
                    title: t('Excluir {n} artefatos da biblioteca?', { n: chosen.length }),
                    message:
                      t('As cópias selecionadas serão excluídas. As origens serão preservadas. Esta ação não pode ser desfeita.') +
                      '\n\n' +
                      chosen.map((item) => `- ${item.name}`).join('\n'),
                    confirmLabel: t('Excluir'),
                    danger: true,
                    onConfirm: () => void bulk.run(targets, null),
                  })
                }
              >
                {t('Excluir selecionadas')}
              </ActionButton>
            </>
          )}
        </div>
      )}
      {bulk.error && <p role="alert">{bulk.error}</p>}
      <ul className="item-list">
        {items.map((i) => (
          <li key={`${i.kind}:${selectionKey(i)}`} className={`item-row${bulkEnabled && picked.has(keyOf(i)) ? ' selected' : ''}`}>
            <span className="item-check">
              {bulkEnabled && (
                <Checkbox
                  aria-label={t(bulkLabels.item, { name: i.name })}
                  checked={picked.has(keyOf(i))}
                  disabled={bulk.busy}
                  onCheckedChange={(checked) => pick([i], checked === true)}
                />
              )}
            </span>
            <div className="item-main">
              <div className="item-title">
                <span className="item-name">{i.name}</span>
                <Badge color="gray" variant="soft" title={i.plugin}>
                  {i.boardArtifactId ? t('Biblioteca do board') : originLabel(i)}
                </Badge>
                {i.plugin && (
                  <Badge color="gray" variant="outline">
                    {i.plugin}
                  </Badge>
                )}
              </div>
              {i.kind === 'mcp' ? (
                <p className="item-hint">
                  {i.description && i.description !== state.harness.library?.artifacts.find((a) => a.id === i.boardArtifactId)?.mcpSummary
                    ? i.description
                    : t('Sem descrição cadastrada. Use Editar para explicar o que este MCP oferece e quando usá-lo.')}
                </p>
              ) : i.description ? (
                <p className="item-hint" title={i.description}>
                  {i.description}
                </p>
              ) : null}
              {i.path && (
                <button
                  type="button"
                  className="path-link"
                  title={t('Abre o arquivo no board, para ler e editar')}
                  onClick={() => useBoardStore.getState().openHarnessFile(i.path)}
                >
                  {i.boardArtifactId ? i.path || i.location : i.location}
                </button>
              )}
              {i.boardArtifactId && (
                <p className="muted small">
                  {state.harness.library?.artifacts.find((a) => a.id === i.boardArtifactId)?.origin
                    ? t('Origem: {path}', { path: i.location })
                    : t('Adicionada na pasta da biblioteca')}
                </p>
              )}
              {!!state.harness.library?.artifacts.find((a) => a.id === i.boardArtifactId)?.skipped.length && (
                <p className="muted small" role="status">
                  {t('{n} arquivo(s) não copiado(s); consulte os limites da biblioteca.', {
                    n: state.harness.library!.artifacts.find((a) => a.id === i.boardArtifactId)!.skipped.length,
                  })}
                </p>
              )}
            </div>
            <div className="row-actions">
              {i.boardArtifactId && (
                <ActionButton
                  variant="soft"
                  size="1"
                  hint={t('Edita o conteúdo e as configurações deste artefato.')}
                  onClick={() => void harness.readLibraryArtifact(i.boardArtifactId!)}
                >
                  {t('Editar')}
                </ActionButton>
              )}
              {modes.length > 1 ? (
                <UsageSelect item={i} allowNone={false} />
              ) : (
                <Badge color="gray" variant="outline" title={t('Os cards e as fases podem escolher este agente.')}>
                  {t('Disponível no board')}
                </Badge>
              )}
              {kind === 'instructions' &&
                i.boardArtifactId &&
                state.harness.library?.artifacts.find((a) => a.id === i.boardArtifactId)?.origin && (
                  <ActionButton
                    variant="ghost"
                    size="1"
                    hint={t('Substitui a cópia do board pelo conteúdo atual da origem.')}
                    onClick={() =>
                      useBoardStore.getState().ask({
                        title: t('Atualizar "{name}" da origem?', { name: i.name }),
                        message: t('A cópia atual do board será substituída. A origem não será alterada.'),
                        confirmLabel: t('Atualizar da origem'),
                        onConfirm: () => harness.updateLibraryArtifact(i.boardArtifactId!),
                      })
                    }
                  >
                    {t('Atualizar da origem')}
                  </ActionButton>
                )}
              <ActionButton
                variant="ghost"
                size="1"
                hint={t('Exclui a cópia da biblioteca; o arquivo de origem será preservado.')}
                onClick={() =>
                  central
                    ? useBoardStore.getState().ask({
                        title: t('Excluir "{name}" da biblioteca?', { name: i.name }),
                        message: t('A cópia do board será excluída. A origem será preservada.'),
                        confirmLabel: t('Excluir'),
                        onConfirm: () => remove(selectionKey(i)),
                      })
                    : remove(selectionKey(i))
                }
                aria-label={t('Excluir: {name}', { name: i.name })}
              >
                {t('Excluir')}
              </ActionButton>
            </div>
          </li>
        ))}
        {missing.map((x) => (
          <li key={`${x.kind}:${x.location}:missing`} className="item-row">
            <span className="item-check" />
            <div className="item-main">
              <div className="item-title">
                <code>{x.location}</code>
                <Badge
                  color="amber"
                  variant="soft"
                  title={t('O arquivo de origem não existe mais; os cards que o listam continuam intactos.')}
                >
                  {t('ausente')}
                </Badge>
              </div>
            </div>
            <div className="row-actions">
              <Button variant="ghost" size="1" onClick={() => remove(x.location)} aria-label={t('Excluir: {name}', { name: x.location })}>
                {t('Excluir')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
