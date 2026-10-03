import { SKILL_MODES, type AiTool, type HarnessItem, type SkillMode } from '../../../../shared/harness';
import { hookTargets, mcpTargets } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { Badge, Button } from '@radix-ui/themes';
import { DeleteButton, SelectField } from '../../ui';
import { SkillFiles } from './SkillFiles';
import { withGlobalWarning } from './text';
import type { ItemActions } from './useItemActions';

const MODES = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

interface Props {
  tool: AiTool;
  item: HarnessItem;
  actions: ItemActions;
  /** arquivos de apoio da skill à mostra, numa linha logo abaixo */
  filesOpen: boolean;
  onToggleFiles: () => void;
}

/** Um item do inventário: nome, descrição, onde está e o que dá para fazer com ele. */
export function ItemRow({ tool, item: i, actions, filesOpen, onToggleFiles }: Props) {
  const { copyable, twin, copy, setMode } = actions;
  const inProject = i.scope !== 'project' ? twin(i, 'project') : undefined;
  const editable = i.scope !== 'plugin' && i.layout !== 'entry';
  return (
    <>
      <tr>
        <td>
          {i.name}
          {i.plugin && (
            <Badge color="gray" variant="outline">
              {i.plugin}
            </Badge>
          )}
          {inProject && (
            <Badge color="indigo" variant="soft" title={inProject.location}>
              {inProject.digest === i.digest ? 'copiada no projeto' : 'no projeto, com conteúdo diferente'}
            </Badge>
          )}
        </td>
        <td className="muted small">{i.description || '—'}</td>
        <td className="muted small">
          <code>{i.location}</code>
        </td>
        <td className="actions">
          <div className="row-actions">
            {i.mode &&
              (editable ? (
                <SelectField<SkillMode>
                  size="1"
                  aria-label={`Modo da skill ${i.name}`}
                  options={MODES}
                  value={i.mode}
                  onChange={(mode) => setMode([i], mode)}
                />
              ) : (
                <Badge
                  color="gray"
                  variant="outline"
                  title="Skill de plugin: o modo não pode ser alterado aqui. Para mudar, copie a skill para o projeto."
                >
                  {SKILL_MODES.find((m) => m.id === i.mode)!.label}
                </Badge>
              ))}
            {i.layout === 'skills' && (
              <Button
                variant={filesOpen ? 'soft' : 'ghost'}
                size="1"
                aria-pressed={filesOpen}
                title="Referências, modelos e scripts da pasta da skill"
                onClick={onToggleFiles}
              >
                Arquivos ({i.files?.length ?? 0})
              </Button>
            )}
            <Button
              variant="ghost"
              size="1"
              title={editable ? 'Abre o arquivo no editor, onde ele pode ser alterado' : 'Abre o arquivo no editor'}
              onClick={() => harness.openItem(i.path)}
            >
              Abrir
            </Button>
            {copyable(i, 'project') && !inProject && (
              <Button variant="ghost" size="1" title="Cria uma cópia independente na pasta do projeto" onClick={() => copy([i], 'project')}>
                Copiar para o projeto
              </Button>
            )}
            {copyable(i, 'user') && !twin(i, 'user') && (
              <Button
                variant="ghost"
                size="1"
                title="Cria uma cópia na sua pasta de usuário, que vale em todos os projetos"
                onClick={() => copy([i], 'user')}
              >
                Copiar para o global
              </Button>
            )}
            {editable && i.kind !== 'settings' && (
              <DeleteButton
                title="Apagar"
                question={`Apagar "${i.name}"?`}
                message={withGlobalWarning(
                  `${i.layout === 'skills' ? 'A pasta da skill é removida, com todos os arquivos dela' : 'O arquivo é removido'}: ${i.location}`,
                  i.scope,
                )}
                onConfirm={() => harness.deleteItem(tool, i.kind, i.path)}
              />
            )}
            {i.kind === 'hook' && i.scope !== 'plugin' && hookTargets(tool).length > 0 && i.path.endsWith('.json') && (
              <DeleteButton
                title="Remover o hook deste arquivo"
                question={`Remover o hook de "${i.name}"?`}
                message={`${i.detail ?? ''}\n\nA entrada sai de ${i.location}.`}
                confirmLabel="Remover"
                onConfirm={() => harness.removeHook(tool, i.path, i.name, i.detail ?? '')}
              />
            )}
            {i.kind === 'settings' && i.layout === 'entry' && i.scope !== 'plugin' && (
              <DeleteButton
                title="Remover a regra deste arquivo"
                question="Remover a regra de permissão?"
                message={`${i.description}: ${i.name}\n\nA regra sai de ${i.location}.`}
                confirmLabel="Remover"
                onConfirm={() => harness.removePermission(tool, i.path, i.detail ?? '', i.name)}
              />
            )}
            {i.kind === 'mcp' && i.scope !== 'plugin' && mcpTargets(tool).some((t) => t.label === i.location) && (
              <DeleteButton
                title="Remover o servidor deste arquivo"
                question={`Remover o servidor "${i.name}"?`}
                message={withGlobalWarning(`A entrada sai de ${i.location}.`, i.scope)}
                confirmLabel="Remover"
                onConfirm={() => harness.removeMcp(tool, i.path, i.name)}
              />
            )}
          </div>
        </td>
      </tr>
      {filesOpen && i.layout === 'skills' && (
        <tr>
          <td colSpan={4}>
            <SkillFiles tool={tool} skill={i} editable={editable} />
          </td>
        </tr>
      )}
    </>
  );
}
