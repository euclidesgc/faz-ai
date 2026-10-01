import { useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { ColumnsSettings } from './ColumnsSettings';
import { TypesSettings } from './TypesSettings';
import { FieldsSettings } from './FieldsSettings';
import { RulesSettings } from './RulesSettings';

type Tab = 'columns' | 'types' | 'fields' | 'rules';

export function Settings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
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
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Regras</button>
        </nav>
      </div>
      <div className="settings-main">
        {tab === 'columns' && <ColumnsSettings />}
        {tab === 'types' && <TypesSettings />}
        {tab === 'fields' && <FieldsSettings />}
        {tab === 'rules' && <RulesSettings />}
      </div>
    </div>
  );
}
