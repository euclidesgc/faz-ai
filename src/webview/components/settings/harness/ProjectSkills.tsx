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
        title="Skills"
        actions={
          <>
            {!skills.some((k) => k.name === FLOW_SKILL_NAME) && (
              <Button
                variant="soft"
                color="gray"
                title="Cria a skill que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências"
                onClick={() => harness.installFlowSkill()}
              >
                Instalar skill do fluxo
              </Button>
            )}
            <Button onClick={() => edit.toggleNew('newSkill')}>
              <IconPlus /> Nova skill
            </Button>
          </>
        }
      >
        <p>
          Skills do {tool.label} em <code>{tool.skills}</code>. Todas viram opções do campo "Skills" dos cards, e um card que indica uma
          skill entrega à IA o caminho do arquivo. Por isso uma skill não precisa ficar à vista da IA para ser usada:
        </p>
        <ul>
          <li>
            <b>Automática</b>: a IA vê a descrição em toda sessão e decide quando usar.
          </li>
          <li>
            <b>Só quando indicada</b>: a IA não a invoca sozinha; vale quando um card a indica ou quando é chamada pelo nome.
          </li>
          <li>
            <b>Desligada</b>: movida para <code>{tool.skills}-disabled</code>; a ferramenta não a enxerga, mas um card ainda pode indicá-la.
          </li>
        </ul>
        {automatic.length > 1 && (
          <p>
            {automatic.length} skills automáticas no projeto.{' '}
            <Button
              variant="ghost"
              size="1"
              title="A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam"
              onClick={() => setMode(automatic, 'manual')}
            >
              Deixar todas só quando indicadas
            </Button>
          </p>
        )}
      </SectionHeader>

      {edit.editing?.kind === 'newSkill' && (
        <DraftForm
          title="Skill nova"
          draft={draft}
          onChange={edit.patchDraft}
          nameOk={isFreeName(draft.name, skills)}
          namePlaceholder="revisar-spec"
          descriptionLabel="Descrição (quando usar)"
          descriptionPlaceholder="Use ao revisar uma Spec antes de passar para o Plan"
          bodyPlaceholder="Instruções da skill, em markdown"
          submitLabel="Criar skill"
          onSubmit={createSkill}
          onCancel={edit.close}
        />
      )}

      {skills.map((k) => (
        <SkillRow key={k.name} skill={k} edit={edit} onMode={(mode) => setMode([k], mode)} />
      ))}
      {skills.length === 0 && (
        <p className="muted">
          Nenhuma skill em <code>{tool.skills}</code> ainda.
        </p>
      )}
    </>
  );
}
