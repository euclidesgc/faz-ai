import { Button } from '@radix-ui/themes';
import type { RuleFile } from '../../../../shared/harness';
import { canImportAgentsMd, ruleReadBy, visibleRules, type AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { harness } from '../../../commands';
import { DeleteButton } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { SettingsCard } from '../SettingsCard';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';

/** Os arquivos de regras do projeto que a ferramenta em uso lê, com criar, editar e apagar. */
export function ProjectRules({ tool, edit }: { tool: AiToolInfo; edit: ProjectEditing }) {
  const rules = useBoardStore((s) => s.state!.harness.rules);
  const ruleRow = (r: RuleFile) => (
    <SettingsCard
      key={r.name}
      title={r.name}
      badge={{ text: r.exists ? 'Existe' : 'Não existe', on: r.exists }}
      hint={`Lido por: ${ruleReadBy(r.name)}`}
      actions={
        <>
          {canImportAgentsMd(r, rules) && (
            <Button
              variant="soft"
              color="gray"
              title="Cria um CLAUDE.md que só importa o AGENTS.md, para as regras ficarem num arquivo só"
              onClick={() => harness.writeRule('CLAUDE.md', '@AGENTS.md\n')}
            >
              Usar o AGENTS.md
            </Button>
          )}
          <Button variant="soft" color="gray" onClick={() => edit.toggle('rule', r.name)}>
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
        </>
      }
    >
      {edit.isEditing('rule', r.name) && (
        <FileEditor saved={r.content} onSave={(content) => harness.writeRule(r.name, content)} onClose={edit.close} />
      )}
    </SettingsCard>
  );
  return (
    <>
      <SectionHeader title="Regras do projeto">
        Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.
      </SectionHeader>
      {visibleRules(rules, tool).map(ruleRow)}
    </>
  );
}
