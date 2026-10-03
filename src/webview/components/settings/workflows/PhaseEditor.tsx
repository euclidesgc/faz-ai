import { useState } from 'react';
import type { Column } from '../../../../shared/model';
import { PHASE_DEFAULTS } from '../../../../shared/phaseDefaults';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { MarkdownEditor } from '../../MarkdownEditor';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { FormField, SelectField } from '../../ui';
import { t, dt } from '../../../i18n';

/** O Select do Radix não aceita `value` vazio: "padrão do board" usa este valor. */
const DEFAULT_PROFILE = '__default';

/** A fase de uma coluna: o que a IA faz quando o card entra nela e o documento que a fase produz. */
export function PhaseEditor({ column }: { column: Column }) {
  const [template, setTemplate] = useState(column.artifactTemplate);
  const profiles = useBoardStore((s) => s.state)!.board.execProfiles;
  const patch = (p: { aiInstruction?: string; artifactName?: string; artifactTemplate?: string; execProfile?: string | null }) =>
    settings.updateColumn(column.id, p);
  const defaultProfile = profiles.find((p) => p.isDefault);
  const preset = PHASE_DEFAULTS[column.name];
  const isDefault =
    preset &&
    preset.instruction === column.aiInstruction &&
    preset.artifactName === column.artifactName &&
    preset.artifactTemplate === column.artifactTemplate;

  return (
    <div className="phase-editor">
      <FormField label={t('Instrução para a IA')} hint={t('O que ela faz quando um card entra em "{name}".', { name: column.name })}>
        {(id) => (
          <TextArea
            id={id}
            key={column.aiInstruction}
            rows={5}
            defaultValue={column.aiInstruction}
            placeholder={t('Ex.: escreva o documento de requisitos a partir da conversa do card…')}
            onBlur={(e) => e.target.value !== column.aiInstruction && patch({ aiInstruction: e.target.value })}
          />
        )}
      </FormField>
      <FormField label={t('Documento da fase')} hint={t('Nome do arquivo anexado à história; vazio se a fase não gera documento.')}>
        {(id) => (
          <TextField.Root
            id={id}
            key={column.artifactName}
            defaultValue={column.artifactName}
            placeholder={t('Ex.: PRD.md')}
            onBlur={(e) => e.target.value.trim() !== column.artifactName && patch({ artifactName: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
      </FormField>
      <FormField label={t('Modelo do documento')} hint={t('A IA preenche este modelo ao gerar o documento.')}>
        {() => (
          <MarkdownEditor
            key={column.artifactTemplate}
            minRows={8}
            value={template}
            onChange={setTemplate}
            onCommit={() => template !== column.artifactTemplate && patch({ artifactTemplate: template })}
            placeholder={t('Markdown com as seções do documento.')}
          />
        )}
      </FormField>
      {profiles.length > 0 && (
        <FormField
          label={t('Agente')}
          hint={t('Skills, servidores MCP, ferramentas e modelo dos cards desta fase; cada card pode trocar.')}
        >
          {(id) => (
            <SelectField
              id={id}
              aria-label={t('Agente')}
              options={[
                {
                  value: DEFAULT_PROFILE,
                  label: defaultProfile ? t('Padrão do board ({name})', { name: defaultProfile.name }) : t('Padrão do board (nenhum)'),
                },
                ...profiles.map((p) => ({ value: p.id, label: dt(p.name) })),
              ]}
              value={column.execProfile ?? DEFAULT_PROFILE}
              onChange={(id) => patch({ execProfile: id === DEFAULT_PROFILE ? null : id })}
            />
          )}
        </FormField>
      )}
      {preset && (
        <div className="form-actions">
          <Button
            variant="soft"
            color="gray"
            disabled={isDefault}
            onClick={() =>
              patch({ aiInstruction: preset.instruction, artifactName: preset.artifactName, artifactTemplate: preset.artifactTemplate })
            }
          >
            {t('Restaurar o padrão desta fase')}
          </Button>
        </div>
      )}
    </div>
  );
}
