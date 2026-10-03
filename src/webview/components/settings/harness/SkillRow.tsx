import { Button } from '@radix-ui/themes';
import { SKILL_MODES, type Skill, type SkillMode } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { DeleteButton, SelectField, SwitchField } from '../../ui';
import { SettingsCard } from '../SettingsCard';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';

// SKILL_MODES usa `id`; o seletor espera `value`
const SKILL_MODE_OPTIONS = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

/** Uma skill do projeto: ligar/desligar, modo, editar o SKILL.md e apagar. */
export function SkillRow({ skill: k, edit, onMode }: { skill: Skill; edit: ProjectEditing; onMode: (mode: SkillMode) => void }) {
  return (
    <SettingsCard
      title={k.name}
      badge={{ text: k.enabled ? 'Ligada' : 'Desligada', on: k.enabled }}
      off={!k.enabled}
      actions={
        <>
          <SwitchField
            title={k.enabled ? 'Desligar: tira a skill do contexto das ferramentas de IA' : 'Ligar a skill'}
            checked={k.enabled}
            onChange={(on) => harness.setSkillEnabled(k.name, on)}
          />
          {k.enabled && (
            <SelectField aria-label={`Modo da skill ${k.name}`} options={SKILL_MODE_OPTIONS} value={k.mode} onChange={onMode} />
          )}
          <Button variant="soft" color="gray" onClick={() => edit.toggle('skill', k.name)}>
            {edit.isEditing('skill', k.name) ? 'Fechar' : 'Editar'}
          </Button>
          <DeleteButton
            title="Apagar a skill"
            question={`Apagar a skill "${k.name}"?`}
            message="A pasta da skill é removida do projeto, com todos os arquivos dela."
            onConfirm={() => harness.deleteSkill(k.name)}
          />
        </>
      }
    >
      <div className="muted small">{k.description || 'Sem descrição no frontmatter.'}</div>
      <div className="muted small">
        <code>{k.path}</code>
      </div>
      {edit.isEditing('skill', k.name) && (
        <FileEditor saved={k.content} onSave={(content) => harness.writeSkill(k.name, content)} onClose={edit.close} />
      )}
    </SettingsCard>
  );
}
