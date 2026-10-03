import { useEffect, useState } from 'react';
import { HARNESS_KINDS, type AiTool, type HarnessKind } from '../../../shared/harness';
import { harness } from '../../commands';
import { useBoardStore } from '../../store/boardStore';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';
import { Badge, Button, Tabs } from '@radix-ui/themes';
import { SectionHeader } from './SectionHeader';
import { KindSection } from './harness/KindSection';
import { toolLabel } from './harness/text';
import { useItemActions } from './harness/useItemActions';

/** Tudo que cada ferramenta de IA carrega: por tipo de componente e por escopo (projeto, global, plugins). */
export function HarnessInventory() {
  const state = useBoardStore((s) => s.state)!;
  const [tool, setTool] = useState<AiTool>(state.board.aiTool);
  const [creating, setCreating] = useState<HarnessKind | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  // a pasta do usuário não é vigiada: relê ao abrir a tela
  useEffect(() => harness.refresh(), []);

  const inventory = state.harness.inventory;
  const items = inventory.find((x) => x.tool === tool)?.items ?? [];
  const missing = inventory.filter((x) => !x.installed && x.items.length === 0).map((x) => toolLabel(x.tool));
  const actions = useItemActions(tool, items);

  return (
    <div className="harness-inventory">
      <SectionHeader
        title={t('Tudo que cada ferramenta carrega')}
        actions={
          <Button variant="soft" color="gray" title={t('Relê as pastas do projeto e do usuário')} onClick={() => harness.refresh()}>
            {t('Atualizar')}
          </Button>
        }
      >
        {rich(
          'O que cada ferramenta de IA lê neste projeto e na sua pasta de usuário, separado por escopo. <b>Projeto</b> vale só aqui; <b>Global</b> vale em todos os seus projetos; <b>Plugins</b> vem de pacotes instalados e não pode ser alterado, mas pode ser copiado. "Abrir" mostra o arquivo no editor, onde ele também é editado.',
        )}
      </SectionHeader>
      <Tabs.Root
        value={tool}
        onValueChange={(next) => {
          setTool(next as AiTool);
          setCreating(null);
        }}
      >
        <Tabs.List className="harness-tabs">
          {inventory.map((x) => (
            <Tabs.Trigger key={x.tool} value={x.tool}>
              {toolLabel(x.tool)}
              {x.tool === state.board.aiTool && (
                <Badge color="indigo" variant="soft">
                  {t('deste projeto')}
                </Badge>
              )}
              {!x.installed && (
                <Badge color="gray" variant="outline">
                  {t('não encontrada')}
                </Badge>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      {missing.length > 0 && (
        <p className="muted small">{t('Sem sinal de instalação nesta máquina: {tools}.', { tools: missing.join(', ') })}</p>
      )}
      {HARNESS_KINDS.map((k) => (
        <KindSection
          key={k.id}
          kind={k}
          tool={tool}
          items={items}
          actions={actions}
          creating={creating}
          onCreating={setCreating}
          addingRule={addingRule}
          onAddingRule={setAddingRule}
          installing={installing}
          onInstalling={setInstalling}
          filesOpen={filesOpen}
          onFilesOpen={setFilesOpen}
        />
      ))}
    </div>
  );
}
