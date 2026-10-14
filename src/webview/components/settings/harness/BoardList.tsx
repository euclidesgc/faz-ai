import { Badge, Button, Callout } from '@radix-ui/themes';
import { HARNESS_SCOPES, type HarnessItem } from '../../../../shared/harness';
import { missingSelections, selectedItems, selectionKey, usageOptions, type SelectableKind } from '../../../../shared/harnessSelection';
import { matchesQuery } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconWarning } from '../../ui';
import { UsageSelect } from './UsageSelect';
import { t } from '../../../i18n';

/** O que a pessoa lê como origem do artefato: Projeto, Global, Importados ou de plugin. */
const originLabel = (item: HarnessItem): string => t(HARNESS_SCOPES.find((x) => x.id === item.scope)?.label ?? item.scope);

/**
 * A origem Board de um assunto: o que a pessoa enviou ao board, com o modo de cada um (o que decide se
 * entra nas execuções), de onde vem e como tirar. Uma origem que sumiu aparece como ausente na mesma
 * lista, sem quebrar os cards que a listam.
 */
export function BoardList({ kind, query }: { kind: SelectableKind; query: string }) {
  const state = useBoardStore((s) => s.state)!;
  const items = selectedItems(state, kind).filter((i) => matchesQuery(query, i.name, i.description));
  const missing = missingSelections(state).filter((x) => x.kind === kind && matchesQuery(query, x.location));
  const remove = (location: string) => harness.setSelection([{ kind, location }], null);
  const modes = usageOptions(kind);
  const total = selectedItems(state, kind).length + missingSelections(state).filter((x) => x.kind === kind).length;

  return (
    <div className="board-list">
      {kind === 'instructions' && (
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
      {total === 0 && (
        <p className="muted small scope-empty">
          {t('Nada neste assunto foi enviado ao board. Escolha, em Projeto, Global ou Importados, o que os cards podem usar.')}
        </p>
      )}
      {total > 0 && items.length + missing.length === 0 && <p className="muted small scope-empty">{t('Nada encontrado para a busca.')}</p>}
      <ul className="item-list">
        {items.map((i) => (
          <li key={`${i.kind}:${selectionKey(i)}`} className="item-row">
            <span className="item-check" />
            <div className="item-main">
              <div className="item-title">
                <span className="item-name">{i.name}</span>
                <Badge color="gray" variant="soft" title={i.plugin}>
                  {originLabel(i)}
                </Badge>
                {i.plugin && (
                  <Badge color="gray" variant="outline">
                    {i.plugin}
                  </Badge>
                )}
              </div>
              {i.description && (
                <p className="item-hint" title={i.description}>
                  {i.description}
                </p>
              )}
              <button
                type="button"
                className="path-link"
                title={t('Abre o arquivo no board, para ler e editar')}
                onClick={() => useBoardStore.getState().openHarnessFile(i.path)}
              >
                {i.location}
              </button>
            </div>
            <div className="row-actions">
              {modes.length > 1 ? (
                <UsageSelect item={i} allowNone={false} />
              ) : (
                <Badge color="gray" variant="outline" title={t('Os cards e as fases podem escolher este agente.')}>
                  {t('Disponível no board')}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="1"
                onClick={() => remove(selectionKey(i))}
                aria-label={t('Remover do board: {name}', { name: i.name })}
              >
                {t('Remover do board')}
              </Button>
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
              <Button
                variant="ghost"
                size="1"
                onClick={() => remove(x.location)}
                aria-label={t('Remover do board: {name}', { name: x.location })}
              >
                {t('Remover do board')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
