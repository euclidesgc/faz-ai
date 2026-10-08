import { useEffect, useState } from 'react';
import { Button, Tabs } from '@radix-ui/themes';
import type { InstallScope } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { harness } from '../../../commands';
import { SectionHeader } from '../SectionHeader';
import { AgentsTable } from './AgentsTable';
import { SelectionTable } from './SelectionTable';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

type Sub = 'rules' | 'agents' | 'skills';

/** Um escopo do harness (projeto ou global) em três sub-abas: rules, agentes e skills, cada uma com a marcação do board. */
export function ScopeHarness({ tool, scope }: { tool: AiToolInfo; scope: InstallScope }) {
  const [sub, setSub] = useState<Sub>('rules');
  // a pasta do usuário não é vigiada: relê ao abrir a tela
  useEffect(() => harness.refresh(), []);
  return (
    <div className="scope-harness">
      <SectionHeader
        title={scope === 'project' ? t('Harness do projeto') : t('Harness global')}
        actions={
          <Button variant="soft" color="gray" title={t('Relê as pastas do projeto e do usuário')} onClick={() => harness.refresh()}>
            {t('Reler pastas')}
          </Button>
        }
      >
        {scope === 'project'
          ? rich(
              'Arquivos da pasta deste projeto, lidos pelo {tool}: vão no repositório. Marque o que as execuções do board podem usar; o que não está marcado não existe para elas.',
              { tool: tool.label },
            )
          : rich(
              'Arquivos da sua pasta de usuário e dos plugins instalados, lidos pelo {tool}: valem na sua máquina, em qualquer projeto. A marcação é deste board. Os agentes que o board cria ficam aqui.',
              { tool: tool.label },
            )}
      </SectionHeader>
      <Tabs.Root value={sub} onValueChange={(v) => setSub(v as Sub)}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="rules">{t('Rules')}</Tabs.Trigger>
          <Tabs.Trigger value="agents">{t('Agentes')}</Tabs.Trigger>
          <Tabs.Trigger value="skills">{t('Skills')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="rules">
          <SelectionTable tool={tool} scope={scope} kind="instructions" />
        </Tabs.Content>
        <Tabs.Content value="agents">
          <AgentsTable tool={tool} scope={scope} />
        </Tabs.Content>
        <Tabs.Content value="skills">
          <SelectionTable tool={tool} scope={scope} kind="skill" />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
