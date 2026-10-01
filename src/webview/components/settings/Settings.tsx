import { useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { ColumnsSettings } from './ColumnsSettings';
import { TypesSettings } from './TypesSettings';
import { FieldsSettings } from './FieldsSettings';
import { RulesSettings } from './RulesSettings';
import { HarnessSettings } from './HarnessSettings';
import { ModelsSettings } from './ModelsSettings';
import { AppearanceSettings } from './AppearanceSettings';

type Tab = 'columns' | 'types' | 'fields' | 'rules' | 'models' | 'harness' | 'appearance';

export function Settings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [tab, setTab] = useState<Tab>('columns');

  return (
    <div className="settings">
      <div className="settings-side">
        <label className="field-row">
          <span>Nome do board</span>
          <input defaultValue={state.board.name} onBlur={(e) => e.target.value.trim() && e.target.value !== state.board.name && send({ type: 'settings.board.update', patch: { name: e.target.value.trim() } })} />
        </label>
        <nav className="tabs-vertical">
          <button className={tab === 'columns' ? 'active' : ''} onClick={() => setTab('columns')}>Workflows e colunas</button>
          <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>Tipos de card</button>
          <button className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>Campos</button>
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Regras do board</button>
          <button className={tab === 'harness' ? 'active' : ''} onClick={() => setTab('harness')}>Harness de IA</button>
          <button className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}>Modelos de IA</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>Aparência</button>
        </nav>
        <button title="Registra o board como servidor MCP para o Claude Code e outros clientes de IA" onClick={() => send({ type: 'ui.connectAI' })}>Conectar IA (MCP)</button>
        <button
          className="ghost danger"
          title="Apaga todos os cards e configurações e recria o board com o padrão atual"
          onClick={() =>
            ask({
              title: 'Recriar o board do zero?',
              message: `Todos os ${state.cards.length} card(s), comentários, anexos e configurações deste board serão apagados, e o board volta ao padrão. Isso não pode ser desfeito. Regras e skills do projeto não são afetadas.`,
              confirmLabel: 'Apagar tudo e recriar',
              danger: true,
              onConfirm: () => send({ type: 'settings.board.reset' }),
            })
          }
        >Recriar board padrão</button>
      </div>
      <div className="settings-main">
        {tab === 'columns' && <ColumnsSettings />}
        {tab === 'types' && <TypesSettings />}
        {tab === 'fields' && <FieldsSettings />}
        {tab === 'rules' && <RulesSettings />}
        {tab === 'models' && <ModelsSettings />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'harness' && <HarnessSettings />}
      </div>
    </div>
  );
}
