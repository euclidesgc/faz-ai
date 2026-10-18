import { baseValue } from '../../../../shared/harness';
import { useEffect, useState } from 'react';
import { Badge, Callout, Checkbox } from '@radix-ui/themes';
import { REFERENCE_SKILL, baseInfo, type AiTool, type HarnessItem, type HarnessScope } from '../../../../shared/harness';
import {
  HARNESS_CATALOG,
  HARNESS_NOTES,
  PLUGIN_COMMANDS,
  createTargets,
  hookTargets,
  importPath,
  instructionRoles,
  mcpTargets,
  permissionTargets,
  type HARNESS_GROUPS,
} from '../../../../shared/harnessCatalog';
import { selectionKey } from '../../../../shared/harnessSelection';
import { matchesQuery } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconWarning } from '../../ui';
import { SettingsCard } from '../SettingsCard';
import { AgentsTable } from './AgentsTable';
import { BoardInstall } from './BoardInstall';
import { BulkActions, bulkSelectable } from './BulkActions';
import { InstallSkills } from './InstallSkills';
import { ItemRow } from './ItemRow';
import { NewHook } from './NewHook';
import { NewItem } from './NewItem';
import { NewMcpServer } from './NewMcpServer';
import { NewPermission } from './NewPermission';
import { PluginGroup } from './PluginGroup';
import { UsageSelect } from './UsageSelect';
import type { ItemActions } from './useItemActions';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** Chave estável de uma linha: o mesmo arquivo pode trazer várias entradas (hooks, regras de permissão). */
const keyOf = (i: HarnessItem) => `${i.path}|${i.name}|${i.detail ?? ''}`;

interface Props {
  group: (typeof HARNESS_GROUPS)[number];
  tool: AiTool;
  /** a fonte que a aba mostra; em Importados não há fonte fixa do catálogo, só os itens achados na pasta */
  scope: HarnessScope;
  /** a busca da tela: com texto, só aparece o que casa e as sugestões de criar ficam de fora */
  query: string;
  /** o resultado de "Indicar artefatos" (`selectionKey` → motivo): pré-seleciona as linhas e mostra o motivo */
  suggested?: Record<string, string>;
  /** os itens deste grupo nesta aba, já filtrados pela busca */
  items: HarnessItem[];
  /** todos os itens da ferramenta, para saber o que já foi copiado ou instalado */
  all: HarnessItem[];
  actions: ItemActions;
  /** formulário aberto na aba: um por vez, e abrir um fecha o outro */
  open: string | null;
  onOpen: (key: string | null) => void;
}

/**
 * Um grupo de um assunto, na origem Projeto, Global ou Importados (Regras principais, Skills, Hooks…): o que é, os itens com a frase
 * de cada um e o caminho que abre no editor do board, os arquivos que a ferramenta leria mas ainda não
 * existem, os avisos do que não fica em arquivo e as ações de criar do grupo.
 */
export function HarnessGroupCard({ group, tool, scope, query, suggested, items, all, actions, open, onOpen }: Props) {
  const state = useBoardStore((s) => s.state)!;
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  // linhas marcadas para as ações em massa, pela chave da linha
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const g = group.id;
  const projectTool = tool === state.board.aiTool;
  const catalog = baseValue(HARNESS_CATALOG, tool) ?? [];
  const sources = catalog.flatMap((src, source) => (src.group === g && src.scope === scope ? [{ src, source }] : []));
  const searching = query.trim() !== '';
  const notes = (baseValue(HARNESS_NOTES, tool) ?? []).filter(
    (n) => n.group === g && n.scope === scope && matchesQuery(query, n.name, n.hint),
  );
  // por padrão o Claude Code lê o AGENTS.md do projeto só quando não há CLAUDE.md, .claude/CLAUDE.md nem CLAUDE.local.md
  const { claudeMd, agentsMd } = g === 'main' && scope === 'project' ? instructionRoles(tool, all) : { claudeMd: [], agentsMd: [] };
  // arquivo fixo que a ferramenta leria, mas que ainda não existe: dá para criar daqui
  const absent = searching
    ? []
    : sources.filter(
        ({ src, source }) =>
          src.layout === 'file' &&
          !src.noCreate &&
          !items.some((i) => i.source === source) &&
          !(src.role === 'agents-md' && claudeMd.length > 0),
      );
  // um CLAUDE.md que importa o AGENTS.md com @ faz ele entrar junto
  const unread = (i: HarnessItem) =>
    claudeMd[0] && agentsMd.includes(i) && !claudeMd.some((c) => c.imports?.some((x) => x.path === i.path))
      ? t(
          'Por padrão, o Claude Code não lê este arquivo nas suas conversas, porque o projeto tem {claude}. Para ler os dois, importe com @{path} no {claude} ou mude Project instructions no /config do Claude Code.',
          { claude: claudeMd[0].location, path: importPath(claudeMd[0].location, i.location) },
        )
      : undefined;
  const creatable = createTargets(tool).filter((c) => c.scope === scope && c.layout !== 'file' && catalog[c.source]!.group === g);
  const hooks = g === 'hook' ? hookTargets(tool).filter((x) => x.scope === scope) : [];
  const mcps = g === 'mcp' ? mcpTargets(tool).filter((x) => x.scope === scope) : [];
  const permissions = g === 'settings' ? permissionTargets(tool).filter((x) => x.scope === scope) : [];
  // os agentes da ferramenta do projeto têm a tabela própria, com a marcação, o padrão e o editor do board
  const agentsScope = scope === 'project' || scope === 'user' ? scope : null;
  const agentsTable = g === 'agent' && projectTool && !!baseInfo(tool).agents && agentsScope !== null;

  // plugins e a política da organização são só leitura; os agentes da ferramenta do projeto têm a tabela própria
  const pickable = g === 'plugin' || g === 'managed' || agentsTable ? [] : items.filter((i) => bulkSelectable(i, actions, true));
  const chosen = pickable.filter((i) => picked.has(keyOf(i)));
  const pick = (list: HarnessItem[], on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      for (const i of list) {
        if (on) next.add(keyOf(i));
        else next.delete(keyOf(i));
      }
      return next;
    });

  // uma indicação nova pré-seleciona o que a IA apontou (e só isso); descartar limpa
  useEffect(() => {
    setPicked(new Set(suggested ? pickable.filter((i) => selectionKey(i) in suggested).map(keyOf) : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  if (g === 'managed' && items.length === 0 && notes.length === 0) return null;
  if (searching && !agentsTable && items.length === 0 && notes.length === 0) return null;
  if (g !== 'plugin' && items.length === 0 && sources.length === 0 && notes.length === 0) return null;

  const key = (what: string) => `${g}:${what}`;
  const toggle = (what: string) => onOpen(open === key(what) ? null : key(what));
  const createFile = (source: number) => harness.createItem(tool, source, '', '');
  const location = (source: number) => createTargets(tool).find((c) => c.source === source)?.label ?? catalog[source]!.path;

  return (
    <SettingsCard
      title={t(group.label)}
      badge={{ text: String(g === 'plugin' ? items.filter((i) => i.kind === 'plugin').length : items.length), on: false }}
      hint={t(group.hint)}
      actions={
        <>
          {g === 'skill' && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Procura skills numa pasta ou num repositório git e mostra a lista antes de copiar qualquer coisa.')}
              onClick={() => toggle('install')}
            >
              {t('Buscar skills para instalar')}
            </ActionButton>
          )}
          {permissions.length > 0 && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Acrescenta uma regra de permissão ao arquivo de configurações da ferramenta.')}
              onClick={() => toggle('permission')}
            >
              {t('Nova regra de permissão')}
            </ActionButton>
          )}
          {hooks.length > 0 && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Acrescenta um hook ao arquivo de configurações da ferramenta.')}
              onClick={() => toggle('hook')}
            >
              {t('Novo hook')}
            </ActionButton>
          )}
          {mcps.length > 0 && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Registra um servidor MCP no arquivo da ferramenta.')}
              onClick={() => toggle('mcp')}
            >
              {t('Novo servidor')}
            </ActionButton>
          )}
          {creatable.length > 0 && !agentsTable && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Cria um arquivo novo deste assunto na pasta da ferramenta e o abre para editar.')}
              onClick={() => toggle('new')}
            >
              {t('Novo')}
            </ActionButton>
          )}
        </>
      }
    >
      {g === 'hook' && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t('Um hook é um comando que a ferramenta roda sozinha no seu computador. Só acrescente comandos que você conhece.')}
          </Callout.Text>
        </Callout.Root>
      )}
      {g === 'plugin' && (baseValue(PLUGIN_COMMANDS, tool) ?? undefined) && (
        <div className="muted small">
          {t('Plugins são instalados pela própria ferramenta, {where}:', {
            where: t((baseValue(PLUGIN_COMMANDS, tool) ?? undefined)!.where),
          })}
          <ul>
            {(baseValue(PLUGIN_COMMANDS, tool) ?? undefined)!.commands.map((c) => (
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
      {scope === 'project' && !searching && (g === 'mcp' || g === 'skill') && (
        <BoardInstall key={`board-install:${tool}`} artifact={g} tool={tool} items={all} />
      )}
      {g === 'skill' &&
        scope === 'project' &&
        !searching &&
        projectTool &&
        !all.some((i) => i.kind === 'skill' && i.scope === 'project' && i.name === REFERENCE_SKILL.name) && (
          <div className="row">
            <span className="muted small">
              {rich(
                'Modelos de classe e exemplos de código ficam bem numa skill própria, só quando indicada: os arquivos vão em <code>references/</code> e os cards que a indicam recebem os caminhos.',
              )}
            </span>
            <ActionButton
              variant="ghost"
              size="1"
              hint={t('Cria a skill de referências do projeto, com a pasta references/ para modelos e exemplos.')}
              onClick={() => harness.createReferenceSkill()}
            >
              {t('Criar skill de modelos')}
            </ActionButton>
          </div>
        )}
      {g === 'skill' && (open === key('install') || state.harnessInstall) && <InstallSkills key={`install-skills:${tool}`} tool={tool} />}
      {open === key('new') && creatable.length > 0 && (
        <NewItem
          key={`new-item:${tool}`}
          tool={tool}
          kind={catalog[creatable[0]!.source]!.kind}
          targets={creatable}
          onClose={() => onOpen(null)}
        />
      )}
      {open === key('hook') && hooks.length > 0 && (
        <NewHook key={`new-hook:${tool}`} tool={tool} targets={hooks} onClose={() => onOpen(null)} />
      )}
      {open === key('mcp') && mcps.length > 0 && (
        <NewMcpServer key={`new-mcp:${tool}`} tool={tool} targets={mcps} onClose={() => onOpen(null)} />
      )}
      {open === key('permission') && permissions.length > 0 && (
        <NewPermission key={`new-permission:${tool}`} tool={tool} targets={permissions} onClose={() => onOpen(null)} />
      )}
      {agentsTable ? (
        <AgentsTable tool={baseInfo(tool)} scope={agentsScope!} query={query} />
      ) : g === 'plugin' ? (
        <PluginGroup tool={tool} items={items} actions={actions} />
      ) : (
        <>
          {pickable.length > 0 && (
            <div className="item-list-head" role="toolbar" aria-label={t('Ações nos itens marcados')}>
              <label className="item-check-all">
                <Checkbox
                  aria-label={t('Selecionar todos: {group}', { group: t(group.label) })}
                  checked={chosen.length === pickable.length ? true : chosen.length > 0 ? 'indeterminate' : false}
                  onCheckedChange={(v) => pick(pickable, v === true)}
                />
                <span className="muted small">{chosen.length > 0 ? t('{n} marcados', { n: chosen.length }) : t('Selecionar todos')}</span>
              </label>
              {chosen.length > 0 && <BulkActions items={chosen} actions={actions} projectTool={true} onDone={() => setPicked(new Set())} />}
            </div>
          )}
          <ul className="item-list">
            {items.map((i) => (
              <ItemRow
                key={keyOf(i)}
                tool={tool}
                item={i}
                actions={actions}
                selected={picked.has(keyOf(i))}
                onSelect={pickable.includes(i) ? (on) => pick([i], on) : undefined}
                explain
                unread={unread(i)}
                usage={
                  i.kind === 'agent' ? (
                    <ActionButton
                      variant="soft"
                      size="1"
                      hint={t('Copia este agente para a biblioteca do board.')}
                      onClick={() => harness.setSelection([{ kind: 'agent', location: selectionKey(i) }], 'contextual')}
                    >
                      {t('Enviar para o board')}
                    </ActionButton>
                  ) : (
                    <UsageSelect item={i} />
                  )
                }
                suggestion={suggested?.[selectionKey(i)]}
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
        </>
      )}
      {!agentsTable && items.length === 0 && notes.length === 0 && <p className="muted small scope-empty">{t('Nada aqui ainda.')}</p>}
      {absent.length > 0 && (
        <div className="harness-absent">
          <span className="muted small">{t('Você pode criar:')}</span>
          <ul>
            {absent.map(({ src, source }) => (
              <li key={source}>
                <ActionButton
                  variant="ghost"
                  size="1"
                  hint={t('Cria este arquivo na pasta indicada e o abre para editar.')}
                  onClick={() => createFile(source)}
                >
                  {t('Criar {path}', { path: location(source) })}
                </ActionButton>
                {src.hint && <span className="muted small">{t(src.hint)}</span>}
              </li>
            ))}
          </ul>
          {agentsMd[0] && claudeMd.length === 0 && (
            <Callout.Root color="amber" size="1">
              <Callout.Icon>
                <IconWarning />
              </Callout.Icon>
              <Callout.Text>
                {t(
                  'O Claude Code está lendo o {path}. Criar um CLAUDE.md ou CLAUDE.local.md faz ele parar de ler, a menos que o arquivo novo importe com @{path}.',
                  { path: agentsMd[0].location },
                )}
              </Callout.Text>
            </Callout.Root>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
