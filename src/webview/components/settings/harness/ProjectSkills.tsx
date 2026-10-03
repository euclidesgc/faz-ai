import type { Skill, SkillMode } from '../../../../shared/harness';
import { FLOW_SKILL_NAME, automaticSkills, isFreeName, skillInventoryPaths, type AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { harness } from '../../../commands';
import { Button } from '@radix-ui/themes';
import { IconPlus } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { DraftForm } from './DraftForm';
import { SkillRow } from './SkillRow';
import type { ProjectEditing } from './useProjectEditing';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** As skills do projeto na pasta da ferramenta em uso: modos, criação, a skill do fluxo e a lista. */
export function ProjectSkills({ tool, edit }: { tool: AiToolInfo; edit: ProjectEditing }) {
  const skills = useBoardStore((s) => s.state!.harness.skills);
  const inventory = useBoardStore((s) => s.state!.harness.inventory);
  const { draft } = edit;

  const setMode = (list: Skill[], mode: SkillMode) => {
    const paths = skillInventoryPaths(inventory, tool.id, list);
    if (paths.length) harness.setSkillMode(tool.id, paths, mode);
  };
  const automatic = automaticSkills(skills);
  const createSkill = () => {
    harness.createSkill(draft.name, draft.description.trim(), draft.body);
    // o modelo é campo do agente: fica como estava
    edit.patchDraft({ name: '', description: '', body: '' });
    edit.close();
  };

  return (
    <>
      <SectionHeader
        title={t('Skills')}
        actions={
          <>
            {!skills.some((k) => k.name === FLOW_SKILL_NAME) && (
              <Button
                variant="soft"
                color="gray"
                title={t('Cria a skill que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências')}
                onClick={() => harness.installFlowSkill()}
              >
                {t('Instalar skill do fluxo')}
              </Button>
            )}
            <Button onClick={() => edit.toggleNew('newSkill')}>
              <IconPlus /> {t('Nova skill')}
            </Button>
          </>
        }
      >
        <p>
          {rich(
            'Skills do {tool} em <code>{dir}</code>. Todas viram opções do campo "Skills" dos cards, e um card que indica uma skill entrega à IA o caminho do arquivo. Por isso uma skill não precisa ficar à vista da IA para ser usada:',
            { tool: tool.label, dir: tool.skills },
          )}
        </p>
        <ul>
          <li>{rich('<b>Automática</b>: a IA vê a descrição em toda sessão e decide quando usar.')}</li>
          <li>
            {rich('<b>Só quando indicada</b>: a IA não a invoca sozinha; vale quando um card a indica ou quando é chamada pelo nome.')}
          </li>
          <li>
            {rich(
              '<b>Desligada</b>: movida para <code>{dir}-disabled</code>; a ferramenta não a enxerga, mas um card ainda pode indicá-la.',
              { dir: tool.skills },
            )}
          </li>
        </ul>
        {automatic.length > 1 && (
          <p>
            {t('{n} skills automáticas no projeto.', { n: automatic.length })}{' '}
            <Button
              variant="ghost"
              size="1"
              title={t('A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam')}
              onClick={() => setMode(automatic, 'manual')}
            >
              {t('Deixar todas só quando indicadas')}
            </Button>
          </p>
        )}
      </SectionHeader>

      {edit.editing?.kind === 'newSkill' && (
        <DraftForm
          title={t('Skill nova')}
          draft={draft}
          onChange={edit.patchDraft}
          nameOk={isFreeName(draft.name, skills)}
          namePlaceholder="revisar-spec"
          descriptionLabel={t('Descrição (quando usar)')}
          descriptionPlaceholder={t('Use ao revisar uma Spec antes de passar para o Plan')}
          bodyPlaceholder={t('Instruções da skill, em markdown')}
          submitLabel={t('Criar skill')}
          onSubmit={createSkill}
          onCancel={edit.close}
        />
      )}

      {skills.map((k) => (
        <SkillRow key={k.name} skill={k} edit={edit} onMode={(mode) => setMode([k], mode)} />
      ))}
      {skills.length === 0 && <p className="muted">{rich('Nenhuma skill em <code>{dir}</code> ainda.', { dir: tool.skills })}</p>}
    </>
  );
}
