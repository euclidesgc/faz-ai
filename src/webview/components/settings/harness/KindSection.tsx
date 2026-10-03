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
import { ItemRow } from './ItemRow';
import { NewHook } from './NewHook';
import { NewItem } from './NewItem';
import { NewMcpServer } from './NewMcpServer';
import { NewPermission } from './NewPermission';
import { toolLabel } from './text';
import type { ItemActions } from './useItemActions';

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
  const { copyable, twin, copy, setMode } = actions;
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
      title={k.label}
      badge={{ text: String(ofKind.length), on: false }}
      hint={k.hint}
      actions={
        <>
          {k.id === 'skill' && (
            <Button variant="soft" color="gray" onClick={() => onInstalling(!installing)}>
              Buscar e instalar
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
              Nova regra de permissão
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
              {k.id === 'settings' ? 'Novo arquivo' : 'Novo'}
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
              Modelos de classe e exemplos de código ficam bem numa skill própria, só quando indicada: os arquivos vão em{' '}
              <code>references/</code> e os cards que a indicam recebem os caminhos.
            </span>
            <Button variant="ghost" size="1" onClick={() => harness.createReferenceSkill()}>
              Criar skill de modelos
            </Button>
          </div>
        )}
      {k.id === 'skill' && (installing || state.harnessInstall) && <InstallSkills key={tool} tool={tool} />}
      {k.id === 'plugin' && (
        <div className="muted small">
          Plugins são instalados e removidos pela própria ferramenta, {PLUGIN_COMMANDS[tool].where}:
          <ul>
            {PLUGIN_COMMANDS[tool].commands.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          Para aproveitar só uma skill de um plugin ou de um repositório, use "Buscar e instalar" na seção Skills, ou "Copiar para o
          projeto" na skill do plugin.
        </div>
      )}
      {k.id === 'hook' && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.
          </Callout.Text>
        </Callout.Root>
      )}
      {creating === 'hook' && k.id === 'hook' && hookFiles.length > 0 && (
        <NewHook key={tool} tool={tool} targets={hookFiles} onClose={() => onCreating(null)} />
      )}
      {k.id === 'hook' && tool === 'kimi' && (
        <p className="muted small">
          Os hooks do Kimi Code ficam no <code>~/.kimi-code/config.toml</code> (<code>[[hooks]]</code>): aparecem aqui e são editados no
          arquivo.
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
          Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code:{' '}
          <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.
        </p>
      )}
      {creating === k.id && k.id !== 'hook' && k.id !== 'mcp' && places.length > 0 && (
        <NewItem key={tool} tool={tool} kind={k.id} targets={places} onClose={() => onCreating(null)} />
      )}
      {k.id === 'skill' && automatic.length > 0 && (
        <p className="muted small">
          {automatic.length} skills automáticas: as descrições delas,{' '}
          {automatic.reduce((n, i) => n + i.description.length, 0).toLocaleString('pt-BR')} caracteres ao todo, entram em toda sessão do{' '}
          {toolLabel(tool)}. As demais só são lidas quando indicadas.
        </p>
      )}
      {ofKind.length === 0 && <p className="muted small">Nada encontrado para o {toolLabel(tool)}.</p>}
      {HARNESS_SCOPES.map((s) => {
        const group = ofKind.filter((i) => i.scope === s.id);
        if (!group.length) return null;
        const toProject = s.id === 'project' ? [] : group.filter((i) => copyable(i, 'project') && !twin(i, 'project'));
        return (
          <details key={s.id} open={s.id !== 'plugin' || group.length <= 12}>
            <summary title={s.hint}>
              {s.label} <span className="muted small">({group.length})</span>
              {s.id !== 'plugin' && group.filter((i) => i.mode === 'auto').length > 1 && (
                <Button
                  variant="ghost"
                  size="1"
                  title="A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode(
                      group.filter((i) => i.mode === 'auto'),
                      'manual',
                    );
                  }}
                >
                  Deixar todas só quando indicadas
                </Button>
              )}
              {toProject.length > 1 && (
                <Button
                  variant="ghost"
                  size="1"
                  onClick={(e) => {
                    e.preventDefault();
                    copy(toProject, 'project');
                  }}
                >
                  Copiar todas para o projeto ({toProject.length})
                </Button>
              )}
            </summary>
            <table className="table">
              <tbody>
                {group.map((i) => (
                  <ItemRow
                    key={`${i.path}|${i.name}|${i.detail ?? ''}`}
                    tool={tool}
                    item={i}
                    actions={actions}
                    filesOpen={filesOpen === i.path}
                    onToggleFiles={() => onFilesOpen(filesOpen === i.path ? null : i.path)}
                  />
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
    </SettingsCard>
  );
}
