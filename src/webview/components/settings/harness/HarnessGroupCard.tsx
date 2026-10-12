import { useState } from 'react';
import { Badge, Button, Callout } from '@radix-ui/themes';
import { REFERENCE_SKILL, aiToolInfo, type AiTool, type HarnessItem, type InstallScope } from '../../../../shared/harness';
import {
  HARNESS_CATALOG,
  HARNESS_NOTES,
  PLUGIN_COMMANDS,
  createTargets,
  hookTargets,
  mcpTargets,
  permissionTargets,
  type HARNESS_GROUPS,
} from '../../../../shared/harnessCatalog';
import { HARNESS_USAGES, isSelectableKind, usageOf, type HarnessUsage } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconWarning, SelectField } from '../../ui';
import { SettingsCard } from '../SettingsCard';
import { AgentsTable } from './AgentsTable';
import { BoardInstall } from './BoardInstall';
import { InstallSkills } from './InstallSkills';
import { ItemRow } from './ItemRow';
import { NewHook } from './NewHook';
import { NewItem } from './NewItem';
import { NewMcpServer } from './NewMcpServer';
import { NewPermission } from './NewPermission';
import type { ItemActions } from './useItemActions';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** Chave estável de uma linha: o mesmo arquivo pode trazer várias entradas (hooks, regras de permissão). */
const keyOf = (i: HarnessItem) => `${i.path}|${i.name}|${i.detail ?? ''}`;

/** Como as execuções do board usam uma rule ou skill: fora, em todo contexto ou quando fizer sentido. */
function UsageSelect({ item }: { item: HarnessItem }) {
  const selection = useBoardStore((s) => s.state!.harnessSelection);
  if (!isSelectableKind(item.kind) || item.kind === 'agent') return null;
  const kind = item.kind;
  const usage = usageOf(selection, item);
  return (
    <SelectField<HarnessUsage | 'none'>
      size="1"
      aria-label={t('Uso nas execuções do board: {name}', { name: item.name })}
      title={t('Só o que está marcado entra nas execuções do board; o resto fica invisível para elas.')}
      options={[{ value: 'none', label: t('Fora das execuções') }, ...HARNESS_USAGES.map((u) => ({ value: u.id, label: t(u.label) }))]}
      value={usage ?? 'none'}
      onChange={(v) => harness.setSelection([{ kind, location: item.location }], v === 'none' ? null : v)}
    />
  );
}

interface Props {
  group: (typeof HARNESS_GROUPS)[number];
  tool: AiTool;
  scope: InstallScope;
  /** os itens deste grupo nesta aba */
  items: HarnessItem[];
  /** todos os itens da ferramenta, para saber o que já foi copiado ou instalado */
  all: HarnessItem[];
  actions: ItemActions;
  /** formulário aberto na aba: um por vez, e abrir um fecha o outro */
  open: string | null;
  onOpen: (key: string | null) => void;
}

/**
 * Um grupo das abas Projeto e Global (Regras principais, Skills, Hooks…): o que é, os itens com a frase
 * de cada um e o caminho que abre no editor do board, os arquivos que a ferramenta leria mas ainda não
 * existem, os avisos do que não fica em arquivo e as ações de criar do grupo.
 */
export function HarnessGroupCard({ group, tool, scope, items, all, actions, open, onOpen }: Props) {
  const state = useBoardStore((s) => s.state)!;
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  const g = group.id;
  const projectTool = tool === state.board.aiTool;
  const catalog = HARNESS_CATALOG[tool];
  const sources = catalog.flatMap((src, source) => (src.group === g && src.scope === scope ? [{ src, source }] : []));
  const notes = HARNESS_NOTES[tool].filter((n) => n.group === g && n.scope === scope);
  // arquivo fixo que a ferramenta leria, mas que ainda não existe: dá para criar daqui
  const absent = sources.filter(({ src, source }) => src.layout === 'file' && !src.noCreate && !items.some((i) => i.source === source));
  const creatable = createTargets(tool).filter((c) => c.scope === scope && c.layout !== 'file' && catalog[c.source]!.group === g);
  const hooks = g === 'hook' ? hookTargets(tool).filter((x) => x.scope === scope) : [];
  const mcps = g === 'mcp' ? mcpTargets(tool).filter((x) => x.scope === scope) : [];
  const permissions = g === 'settings' ? permissionTargets(tool).filter((x) => x.scope === scope) : [];
  // os agentes da ferramenta do projeto têm a tabela própria, com a marcação, o padrão e o editor do board
  const agentsTable = g === 'agent' && projectTool && !!aiToolInfo(tool).agents;

  if (g === 'managed' && items.length === 0 && notes.length === 0) return null;
  if (g !== 'plugin' && items.length === 0 && sources.length === 0 && notes.length === 0) return null;

  const key = (what: string) => `${g}:${what}`;
  const toggle = (what: string) => onOpen(open === key(what) ? null : key(what));
  const createFile = (source: number) => harness.createItem(tool, source, '', '');
  const location = (source: number) => createTargets(tool).find((c) => c.source === source)?.label ?? catalog[source]!.path;

  return (
    <SettingsCard
      title={t(group.label)}
      badge={{ text: String(items.length), on: false }}
      hint={t(group.hint)}
      actions={
        <>
          {g === 'skill' && (
            <Button variant="soft" color="gray" onClick={() => toggle('install')}>
              {t('Buscar skills para instalar')}
            </Button>
          )}
          {permissions.length > 0 && (
            <Button variant="soft" color="gray" onClick={() => toggle('permission')}>
              {t('Nova regra de permissão')}
            </Button>
          )}
          {hooks.length > 0 && (
            <Button variant="soft" color="gray" onClick={() => toggle('hook')}>
              {t('Novo hook')}
            </Button>
          )}
          {mcps.length > 0 && (
            <Button variant="soft" color="gray" onClick={() => toggle('mcp')}>
              {t('Novo servidor')}
            </Button>
          )}
          {creatable.length > 0 && !agentsTable && (
            <Button variant="soft" color="gray" onClick={() => toggle('new')}>
              {t('Novo')}
            </Button>
          )}
        </>
      }
    >
      {g === 'hook' && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t('Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.')}
          </Callout.Text>
        </Callout.Root>
      )}
      {g === 'plugin' && (
        <div className="muted small">
          {t('Plugins são instalados e removidos pela própria ferramenta, {where}:', { where: t(PLUGIN_COMMANDS[tool].where) })}
          <ul>
            {PLUGIN_COMMANDS[tool].commands.map((c) => (
              <li key={c}>
                <code>{t(c)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {g === 'mcp' && tool === 'claude' && scope === 'user' && (
        <p className="muted small">
          {rich(
            'Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code: <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.',
          )}
        </p>
      )}
      {scope === 'project' && (g === 'mcp' || g === 'skill') && <BoardInstall key={tool} artifact={g} tool={tool} items={all} />}
      {g === 'skill' &&
        scope === 'project' &&
        projectTool &&
        !all.some((i) => i.kind === 'skill' && i.scope === 'project' && i.name === REFERENCE_SKILL.name) && (
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
      {g === 'skill' && (open === key('install') || state.harnessInstall) && <InstallSkills key={tool} tool={tool} />}
      {open === key('new') && creatable.length > 0 && (
        <NewItem key={tool} tool={tool} kind={catalog[creatable[0]!.source]!.kind} targets={creatable} onClose={() => onOpen(null)} />
      )}
      {open === key('hook') && hooks.length > 0 && <NewHook key={tool} tool={tool} targets={hooks} onClose={() => onOpen(null)} />}
      {open === key('mcp') && mcps.length > 0 && <NewMcpServer key={tool} tool={tool} targets={mcps} onClose={() => onOpen(null)} />}
      {open === key('permission') && permissions.length > 0 && (
        <NewPermission key={tool} tool={tool} targets={permissions} onClose={() => onOpen(null)} />
      )}
      {agentsTable ? (
        <AgentsTable tool={aiToolInfo(tool)} scope={scope} />
      ) : (
        <ul className="item-list">
          {items.map((i) => (
            <ItemRow
              key={keyOf(i)}
              tool={tool}
              item={i}
              actions={actions}
              explain
              usage={projectTool ? <UsageSelect item={i} /> : undefined}
              filesOpen={filesOpen === i.path}
              onToggleFiles={() => setFilesOpen(filesOpen === i.path ? null : i.path)}
            />
          ))}
          {notes.map((n) => (
            <li key={n.name} className="item-row harness-note">
              <span className="item-check" />
              <div className="item-main">
                <div className="item-title">
                  <span className="item-name">{t(n.name)}</span>
                  <Badge color="gray" variant="outline">
                    {t('sem arquivo')}
                  </Badge>
                </div>
                <p className="item-explain">{t(n.hint)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!agentsTable && items.length === 0 && notes.length === 0 && <p className="muted small scope-empty">{t('Nada aqui ainda.')}</p>}
      {absent.length > 0 && (
        <div className="harness-absent">
          <span className="muted small">{t('A ferramenta também leria, se existissem:')}</span>
          {absent.map(({ src, source }) => (
            <Button
              key={source}
              variant="ghost"
              size="1"
              title={t(src.hint ?? '')}
              aria-label={t('Criar {path}', { path: location(source) })}
              onClick={() => createFile(source)}
            >
              {t('Criar {path}', { path: location(source) })}
            </Button>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
