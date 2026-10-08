import { useState } from 'react';
import { Badge, Button, Checkbox, IconButton } from '@radix-ui/themes';
import { REFERENCE_SKILL, SKILL_MODES, type HarnessItem, type InstallScope, type SkillMode } from '../../../../shared/harness';
import { createTargets } from '../../../../shared/harnessCatalog';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import {
  HARNESS_USAGES,
  missingSelections,
  toolItemsOf,
  usageOf,
  type HarnessUsage,
  type SelectableKind,
} from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconTrash, SelectField } from '../../ui';
import { BoardInstall } from './BoardInstall';
import { FileEditor } from './FileEditor';
import { InstallSkills } from './InstallSkills';
import { NewItem } from './NewItem';
import { useItemActions } from './useItemActions';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

const MODES = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

interface Props {
  tool: AiToolInfo;
  scope: InstallScope;
  kind: Exclude<SelectableKind, 'agent'>;
}

/** Em que escopo da tela uma marcação sem arquivo seria listada. */
const scopeOfLocation = (location: string): InstallScope => (location.startsWith('~/') || location.startsWith('/') ? 'user' : 'project');

/**
 * Rules ou skills de um escopo, com as duas marcações do board em cada linha: incluir em todo contexto
 * ou usar quando fizer sentido (uma exclui a outra). O que não está marcado é invisível para as execuções.
 */
export function SelectionTable({ tool, scope, kind }: Props) {
  const state = useBoardStore((s) => s.state)!;
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const all = toolItemsOf(state);
  // a aba Global junta a pasta do usuário e os plugins: os dois valem na máquina inteira
  const items = all.filter((i) => i.kind === kind && (scope === 'project' ? i.scope === 'project' : i.scope !== 'project'));
  const missing = missingSelections(state).filter((x) => x.kind === kind && scopeOfLocation(x.location) === scope);
  const actions = useItemActions(tool.id, all);
  const places = createTargets(tool.id).filter(
    (x) => x.kind === kind && x.scope === scope && !(x.layout === 'file' && items.some((i) => i.location === x.label)),
  );
  const mark = (i: Pick<HarnessItem, 'kind' | 'location'>, usage: HarnessUsage, on: boolean) =>
    harness.setSelection([{ kind, location: i.location }], on ? usage : null);
  const marked = (usage: HarnessUsage) => items.filter((i) => usageOf(state.harnessSelection, i) === usage).length;

  /** conteúdo editável na página: só os arquivos do projeto que o board lê inteiros (regras da raiz e SKILL.md) */
  const editable = (i: HarnessItem): { content: string; save: (content: string) => void } | null => {
    if (i.scope !== 'project') return null;
    const rule = state.harness.rules.find((r) => r.name === i.location && r.exists);
    if (rule) return { content: rule.content, save: (content) => harness.writeRule(rule.name, content) };
    const skill = state.harness.skills.find((k) => k.path === i.location);
    if (skill) return { content: skill.content, save: (content) => harness.writeSkill(skill.name, content) };
    return null;
  };

  return (
    <div className="selection-table">
      <p className="muted small">
        {kind === 'instructions'
          ? rich(
              '<b>Incluir em todo contexto</b>: o arquivo entra em toda execução do board, pelo caminho. <b>Usar quando fizer sentido</b>: vira opção do campo Rules dos cards, e o "Refinar com IA" o indica quando o pedido pede. Sem marcação, a execução não o vê, mesmo que a ferramenta o carregue numa conversa sua.',
            )
          : rich(
              '<b>Incluir em todo contexto</b>: a skill entra em toda execução do board, pelo caminho. <b>Usar quando fizer sentido</b>: vira opção do campo Skills dos cards e dos agentes, e o "Refinar com IA" a indica quando o pedido pede. Sem marcação, a execução não a vê.',
            )}{' '}
        <span className="selection-count">
          {t('{always} em todo contexto · {contextual} quando fizer sentido · {total} no total.', {
            always: marked('always'),
            contextual: marked('contextual'),
            total: items.length,
          })}
        </span>
      </p>
      <div className="row selection-actions">
        {places.length > 0 && (
          <Button variant="soft" color="gray" onClick={() => setCreating(!creating)}>
            {kind === 'instructions' ? t('Nova rule') : t('Nova skill')}
          </Button>
        )}
        {kind === 'skill' && (
          <Button variant="soft" color="gray" onClick={() => setInstalling(!installing)}>
            {t('Buscar skills para instalar')}
          </Button>
        )}
        {kind === 'skill' &&
          scope === 'project' &&
          !all.some((i) => i.kind === 'skill' && i.scope === 'project' && i.name === REFERENCE_SKILL.name) && (
            <Button
              variant="ghost"
              size="1"
              title={t('Skill de modelos de classe e exemplos de código, só quando indicada')}
              onClick={() => harness.createReferenceSkill()}
            >
              {t('Criar skill de modelos')}
            </Button>
          )}
      </div>
      {creating && places.length > 0 && (
        <NewItem key={tool.id} tool={tool.id} kind={kind} targets={places} onClose={() => setCreating(false)} />
      )}
      {kind === 'skill' && (installing || state.harnessInstall) && <InstallSkills key={tool.id} tool={tool.id} />}
      {kind === 'skill' && <BoardInstall key={tool.id} artifact="skill" tool={tool.id} items={all} />}
      <table className="table">
        <thead>
          <tr>
            {HARNESS_USAGES.map((u) => (
              <th key={u.id} className="narrow" title={t(u.hint)}>
                {t(u.label)}
              </th>
            ))}
            <th>{t('Nome')}</th>
            <th>{t('Descrição')}</th>
            <th>{t('Arquivo')}</th>
            <th className="narrow"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const usage = usageOf(state.harnessSelection, i);
            const edit = editable(i);
            const open = editing === i.location;
            return [
              <tr key={i.location} className={usage ? '' : 'off'}>
                {HARNESS_USAGES.map((u) => (
                  <td key={u.id} className="narrow">
                    <Checkbox
                      aria-label={t('{usage}: {name}', { usage: t(u.label), name: i.name })}
                      checked={usage === u.id}
                      onCheckedChange={(v) => mark(i, u.id, v === true)}
                    />
                  </td>
                ))}
                <td>
                  <span className="item-name">{i.name}</span>{' '}
                  {i.plugin && (
                    <Badge color="gray" variant="outline">
                      {i.plugin}
                    </Badge>
                  )}
                </td>
                <td className="item-hint" title={i.description}>
                  {i.description}
                </td>
                <td>
                  <button
                    type="button"
                    className="path-link"
                    title={t('Abre o arquivo no editor')}
                    onClick={() => harness.openItem(i.path)}
                  >
                    {i.location}
                  </button>
                </td>
                <td className="narrow">
                  <div className="row-actions">
                    {i.mode && i.scope !== 'plugin' && (
                      <SelectField<SkillMode>
                        size="1"
                        aria-label={t('Modo da skill {name}', { name: i.name })}
                        options={MODES.map((m) => ({ ...m, label: t(m.label) }))}
                        value={i.mode}
                        onChange={(mode) => actions.setMode([i], mode)}
                      />
                    )}
                    {edit && (
                      <Button variant="ghost" size="1" onClick={() => setEditing(open ? null : i.location)}>
                        {open ? t('Fechar edição') : t('Editar')}
                      </Button>
                    )}
                    {actions.deletable(i) && (
                      <IconButton
                        variant="ghost"
                        color="red"
                        size="1"
                        title={t('Apagar')}
                        aria-label={t('Apagar {name}', { name: i.name })}
                        onClick={() => actions.remove([i])}
                      >
                        <IconTrash />
                      </IconButton>
                    )}
                  </div>
                </td>
              </tr>,
              open && edit ? (
                <tr key={`${i.location}:edit`}>
                  <td colSpan={6}>
                    <FileEditor saved={edit.content} onSave={edit.save} onClose={() => setEditing(null)} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
          {missing.map((x) => (
            <tr key={`missing:${x.location}`} className="off">
              {HARNESS_USAGES.map((u) => (
                <td key={u.id} className="narrow">
                  <Checkbox
                    aria-label={t('{usage}: {name}', { usage: t(u.label), name: x.location })}
                    checked={x.usage === u.id}
                    onCheckedChange={(v) => mark({ kind, location: x.location }, u.id, v === true)}
                  />
                </td>
              ))}
              <td colSpan={2}>
                <Badge color="orange" variant="soft">
                  {t('não encontrada')}
                </Badge>{' '}
                <span className="muted small">{t('O arquivo marcado não está mais no disco; desmarque ou recrie.')}</span>
              </td>
              <td>{x.location}</td>
              <td className="narrow"></td>
            </tr>
          ))}
          {items.length === 0 && missing.length === 0 && (
            <tr>
              <td colSpan={6} className="muted small">
                {kind === 'instructions'
                  ? t('Nenhum arquivo de instruções do {tool} neste escopo.', { tool: tool.label })
                  : t('Nenhuma skill do {tool} neste escopo.', { tool: tool.label })}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
