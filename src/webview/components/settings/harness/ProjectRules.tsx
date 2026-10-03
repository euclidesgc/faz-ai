import type { RuleFile } from '../../../../shared/harness';
import { canImportAgentsMd, ruleReadBy, visibleRules, type AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { harness } from '../../../commands';
import { Button, DeleteButton } from '../../ui';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';

/** Os arquivos de regras do projeto que a ferramenta em uso lê, com criar, editar e apagar. */
export function ProjectRules({ tool, edit }: { tool: AiToolInfo; edit: ProjectEditing }) {
  const rules = useBoardStore((s) => s.state!.harness.rules);
  const ruleRow = (r: RuleFile) => (
    <section key={r.name} className="settings-block">
      <div className="row">
        <h3 className="plain">{r.name}</h3>
        <span className={`pill ${r.exists ? '' : 'off'}`}>{r.exists ? 'Existe' : 'Não existe'}</span>
        <span className="muted small">Lido por: {ruleReadBy(r.name)}</span>
        <span className="spacer" />
        {canImportAgentsMd(r, rules) && (
          <Button
            title="Cria um CLAUDE.md que só importa o AGENTS.md, para as regras ficarem num arquivo só"
            onClick={() => harness.writeRule('CLAUDE.md', '@AGENTS.md\n')}
          >
            Usar o AGENTS.md
          </Button>
        )}
        <Button onClick={() => edit.toggle('rule', r.name)}>
          {edit.isEditing('rule', r.name) ? 'Fechar' : r.exists ? 'Editar' : 'Criar'}
        </Button>
        {r.exists && (
          <DeleteButton
            title="Apagar o arquivo"
            question={`Apagar ${r.name}?`}
            message="O arquivo é removido da pasta do projeto."
            onConfirm={() => harness.deleteRule(r.name)}
          />
        )}
      </div>
      {edit.isEditing('rule', r.name) && (
        <FileEditor saved={r.content} onSave={(content) => harness.writeRule(r.name, content)} onClose={edit.close} />
      )}
    </section>
  );
  return (
    <>
      <h3 className="section-head">Regras do projeto</h3>
      <p className="muted small">Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.</p>
      <div className="stack">{visibleRules(rules, tool).map(ruleRow)}</div>
    </>
  );
}
