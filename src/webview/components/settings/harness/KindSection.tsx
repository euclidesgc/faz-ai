import {
  HARNESS_KINDS,
  HARNESS_SCOPES,
  REFERENCE_SKILL,
  type AiTool,
  type HarnessItem,
  type HarnessKind,
} from '../../../../shared/harness';
import { PLUGIN_COMMANDS, createTargets, hookTargets, mcpTargets, permissionTargets } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Button, Callout } from '@radix-ui/themes';
import { IconWarning } from '../../ui';
import { SettingsCard } from '../SettingsCard';
import { InstallSkills } from './InstallSkills';
import { NewHook } from './NewHook';
import { NewItem } from './NewItem';
import { NewMcpServer } from './NewMcpServer';
import { NewPermission } from './NewPermission';
import { ScopeGroup } from './ScopeGroup';
import { toolLabel } from './text';
import type { ItemActions } from './useItemActions';
import { getLocale, t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

interface Props {
  kind: (typeof HARNESS_KINDS)[number];
  tool: AiTool;
  /** todos os itens da ferramenta, de todos os tipos */
  items: HarnessItem[];
  actions: ItemActions;
  // o que está aberto é da tela inteira: um formulário de criação por vez, e abrir um fecha o outro
  creating: HarnessKind | null;
  onCreating: (kind: HarnessKind | null) => void;
  addingRule: boolean;
  onAddingRule: (open: boolean) => void;
  installing: boolean;
  onInstalling: (open: boolean) => void;
  /** skill com os arquivos de apoio à mostra */
  filesOpen: string | null;
  onFilesOpen: (path: string | null) => void;
}

/** Uma seção do inventário (Skills, Hooks, Servidores MCP…): botões de criar, avisos e os itens por escopo. */
export function KindSection({
  kind: k,
  tool,
  items,
  actions,
  creating,
  onCreating,
  addingRule,
  onAddingRule,
  installing,
  onInstalling,
  filesOpen,
  onFilesOpen,
}: Props) {
  const state = useBoardStore((s) => s.state)!;
  const mcpFiles = mcpTargets(tool);
  const hookFiles = hookTargets(tool);
  const permissionFiles = permissionTargets(tool);
  const ofKind = items.filter((i) => i.kind === k.id);
  // arquivo fixo que já existe não é oferecido de novo
  const places = createTargets(tool).filter((t) => t.kind === k.id && !(t.layout === 'file' && ofKind.some((i) => i.location === t.label)));
  /** skills cuja descrição a ferramenta carrega em toda sessão */
  const automatic = items.filter((i) => i.kind === 'skill' && i.mode === 'auto');
  return (
    <SettingsCard
      title={t(k.label)}
      badge={{ text: String(ofKind.length), on: false }}
      hint={t(k.hint)}
      actions={
        <>
          {k.id === 'skill' && (
            <Button variant="soft" color="gray" onClick={() => onInstalling(!installing)}>
              {t('Buscar skills para instalar')}
            </Button>
          )}
          {k.id === 'settings' && permissionFiles.length > 0 && (
            <Button
              variant="soft"
              color="gray"
              onClick={() => {
                onAddingRule(!addingRule);
                onCreating(null);
              }}
            >
              {t('Nova regra de permissão')}
            </Button>
          )}
          {(places.length > 0 || (k.id === 'mcp' && mcpFiles.length > 0) || (k.id === 'hook' && hookFiles.length > 0)) && (
            <Button
              variant="soft"
              color="gray"
              onClick={() => {
                onCreating(creating === k.id ? null : k.id);
                onAddingRule(false);
              }}
            >
              {k.id === 'settings' ? t('Novo arquivo') : t('Novo')}
            </Button>
          )}
        </>
      }
    >
      {k.id === 'skill' &&
        tool === state.board.aiTool &&
        !items.some((i) => i.kind === 'skill' && i.scope === 'project' && i.name === REFERENCE_SKILL.name) && (
          <div className="row">
            <span className="muted small">
              {rich(
                'Modelos de classe e exemplos de código ficam bem numa skill própria, só quando indicada: os arquivos vão em <code>references/</code> e os cards que a indicam recebem os caminhos.',
              )}
            </span>
            <Button variant="ghost" size="1" onClick={() => harness.createReferenceSkill()}>
              {t('Criar skill de modelos')}
            </Button>
          </div>
        )}
      {k.id === 'skill' && (installing || state.harnessInstall) && <InstallSkills key={tool} tool={tool} />}
      {k.id === 'plugin' && (
        <div className="muted small">
          {t('Plugins são instalados e removidos pela própria ferramenta, {where}:', { where: t(PLUGIN_COMMANDS[tool].where) })}
          <ul>
            {PLUGIN_COMMANDS[tool].commands.map((c) => (
              <li key={c}>
                <code>{t(c)}</code>
              </li>
            ))}
          </ul>
          {t(
            'Para aproveitar só uma skill de um plugin ou de um repositório, use "Buscar skills para instalar" na seção Skills, ou "Copiar para o projeto" na skill do plugin.',
          )}
        </div>
      )}
      {k.id === 'hook' && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t('Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.')}
          </Callout.Text>
        </Callout.Root>
      )}
      {creating === 'hook' && k.id === 'hook' && hookFiles.length > 0 && (
        <NewHook key={tool} tool={tool} targets={hookFiles} onClose={() => onCreating(null)} />
      )}
      {k.id === 'hook' && tool === 'kimi' && (
        <p className="muted small">
          {rich(
            'Os hooks do Kimi Code ficam no <code>~/.kimi-code/config.toml</code> (<code>[[hooks]]</code>): aparecem aqui e são editados no arquivo.',
          )}
        </p>
      )}
      {k.id === 'settings' && addingRule && permissionFiles.length > 0 && (
        <NewPermission key={tool} tool={tool} targets={permissionFiles} onClose={() => onAddingRule(false)} />
      )}
      {creating === 'mcp' && k.id === 'mcp' && mcpFiles.length > 0 && (
        <NewMcpServer key={tool} tool={tool} targets={mcpFiles} onClose={() => onCreating(null)} />
      )}
      {k.id === 'mcp' && tool === 'claude' && (
        <p className="muted small">
          {rich(
            'Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code: <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.',
          )}
        </p>
      )}
      {creating === k.id && k.id !== 'hook' && k.id !== 'mcp' && places.length > 0 && (
        <NewItem key={tool} tool={tool} kind={k.id} targets={places} onClose={() => onCreating(null)} />
      )}
      {k.id === 'skill' && automatic.length > 0 && (
        <p className="muted small">
          {t(
            '{n} skills automáticas: as descrições delas, {chars} caracteres ao todo, entram em toda sessão do {tool}. As demais só são lidas quando indicadas.',
            {
              n: automatic.length,
              chars: automatic.reduce((n, i) => n + i.description.length, 0).toLocaleString(getLocale() === 'en' ? 'en-US' : 'pt-BR'),
              tool: toolLabel(tool),
            },
          )}
        </p>
      )}
      {HARNESS_SCOPES.map((s) => {
        const group = ofKind.filter((i) => i.scope === s.id);
        // o projeto aparece sempre: vazio, é a resposta de que nada daqui faz parte dele
        return (
          (group.length > 0 || s.id === 'project') && (
            <ScopeGroup
              key={s.id}
              tool={tool}
              scope={s.id}
              items={group}
              actions={actions}
              filesOpen={filesOpen}
              onFilesOpen={onFilesOpen}
            />
          )
        );
      })}
    </SettingsCard>
  );
}
