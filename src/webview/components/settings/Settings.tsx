import { useBoardStore, type SettingsTab } from '../../store/boardStore';
import { settings, ui } from '../../commands';
import { ColumnsSettings } from './ColumnsSettings';
import { TypesSettings } from './TypesSettings';
import { FieldsSettings } from './FieldsSettings';
import { RulesSettings } from './RulesSettings';
import { HarnessSettings } from './HarnessSettings';
import { ModelsSettings } from './ModelsSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { ExecProfilesSettings } from './ExecProfilesSettings';
import { GitSettings } from './GitSettings';
import { Button, DeleteButton, FieldRow } from '../ui';

const TABS: [SettingsTab, string][] = [
  ['columns', 'Workflows e colunas'],
  ['types', 'Tipos de card'],
  ['fields', 'Campos'],
  ['rules', 'Regras do board'],
  ['harness', 'Harness de IA'],
  ['profiles', 'Perfis de execução'],
  ['models', 'Modelos de IA'],
  ['git', 'Git'],
  ['appearance', 'Aparência'],
];

export function Settings() {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const tab = useBoardStore((s) => s.settingsTab);
  const setTab = useBoardStore((s) => s.openSettings);

  return (
    <div className="settings">
      <div className="settings-side">
        <FieldRow label="Nome do board">
          <input defaultValue={state.board.name} onBlur={(e) => e.target.value.trim() && e.target.value !== state.board.name && settings.updateBoard({ name: e.target.value.trim() })} />
        </FieldRow>
        <nav className="tabs-vertical">
          {TABS.map(([id, label]) => (
            <Button key={id} active={tab === id} onClick={() => setTab(id)}>{label}</Button>
          ))}
        </nav>
        {state.pendingUpgrade.length > 0 && (
          <Button
            variant="primary"
            title="Leva este board ao padrão atual da extensão, sem mover nenhum card"
            onClick={() =>
              ask({
                title: 'Atualizar o board para o padrão atual?',
                message: `Nenhum card sai do lugar e o que você personalizou é mantido. O que muda: ${state.pendingUpgrade.join(' ')}`,
                confirmLabel: 'Atualizar board',
                onConfirm: () => settings.upgradeBoard(),
              })
            }
          >Atualizar board</Button>
        )}
        <Button title="Registra o board como servidor MCP para o Claude Code e outros clientes de IA" onClick={() => ui.connectAI()}>Conectar IA (MCP)</Button>
        <DeleteButton
          variant="ghost"
          title="Apaga todos os cards e configurações e recria o board com o padrão atual"
          question="Recriar o board do zero?"
          message={`Todos os ${state.cards.length} card(s), conversas, anexos e configurações deste board serão apagados, e o board volta ao padrão. Isso não pode ser desfeito. Regras e skills do projeto não são afetadas.`}
          confirmLabel="Apagar tudo e recriar"
          onConfirm={() => settings.resetBoard()}
        >
          Recriar board padrão
        </DeleteButton>
      </div>
      <div className="settings-main">
        {tab === 'columns' && <ColumnsSettings />}
        {tab === 'types' && <TypesSettings />}
        {tab === 'fields' && <FieldsSettings />}
        {tab === 'rules' && <RulesSettings />}
        {tab === 'models' && <ModelsSettings />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'harness' && <HarnessSettings />}
        {tab === 'git' && <GitSettings />}
        {tab === 'profiles' && <ExecProfilesSettings />}
      </div>
    </div>
  );
}
