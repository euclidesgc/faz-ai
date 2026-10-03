import { useEffect, useState } from 'react';
import { HARNESS_KINDS, type AiTool, type HarnessKind } from '../../../shared/harness';
import { harness } from '../../commands';
import { useBoardStore } from '../../store/boardStore';
import { Button } from '../ui';
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
  const items = inventory.find((t) => t.tool === tool)?.items ?? [];
  const missing = inventory.filter((t) => !t.installed && t.items.length === 0).map((t) => toolLabel(t.tool));
  const actions = useItemActions(tool, items);

  return (
    <div className="harness-inventory">
      <div className="row section-head">
        <h3>Tudo que cada ferramenta carrega</h3>
        <span className="spacer" />
        <Button title="Relê as pastas do projeto e do usuário" onClick={() => harness.refresh()}>
          Atualizar
        </Button>
      </div>
      <p className="muted small">
        O que cada ferramenta de IA lê neste projeto e na sua pasta de usuário, separado por escopo. <b>Projeto</b> vale só aqui;{' '}
        <b>Global</b> vale em todos os seus projetos; <b>Plugins</b> vem de pacotes instalados e não pode ser alterado, mas pode ser
        copiado. "Abrir" mostra o arquivo no editor, onde ele também é editado.
      </p>
      <div className="tabs">
        {inventory.map((t) => (
          <Button
            key={t.tool}
            active={t.tool === tool}
            onClick={() => {
              setTool(t.tool);
              setCreating(null);
            }}
          >
            {toolLabel(t.tool)}
            {t.tool === state.board.aiTool && <span className="pill">deste projeto</span>}
            {!t.installed && <span className="pill off">não encontrada</span>}
          </Button>
        ))}
      </div>
      {missing.length > 0 && <p className="muted small">Sem sinal de instalação nesta máquina: {missing.join(', ')}.</p>}
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
