import { SKILL_MODES, type Skill, type SkillMode } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { Button, DeleteButton, EnumSelect } from '../../ui';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';

// SKILL_MODES usa `id`; o seletor espera `value`
const SKILL_MODE_OPTIONS = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

/** Uma skill do projeto: ligar/desligar, modo, editar o SKILL.md e apagar. */
export function SkillRow({ skill: k, edit, onMode }: { skill: Skill; edit: ProjectEditing; onMode: (mode: SkillMode) => void }) {
  return (
    <section className={`settings-block ${k.enabled ? '' : 'rule off'}`}>
      <div className="row">
        <label className="switch" title={k.enabled ? 'Desligar: tira a skill do contexto das ferramentas de IA' : 'Ligar a skill'}>
          <input type="checkbox" checked={k.enabled} onChange={(e) => harness.setSkillEnabled(k.name, e.target.checked)} />
        </label>
        <h3 className="plain">{k.name}</h3>
        <span className={`pill ${k.enabled ? '' : 'off'}`}>{k.enabled ? 'Ligada' : 'Desligada'}</span>
        <span className="spacer" />
        {k.enabled && (
          <EnumSelect
            options={SKILL_MODE_OPTIONS}
            title={SKILL_MODES.find((m) => m.id === k.mode)!.hint}
            value={k.mode}
            onChange={onMode}
          />
        )}
        <Button onClick={() => edit.toggle('skill', k.name)}>{edit.isEditing('skill', k.name) ? 'Fechar' : 'Editar'}</Button>
        <DeleteButton
          title="Apagar a skill"
          question={`Apagar a skill "${k.name}"?`}
          message="A pasta da skill é removida do projeto, com todos os arquivos dela."
          onConfirm={() => harness.deleteSkill(k.name)}
        />
      </div>
      <div className="muted small">{k.description || 'Sem descrição no frontmatter.'}</div>
      <div className="muted small">
        <code>{k.path}</code>
      </div>
      {edit.isEditing('skill', k.name) && (
        <FileEditor saved={k.content} onSave={(content) => harness.writeSkill(k.name, content)} onClose={edit.close} />
      )}
    </section>
  );
}
