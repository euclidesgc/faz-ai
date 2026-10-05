import { TextField } from '@radix-ui/themes';
import { useBoardStore, type SettingsTab } from '../../store/boardStore';
import { t } from '../../i18n';
import { settings } from '../../commands';
import { WorkflowsSettings } from './workflows/WorkflowsSettings';
import { TypesSettings } from './TypesSettings';
import { FieldsSettings } from './FieldsSettings';
import { RulesSettings } from './RulesSettings';
import { HarnessSettings } from './HarnessSettings';
import { ModelsSettings } from './ModelsSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { AgentsSettings } from './AgentsSettings';
import { GitSettings } from './GitSettings';
import { BackupSettings } from './BackupSettings';
import {
  Button,
  DeleteButton,
  FormField,
  IconAppearance,
  IconBackup,
  IconBranch,
  IconColumns,
  IconFields,
  IconHarness,
  IconModels,
  IconPanelClose,
  IconPanelOpen,
  IconAgents,
  IconReset,
  IconRules,
  IconTypes,
  IconUpgrade,
  type Icon,
} from '../ui';

const TABS: [SettingsTab, string, Icon][] = [
  ['columns', 'Workflows e colunas', IconColumns],
  ['types', 'Tipos de card', IconTypes],
  ['fields', 'Campos', IconFields],
  ['rules', 'Regras do board', IconRules],
  ['harness', 'Harness de IA', IconHarness],
  ['agents', 'Agentes', IconAgents],
  ['models', 'Modelos de IA', IconModels],
  ['git', 'Git', IconBranch],
  ['appearance', 'Aparência', IconAppearance],
  ['backup', 'Backup', IconBackup],
];

/** Conteúdo de um botão do menu: ícone sempre; o rótulo só com o menu aberto (recolhido, ele vira o nome acessível). */
const navProps = (collapsed: boolean, label: string, Glyph: Icon) => ({
  'aria-label': collapsed ? label : undefined,
  title: collapsed ? label : undefined,
  children: (
    <>
      <Glyph />
      {!collapsed && <span className="nav-label">{label}</span>}
    </>
  ),
});

export function Settings() {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const tab = useBoardStore((s) => s.settingsTab);
  const setTab = useBoardStore((s) => s.openSettings);
  const collapsed = useBoardStore((s) => s.settingsNavCollapsed);
  const setCollapsed = useBoardStore((s) => s.setSettingsNavCollapsed);

  return (
    <div className="settings">
      <div className={`settings-side ${collapsed ? 'collapsed' : ''}`}>
        <Button
          variant="icon"
          className="nav-toggle"
          title={collapsed ? t('Expandir o menu') : t('Recolher o menu')}
          aria-label={collapsed ? t('Expandir o menu') : t('Recolher o menu')}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <IconPanelOpen /> : <IconPanelClose />}
        </Button>
        {!collapsed && (
          <FormField label={t('Nome do board')}>
            {(id) => (
              <TextField.Root
                id={id}
                key={state.board.name}
                defaultValue={state.board.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value.trim() !== state.board.name &&
                  settings.updateBoard({ name: e.target.value.trim() })
                }
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
          </FormField>
        )}
        <nav className="tabs-vertical" aria-label={t('Seções das configurações')}>
          {TABS.map(([id, label, Glyph]) => (
            <Button key={id} active={tab === id} onClick={() => setTab(id)} {...navProps(collapsed, t(label), Glyph)} />
          ))}
        </nav>
        <div className="settings-side-actions">
          {state.pendingUpgrade.length > 0 && (
            <Button
              variant="primary"
              onClick={() =>
                ask({
                  title: t('Atualizar o board para o padrão atual?'),
                  message: t('Nenhum card sai do lugar e o que você personalizou é mantido. O que muda: {changes}', {
                    changes: state.pendingUpgrade.map((c) => t(c)).join(' '),
                  }),
                  confirmLabel: t('Atualizar board'),
                  onConfirm: () => settings.upgradeBoard(),
                })
              }
              {...navProps(collapsed, t('Atualizar board'), IconUpgrade)}
              title={t('Leva este board ao padrão atual da extensão, sem mover nenhum card')}
            />
          )}
          <DeleteButton
            variant="ghost"
            question={t('Recriar o board do zero?')}
            message={t(
              'Todos os {count} card(s), conversas, anexos e configurações deste board serão apagados, e o board volta ao padrão. Isso não pode ser desfeito. Regras e skills do projeto não são afetadas.',
              { count: state.cards.length },
            )}
            confirmLabel={t('Apagar tudo e recriar')}
            onConfirm={() => settings.resetBoard()}
            {...navProps(collapsed, t('Recriar board padrão'), IconReset)}
            title={t('Apaga todos os cards e configurações e recria o board com o padrão atual')}
          />
        </div>
      </div>
      <div className="settings-main">
        {tab === 'columns' && <WorkflowsSettings />}
        {tab === 'types' && <TypesSettings />}
        {tab === 'fields' && <FieldsSettings />}
        {tab === 'rules' && <RulesSettings />}
        {tab === 'models' && <ModelsSettings />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'harness' && <HarnessSettings />}
        {tab === 'git' && <GitSettings />}
        {tab === 'agents' && <AgentsSettings />}
        {tab === 'backup' && <BackupSettings />}
      </div>
    </div>
  );
}
