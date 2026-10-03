import { SKILL_MODES, type AiTool, type HarnessItem, type SkillMode } from '../../../../shared/harness';
import { hookTargets, mcpTargets } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { Badge, Button, Checkbox, IconButton } from '@radix-ui/themes';
import { DeleteButton, IconTrash, SelectField } from '../../ui';
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
  selected: boolean;
  onSelect: (checked: boolean) => void;
  /** arquivos de apoio da skill à mostra, numa linha logo abaixo */
  filesOpen: boolean;
  onToggleFiles: () => void;
}

/** Um item do inventário: seleção, nome, descrição como dica, o caminho do arquivo (que abre no editor) e o que dá para fazer com ele. */
export function ItemRow({ tool, item: i, actions, selected, onSelect, filesOpen, onToggleFiles }: Props) {
  const { copyable, twin, copy, setMode, deletable, remove } = actions;
  const inProject = i.scope !== 'project' ? twin(i, 'project') : undefined;
  const editable = i.scope !== 'plugin' && i.layout !== 'entry';
  const selectable = deletable(i) || copyable(i, 'project') || copyable(i, 'user') || (!!i.mode && editable);
  return (
    <li className={selected ? 'item-row selected' : 'item-row'}>
      <span className="item-check">
        {selectable && (
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
          {inProject && (
            <Badge color="indigo" variant="soft" title={inProject.location}>
              {inProject.digest === i.digest ? t('copiada no projeto') : t('no projeto, com conteúdo diferente')}
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
          title={editable ? t('Abre o arquivo no editor, onde ele pode ser alterado') : t('Abre o arquivo no editor')}
          onClick={() => harness.openItem(i.path)}
        >
          {i.location}
        </button>
      </div>
      <div className="row-actions">
        {i.mode &&
          (editable ? (
            <SelectField<SkillMode>
              size="1"
              aria-label={t('Modo da skill {name}', { name: i.name })}
              options={MODES.map((m) => ({ ...m, label: t(m.label) }))}
              value={i.mode}
              onChange={(mode) => setMode([i], mode)}
            />
          ) : (
            <Badge
              color="gray"
              variant="outline"
              title={t('Skill de plugin: o modo não pode ser alterado aqui. Para mudar, copie a skill para o projeto.')}
            >
              {t(SKILL_MODES.find((m) => m.id === i.mode)!.label)}
            </Badge>
          ))}
        {i.layout === 'skills' && (
          <Button
            variant={filesOpen ? 'soft' : 'ghost'}
            size="1"
            aria-pressed={filesOpen}
            title={t('Referências, modelos e scripts da pasta da skill')}
            onClick={onToggleFiles}
          >
            {t('Arquivos ({n})', { n: i.files?.length ?? 0 })}
          </Button>
        )}
        {copyable(i, 'project') && !inProject && (
          <Button
            variant="ghost"
            size="1"
            title={t('Cria uma cópia independente na pasta do projeto')}
            onClick={() => copy([i], 'project')}
          >
            {t('Copiar para o projeto')}
          </Button>
        )}
        {copyable(i, 'user') && !twin(i, 'user') && (
          <Button
            variant="ghost"
            size="1"
            title={t('Cria uma cópia na sua pasta de usuário, que vale em todos os projetos')}
            onClick={() => copy([i], 'user')}
          >
            {t('Copiar para o global')}
          </Button>
        )}
        {deletable(i) && (
          <IconButton variant="ghost" color="red" size="1" title={t('Apagar')} aria-label={t('Apagar')} onClick={() => remove([i])}>
            <IconTrash />
          </IconButton>
        )}
        {i.kind === 'hook' && i.scope !== 'plugin' && hookTargets(tool).length > 0 && i.path.endsWith('.json') && (
          <DeleteButton
            title={t('Remover o hook deste arquivo')}
            question={t('Remover o hook de "{name}"?', { name: i.name })}
            message={t('{detail}\n\nA entrada sai de {location}.', { detail: i.detail ?? '', location: i.location })}
            confirmLabel={t('Remover')}
            onConfirm={() => harness.removeHook(tool, i.path, i.name, i.detail ?? '')}
          />
        )}
        {i.kind === 'settings' && i.layout === 'entry' && i.scope !== 'plugin' && (
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
        {i.kind === 'mcp' && i.scope !== 'plugin' && mcpTargets(tool).some((t) => t.label === i.location) && (
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
