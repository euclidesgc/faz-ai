import { useState } from 'react';
import type { Column } from '../../../../shared/model';
import { PHASE_DEFAULTS } from '../../../../shared/phaseDefaults';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { MarkdownEditor } from '../../MarkdownEditor';
import { Button } from '../../ui';

/** A fase de uma coluna: o que a IA faz quando o card entra nela e o documento que a fase produz. */
export function PhaseEditor({ column }: { column: Column }) {
  const [template, setTemplate] = useState(column.artifactTemplate);
  const profiles = useBoardStore((s) => s.state)!.board.execProfiles;
  const patch = (p: { aiInstruction?: string; artifactName?: string; artifactTemplate?: string; execProfile?: string | null }) =>
    settings.updateColumn(column.id, p);
  const preset = PHASE_DEFAULTS[column.name];
  const isDefault =
    preset &&
    preset.instruction === column.aiInstruction &&
    preset.artifactName === column.artifactName &&
    preset.artifactTemplate === column.artifactTemplate;

  return (
    <div className="phase-editor">
      <label className="field-col">
        <span>
          Instrução para a IA <small className="muted">o que ela faz quando um card entra em "{column.name}"</small>
        </span>
        <textarea
          key={column.aiInstruction}
          rows={5}
          defaultValue={column.aiInstruction}
          placeholder="Ex.: escreva o documento de requisitos a partir da conversa do card…"
          onBlur={(e) => e.target.value !== column.aiInstruction && patch({ aiInstruction: e.target.value })}
        />
      </label>
      <label className="field-col">
        <span>
          Documento da fase <small className="muted">nome do arquivo anexado à história; vazio se a fase não gera documento</small>
        </span>
        <input
          key={column.artifactName}
          defaultValue={column.artifactName}
          placeholder="Ex.: PRD.md"
          onBlur={(e) => e.target.value.trim() !== column.artifactName && patch({ artifactName: e.target.value.trim() })}
        />
      </label>
      <div className="field-col">
        <span>
          Modelo do documento <small className="muted">a IA preenche este modelo ao gerar o documento</small>
        </span>
        <MarkdownEditor
          key={column.artifactTemplate}
          minRows={8}
          value={template}
          onChange={setTemplate}
          onCommit={() => template !== column.artifactTemplate && patch({ artifactTemplate: template })}
          placeholder="Markdown com as seções do documento."
        />
      </div>
      {profiles.length > 0 && (
        <label className="field-col">
          <span>
            Perfil de execução{' '}
            <small className="muted">
              agente, skills, servidores MCP, ferramentas e modelo dos cards desta fase; cada card pode trocar
            </small>
          </span>
          <select value={column.execProfile ?? ''} onChange={(e) => patch({ execProfile: e.target.value || null })}>
            <option value="">
              Padrão do board{profiles.find((p) => p.isDefault) ? ` (${profiles.find((p) => p.isDefault)!.name})` : ' (nenhum)'}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {preset && (
        <div className="row end">
          <Button
            variant="ghost"
            size="small"
            disabled={isDefault}
            onClick={() =>
              patch({ aiInstruction: preset.instruction, artifactName: preset.artifactName, artifactTemplate: preset.artifactTemplate })
            }
          >
            Restaurar o padrão desta fase
          </Button>
        </div>
      )}
    </div>
  );
}
