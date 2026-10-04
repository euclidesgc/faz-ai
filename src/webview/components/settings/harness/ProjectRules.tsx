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
import { t } from '../../../i18n';

/** Os arquivos de regras do projeto que a ferramenta em uso lê, com criar, editar e apagar. */
export function ProjectRules({ tool, edit }: { tool: AiToolInfo; edit: ProjectEditing }) {
  const rules = useBoardStore((s) => s.state!.harness.rules);
  const ruleRow = (r: RuleFile) => (
    <SettingsCard
      key={r.name}
      title={r.name}
      badge={{ text: r.exists ? t('Existe') : t('Não existe'), on: r.exists }}
      hint={t('Lido por: {readBy}', { readBy: t(ruleReadBy(r.name) ?? '') })}
      actions={
        <>
          {canImportAgentsMd(r, rules) && (
            <Button
              variant="soft"
              color="gray"
              title={t('Cria um CLAUDE.md que só importa o AGENTS.md, para as regras ficarem num arquivo só')}
              onClick={() => harness.writeRule('CLAUDE.md', '@AGENTS.md\n')}
            >
              {t('Usar o AGENTS.md')}
            </Button>
          )}
          <Button variant="soft" color="gray" onClick={() => edit.toggle('rule', r.name)}>
            {edit.isEditing('rule', r.name) ? t('Fechar edição') : r.exists ? t('Editar') : t('Criar')}
          </Button>
          {r.exists && (
            <DeleteButton
              title={t('Apagar o arquivo')}
              question={t('Apagar {name}?', { name: r.name })}
              message={t('O arquivo é removido da pasta do projeto.')}
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
      <SectionHeader title={t('Regras do projeto')}>
        {t('Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.')}
      </SectionHeader>
      {visibleRules(rules, tool).map(ruleRow)}
    </>
  );
}
