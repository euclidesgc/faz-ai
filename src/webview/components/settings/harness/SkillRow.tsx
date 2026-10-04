import { Button } from '@radix-ui/themes';
import { SKILL_MODES, type Skill, type SkillMode } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { DeleteButton, SelectField, SwitchField } from '../../ui';
import { SettingsCard } from '../SettingsCard';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';
import { t } from '../../../i18n';

// SKILL_MODES usa `id`; o seletor espera `value`
const SKILL_MODE_OPTIONS = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

/** Uma skill do projeto: ligar/desligar, modo, editar o SKILL.md e apagar. */
export function SkillRow({ skill: k, edit, onMode }: { skill: Skill; edit: ProjectEditing; onMode: (mode: SkillMode) => void }) {
  return (
    <SettingsCard
      title={k.name}
      badge={{ text: k.enabled ? t('Ligada') : t('Desligada'), on: k.enabled }}
      off={!k.enabled}
      actions={
        <>
          <SwitchField
            title={k.enabled ? t('Desligar: tira a skill do contexto das ferramentas de IA') : t('Ligar a skill')}
            checked={k.enabled}
            onChange={(on) => harness.setSkillEnabled(k.name, on)}
          />
          {k.enabled && (
            <SelectField
              aria-label={t('Modo da skill {name}', { name: k.name })}
              options={SKILL_MODE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              value={k.mode}
              onChange={onMode}
            />
          )}
          <Button variant="soft" color="gray" onClick={() => edit.toggle('skill', k.name)}>
            {edit.isEditing('skill', k.name) ? t('Fechar edição') : t('Editar')}
          </Button>
          <DeleteButton
            title={t('Apagar a skill')}
            question={t('Apagar a skill "{name}"?', { name: k.name })}
            message={t('A pasta da skill é removida do projeto, com todos os arquivos dela.')}
            onConfirm={() => harness.deleteSkill(k.name)}
          />
        </>
      }
    >
      <div className="muted small">{k.description || t('Sem descrição no frontmatter.')}</div>
      <div className="muted small">
        <code>{k.path}</code>
      </div>
      {edit.isEditing('skill', k.name) && (
        <FileEditor saved={k.content} onSave={(content) => harness.writeSkill(k.name, content)} onClose={edit.close} />
      )}
    </SettingsCard>
  );
}
