import type { ReactNode } from 'react';
import { SKILL_MODES, type AiTool, type HarnessItem, type SkillMode } from '../../../../shared/harness';
import { HARNESS_CATALOG } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Badge, Checkbox } from '@radix-ui/themes';
import { ActionIconButton, ActionButton, DeleteButton, IconTrash, SelectField } from '../../ui';
import { SkillFiles } from './SkillFiles';
import { withGlobalWarning } from './text';
import type { ItemActions } from './useItemActions';
import { t } from '../../../i18n';

// os rótulos ficam em português e são traduzidos onde a lista é usada
const MODES = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

interface Props {
  tool: AiTool;
  item: HarnessItem;
  actions: ItemActions;
  /** caixa de seleção para as ações em massa; sem `onSelect`, a linha não tem caixa */
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  /** mostra o que o item é, numa frase, conforme o catálogo, e quando a ferramenta o carrega */
  explain?: boolean;
  /** por que a ferramenta não lê o arquivo, embora ele exista; troca o selo de carregamento por um aviso */
  unread?: string;
  /** controle extra antes das ações, como o uso do item nas execuções do board */
  usage?: ReactNode;
  /** por que "Indicar artefatos" apontou este item; aparece como selo */
  suggestion?: string;
  /** arquivos de apoio da skill à mostra, numa linha logo abaixo */
  filesOpen: boolean;
  onToggleFiles: () => void;
}

/** Um item do inventário: seleção, nome, descrição como dica, o caminho do arquivo (que abre no editor) e o que dá para fazer com ele. */
export function ItemRow({
  tool,
  item: i,
  actions,
  selected = false,
  onSelect,
  explain,
  unread,
  usage,
  suggestion,
  filesOpen,
  onToggleFiles,
}: Props) {
  const { copyable, twin, copy, setMode, deletable, remove, entryRemovable } = actions;
  const src = i.source === undefined ? undefined : HARNESS_CATALOG[tool][i.source];
  const inProject = i.scope !== 'project' ? twin(i, 'project') : undefined;
  // o modo nativo da skill (automática ou só quando indicada) não vale no board, e numa pasta importada ele é de quem a mantém
  const editable = i.scope !== 'plugin' && i.scope !== 'imported' && i.layout !== 'entry';
  return (
    <li className={selected ? 'item-row selected' : 'item-row'}>
      <span className="item-check">
        {onSelect && (
          <Checkbox
            aria-label={t('Selecionar {name}', { name: i.name })}
            checked={selected}
            onCheckedChange={(v) => onSelect(v === true)}
          />
        )}
      </span>
      <div className="item-main">
        <div className="item-title">
          <span className="item-name">{i.name}</span>
          {i.plugin && (
            <Badge color="gray" variant="outline">
              {i.plugin}
            </Badge>
          )}
          {unread && (
            <Badge color="amber" variant="soft">
              {t('não lido pelo Claude Code')}
            </Badge>
          )}
          {explain && !unread && src?.loads === 'always' && (
            <Badge color="indigo" variant="soft" title={t('Entra no começo de toda conversa da ferramenta')}>
              {t('sempre carregado')}
            </Badge>
          )}
          {explain && !unread && src?.loads === 'on-demand' && (
            <Badge color="gray" variant="soft" title={t('A ferramenta só lê o conteúdo quando a tarefa pede ou quando você chama')}>
              {t('sob demanda')}
            </Badge>
          )}
          {suggestion !== undefined && (
            <Badge color="green" variant="soft" title={suggestion || t('Indicado pela IA')}>
              {t('indicado')}
            </Badge>
          )}
          {inProject && (
            <Badge color="indigo" variant="soft" title={inProject.location}>
              {inProject.digest === i.digest ? t('copiada no projeto') : t('no projeto, com conteúdo diferente')}
            </Badge>
          )}
        </div>
        {explain && src?.hint && <p className="item-explain">{t(src.hint)}</p>}
        {unread && <p className="item-explain item-unread">{unread}</p>}
        {i.description && (
          <p className="item-hint" title={i.description}>
            {i.description}
          </p>
        )}
        {i.imports && i.imports.length > 0 && (
          <div className="item-imports">
            <span className="muted small">{t('Importa com @, e entram junto:')}</span>
            {i.imports.map((x) => (
              <button
                key={x.path}
                type="button"
                className="path-link"
                style={{ marginLeft: `calc(var(--sp-12) * ${x.depth - 1})` }}
                title={t('Abre o arquivo importado no board')}
                onClick={() => useBoardStore.getState().openHarnessFile(x.path)}
              >
                {x.location}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="path-link"
          title={editable ? t('Abre o arquivo no board, para ler e editar') : t('Abre o arquivo no board, só para leitura')}
          onClick={() => useBoardStore.getState().openHarnessFile(i.path)}
        >
          {i.location}
        </button>
      </div>
      <div className="row-actions">
        {usage}
        {i.mode &&
          (editable ? (
            <SelectField<SkillMode>
              size="1"
              steady
              aria-label={t('Modo da skill {name}', { name: i.name })}
              options={MODES.map((m) => ({ ...m, label: t(m.label) }))}
              value={i.mode}
              onChange={(mode) => setMode([i], mode)}
            />
          ) : (
            <Badge
              color="gray"
              variant="outline"
              title={
                i.scope === 'imported'
                  ? t('Skill importada: o modo nativo é de quem mantém a pasta, e no board o que vale é o modo do artefato.')
                  : t('Skill de plugin: o modo não pode ser alterado aqui. Para mudar, copie a skill para o projeto.')
              }
            >
              {t(SKILL_MODES.find((m) => m.id === i.mode)!.label)}
            </Badge>
          ))}
        {i.layout === 'skills' && (
          <ActionButton
            variant={filesOpen ? 'soft' : 'ghost'}
            size="1"
            aria-pressed={filesOpen}
            hint={t('Mostra as referências, os modelos e os scripts da pasta da skill.')}
            onClick={onToggleFiles}
          >
            {t('Arquivos ({n})', { n: i.files?.length ?? 0 })}
          </ActionButton>
        )}
        {copyable(i, 'project') && !inProject && (
          <ActionButton
            variant="ghost"
            size="1"
            hint={t('Cria uma cópia independente na pasta do projeto')}
            onClick={() => copy([i], 'project')}
          >
            {t('Copiar para o projeto')}
          </ActionButton>
        )}
        {copyable(i, 'user') && !twin(i, 'user') && (
          <ActionButton
            variant="ghost"
            size="1"
            hint={t('Cria uma cópia na sua pasta de usuário, que vale em todos os projetos')}
            onClick={() => copy([i], 'user')}
          >
            {t('Copiar para o global')}
          </ActionButton>
        )}
        {deletable(i) && (
          <ActionIconButton
            variant="ghost"
            color="red"
            size="1"
            hint={t('Pede confirmação e apaga o arquivo (ou a pasta da skill) do disco.')}
            aria-label={t('Apagar')}
            onClick={() => remove([i])}
          >
            <IconTrash />
          </ActionIconButton>
        )}
        {i.kind === 'hook' && entryRemovable(i) && (
          <DeleteButton
            title={t('Remover o hook deste arquivo')}
            question={t('Remover o hook de "{name}"?', { name: i.name })}
            message={t('{detail}\n\nA entrada sai de {location}.', { detail: i.detail ?? '', location: i.location })}
            confirmLabel={t('Remover')}
            onConfirm={() => harness.removeHook(tool, i.path, i.name, i.detail ?? '')}
          />
        )}
        {i.kind === 'settings' && entryRemovable(i) && (
          <DeleteButton
            title={t('Remover a regra deste arquivo')}
            question={t('Remover a regra de permissão?')}
            message={t('{description}: {name}\n\nA regra sai de {location}.', {
              description: i.description,
              name: i.name,
              location: i.location,
            })}
            confirmLabel={t('Remover')}
            onConfirm={() => harness.removePermission(tool, i.path, i.detail ?? '', i.name)}
          />
        )}
        {i.kind === 'mcp' && entryRemovable(i) && (
          <DeleteButton
            title={t('Remover o servidor deste arquivo')}
            question={t('Remover o servidor "{name}"?', { name: i.name })}
            message={withGlobalWarning(t('A entrada sai de {location}.', { location: i.location }), i.scope)}
            confirmLabel={t('Remover')}
            onConfirm={() => harness.removeMcp(tool, i.path, i.name)}
          />
        )}
      </div>
      {filesOpen && i.layout === 'skills' && (
        <div className="item-files">
          <SkillFiles tool={tool} skill={i} editable={editable} />
        </div>
      )}
    </li>
  );
}
