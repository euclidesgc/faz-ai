import { isFlowSkill } from '../flowSkill';
import {
  catalogTool,
  profileLabel,
  activeProfile,
  contextEnforced,
  isolationSummary,
  profileIsolation,
  type AiProfile,
} from '../../shared/aiProfiles';
import { orchestratesStory } from '../../shared/orchestration';
import { resolveRunTarget } from '../../shared/runTarget';
import { agentOfArtifact } from '../../shared/artifacts';
import { EXEC_ASPECTS, effortToRun, enforcementOf, manifestOf } from '../../shared/execution';
import type { HarnessItem } from '../../shared/harness';
import { isSelectableKind, selectionKey, usageOf, toolItemsOf } from '../../shared/harnessSelection';
import { groupOf } from '../../shared/harnessCatalog';
import { norm } from '../../shared/filters';
import { activeComments } from '../../shared/conversation';
import {
  describeRule,
  modelFieldOf,
  modelLabel,
  parseModelValue,
  resolveModelInput,
  suggestModel,
  type ModelOption,
} from '../../shared/models';
import { aiQueue, humanQueue, pendingWork } from '../../shared/pending';
import { childProgress, linkedCards, openPredecessors, subtaskWaves } from '../../shared/links';
import { childrenOf, columnOf, columnsOf, isArchived, isLive, valueOf } from '../../shared/selectors';
import { statusInfo } from '../../shared/status';
import { isAtYoloStop, isYolo, lastAiColumn, storyOf, yoloStopOf } from '../../shared/story';
import { isBoardField } from '../../shared/boardFields';
import { slug } from '../../shared/git';
import { prBaseOf, type PrBase } from '../../shared/gitflow';
import {
  cardRef,
  type BoardState,
  type Card,
  type CardType,
  type Column,
  type FieldDef,
  type FieldValue,
  type Workflow,
} from '../../shared/model';

/** Converte o snapshot em respostas enxutas para o modelo: nomes e números no lugar de UUIDs. */

const same = (a: string, b: string): boolean => norm(a.trim()) === norm(b.trim());
const list = (names: string[]): string => names.map((n) => `"${n}"`).join(', ');

export function findCard(s: BoardState, ref: string | number): Card {
  const n = Number(String(ref).trim().replace(/^#/, ''));
  const card = Number.isInteger(n) ? s.cards.find((c) => c.number === n) : undefined;
  if (!card) throw new Error(`Card ${String(ref)} não encontrado.`);
  return card;
}

export function findWorkflow(s: BoardState, name: string): Workflow {
  const wf = s.workflows.find((w) => w.id === name || same(w.name, name) || w.kind === name);
  if (!wf) throw new Error(`Workflow "${name}" não encontrado. Existentes: ${list(s.workflows.map((w) => w.name))}.`);
  return wf;
}

/** Coluna pelo nome; `workflowId` desfaz a ambiguidade quando os dois workflows têm colunas de mesmo nome. */
export function findColumn(s: BoardState, name: string, workflowId?: string): Column {
  const pool = s.columns.filter((c) => !workflowId || c.workflowId === workflowId);
  const found = pool.filter((c) => c.id === name || same(c.name, name));
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Error(`Há mais de uma coluna "${name}"; informe também o workflow.`);
  throw new Error(`Coluna "${name}" não encontrada. Existentes: ${list(pool.map((c) => c.name))}.`);
}

export function findType(s: BoardState, name: string): CardType {
  const t = s.cardTypes.find((x) => x.id === name || same(x.name, name));
  if (!t) throw new Error(`Tipo de card "${name}" não encontrado. Existentes: ${list(s.cardTypes.map((x) => x.name))}.`);
  return t;
}

export function findField(s: BoardState, name: string): FieldDef {
  // aceita o nome exato ou um começo de nome que só um campo tenha (ex.: "Esforço" → "Esforço da atividade")
  const starts = s.fieldDefs.filter((x) => norm(x.name).startsWith(norm(name.trim())));
  const f = s.fieldDefs.find((x) => x.id === name || same(x.name, name)) ?? (name.trim() && starts.length === 1 ? starts[0] : undefined);
  if (!f) throw new Error(`Campo "${name}" não encontrado. Existentes: ${list(s.fieldDefs.map((x) => x.name))}.`);
  return f;
}

const TRIAGE_FIELDS = ['Tags', 'Esforço da atividade', 'Modelo', 'Skills'];

const isEmpty = (v: FieldValue): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Um card novo, sem nenhum dos quatro campos de triagem preenchido, ainda não passou pela triagem automática. */
export function needsTriage(s: BoardState, c: Card): boolean {
  const fields = TRIAGE_FIELDS.map((name) => findField(s, name)).filter(
    (f) => f.appliesToTypes === null || f.appliesToTypes.includes(c.typeId),
  );
  return fields.every((f) => isEmpty(valueOf(s, c.id, f.id)));
}

/** Valida e normaliza o valor de um campo conforme o seu tipo. */
export function coerceFieldValue(f: FieldDef, value: unknown, catalog: ModelOption[], profile?: AiProfile): FieldValue {
  if (value === null || value === undefined || value === '') return null;
  const option = (v: unknown): string => {
    const o = f.options.find((x) => same(x, String(v)));
    if (!o) throw new Error(`Valor "${String(v)}" inválido para o campo "${f.name}". Opções: ${list(f.options)}.`);
    return o;
  };
  switch (f.kind) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`O campo "${f.name}" espera um número.`);
      return n;
    }
    case 'checkbox':
      return value === true || value === 'true';
    case 'select':
      return option(value);
    case 'multiselect':
      return (Array.isArray(value) ? value : [value]).map(option);
    case 'model':
      return resolveModelInput(catalog, String(value), profile);
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`O campo "${f.name}" espera uma data no formato AAAA-MM-DD.`);
      return String(value);
    default:
      return String(value);
  }
}

const iso = (t: number): string => new Date(t).toISOString();

export function cardStatus(s: BoardState, c: Card): string {
  if (c.deletedAt !== null) return 'trashed';
  if (c.archivedAt !== null) return 'archived';
  return columnOf(s, c)?.category ?? 'open';
}

function fieldsOf(s: BoardState, c: Card): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const v of s.fieldValues) {
    if (v.cardId !== c.id) continue;
    const def = s.fieldDefs.find((f) => f.id === v.fieldId);
    if (def) out[def.name] = def.kind === 'model' ? modelLabel(s.board.modelCatalog, v.value, true) : v.value;
  }
  return out;
}

/** Status de trabalho do card e com quem está a pendência. */
export function workStatus(s: BoardState, c: Card) {
  if (!c.status) return undefined;
  return {
    status: c.status,
    label: s.board.appearance.statuses[c.status].label,
    with: statusInfo(c.status).owner,
    ...(c.statusReason ? { reason: c.statusReason } : {}),
  };
}

/** Cards vinculados (pai, filhos, relativos e dependências), com o progresso dos filhos; vazio quando o card não tem vínculos. */
function linksOf(s: BoardState, c: Card) {
  const l = linkedCards(s, c.id);
  const line = (k: Card) => ({ id: cardRef(k), title: k.title, column: columnOf(s, k)?.name, status: cardStatus(s, k) });
  if (!l.parents.length && !l.children.length && !l.related.length && !l.predecessors.length && !l.successors.length) return {};
  const p = childProgress(s, c.id);
  return {
    links: {
      ...(l.parents.length ? { parents: l.parents.map(line) } : {}),
      ...(l.children.length ? { children: l.children.map(line), childrenProgress: `${p.done}/${p.total} encerrados` } : {}),
      ...(l.related.length ? { related: l.related.map(line) } : {}),
      ...(l.predecessors.length ? { dependsOn: l.predecessors.map(line) } : {}),
      ...(l.successors.length ? { precedes: l.successors.map(line) } : {}),
    },
  };
}

/** O modo autônomo da história do card e, quando ele não vai até o fim, a coluna em que ele para. */
function autonomyOf(s: BoardState, c: Card) {
  if (!isYolo(s, c)) return {};
  const story = storyOf(s, c) ?? c;
  const stop = yoloStopOf(s, story);
  return stop && stop.id !== lastAiColumn(s, story.workflowId)?.id
    ? { autonomous: true, autonomousUntil: stop.name }
    : { autonomous: true };
}

/** A história de que esta é uma entrega derivada; vazio quando não é. */
function derivedOf(s: BoardState, c: Card) {
  const from = c.derivedFrom ? s.cards.find((k) => k.id === c.derivedFrom) : undefined;
  return from ? { derivedFrom: `${cardRef(from)} ${from.title}` } : {};
}

/** Linha de listagem: o suficiente para decidir qual card abrir. */
export function cardSummary(s: BoardState, c: Card) {
  const parent = c.parentId ? s.cards.find((p) => p.id === c.parentId) : undefined;
  const kids = childrenOf(s, c.id);
  const checklist = s.checklistItems.filter((i) => i.cardId === c.id);
  return {
    id: cardRef(c),
    title: c.title,
    type: s.cardTypes.find((t) => t.id === c.typeId)?.name,
    workflow: s.workflows.find((w) => w.id === c.workflowId)?.name,
    column: columnOf(s, c)?.name,
    status: cardStatus(s, c),
    ...(workStatus(s, c) ? { work: workStatus(s, c) } : {}),
    ...autonomyOf(s, c),
    ...(parent ? { parent: `${cardRef(parent)} ${parent.title}` } : {}),
    ...derivedOf(s, c),
    ...(Object.keys(fieldsOf(s, c)).length ? { fields: fieldsOf(s, c) } : {}),
    ...(kids.length ? { subtasks: `${kids.filter((k) => cardStatus(s, k) !== 'open').length}/${kids.length} fora de aberto` } : {}),
    ...(checklist.length ? { checklist: `${checklist.filter((i) => i.done).length}/${checklist.length}` } : {}),
    // dependências ainda abertas: enquanto houver, o card não pode começar
    ...(openPredecessors(s, c.id).length ? { waitingFor: openPredecessors(s, c.id).map(cardRef) } : {}),
    ...(linkedCards(s, c.id).children.length
      ? { linkedChildren: `${childProgress(s, c.id).done}/${childProgress(s, c.id).total} encerrados` }
      : {}),
  };
}

/** Um valor de modelo aberto em partes que a IA consegue usar para escolher o subagente. */
export function describeModel(s: BoardState, value: FieldValue) {
  const v = parseModelValue(value);
  const o = v && s.board.modelCatalog.find((x) => x.id === v.id);
  if (!v || !o) return { value };
  return { tool: o.tool, model: o.model, effort: effortToRun(o, v.effort), label: modelLabel(s.board.modelCatalog, value, true), value };
}

/**
 * O alvo da execução do card como a IA o lê: o perfil de CLI (`tool`), o modelo e de onde veio (`from`).
 * Sai da mesma resolução do runner (`resolveRunTarget`); no perfil padrão sem modelo não há bloco. Uma escolha
 * explícita inválida não cai para o próximo nível: vem o valor escolhido com o `blocked` e o motivo.
 */
function targetModelOf(s: BoardState, c: Card) {
  const r = resolveRunTarget(s, c);
  if (r.blocked) {
    const { source, value, reason, message } = r.block;
    return { ...describeModel(s, value), from: source, blocked: { reason, message } };
  }
  const { cli, model, value, source } = r.target;
  if (!model || (source !== 'card' && source !== 'agent' && source !== 'rule')) return null;
  const parsed = parseModelValue(value);
  const option = parsed && s.board.modelCatalog.find((o) => o.id === parsed.id && o.tool === catalogTool(cli));
  const effort = option ? effortToRun(option, model.effort) : model.effort;
  const base = option ? modelLabel(s.board.modelCatalog, value) : model.name;
  return { tool: cli.id, model: model.name, effort, label: `${profileLabel(s.board, cli.id)} · ${base}`, value, from: source };
}

/** Catálogo de modelos e regras de sugestão do board. */
export function modelsOverview(s: BoardState) {
  return {
    profiles: s.board.aiProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      base: p.base,
      enabled: p.enabled,
      default: s.board.aiTool === p.id,
      measures: p.base === 'claude' ? 'cost' : p.base === 'generic' ? 'none' : 'tokens',
    })),
    catalog: s.board.modelCatalog.map((o) => ({
      value: o.id,
      tool: o.tool,
      model: o.model,
      label: o.label,
      efforts: o.efforts,
      defaultEffort: o.defaultEffort,
    })),
    rules: s.board.modelRules.map((r) => ({
      ...(r.name ? { name: r.name } : {}),
      when: describeRule(s, r),
      suggest: modelLabel(s.board.modelCatalog, r.model, true),
      value: r.model,
      enabled: r.enabled,
    })),
    note: 'Num card, `value` usa `<perfil>:<modelo>@<esforço>` (ex.: "claude:opus@high"). A cópia usa o catálogo do perfil pronto de origem; o perfil personalizado aceita modelo livre.',
  };
}

/**
 * O que a CLI do perfil ativo carrega por conta própria (declarado) e se o contexto vazio está imposto
 * (capacidades verificadas pelo host). Lista vazia = nenhum item conhecido, nunca prova de isolamento.
 */
function cliLoadsOf(s: BoardState) {
  const profile = activeProfile(s.board);
  const iso = profileIsolation(profile);
  return {
    contextEnforced: contextEnforced(profile),
    loads: iso.loads,
    ...(iso.unrecognized ? { unrecognized: iso.unrecognized } : {}),
    summary: isolationSummary(iso),
    note: 'Os artefatos do board chegam pelo pedido e pelo MCP. O que está em `loads` a CLI também lê por conta própria e pode divergir do board: em conflito, vale o que o board entregou. Sem `contextEnforced`, não há prova de que a conversa começou sem artefatos externos.',
  };
}

/** O que a sessão deve usar neste card, segundo o agente do card (o do card, o da fase ou o padrão do board). */
function executionOf(s: BoardState, c: Card) {
  const m = manifestOf(s, c);
  if (!m.profile) return { execution: { cliLoads: cliLoadsOf(s) } };
  // o que o board impõe vem do perfil de CLI que executa o card, não do padrão do board
  const how = enforcementOf(m.target.cli);
  const profile = s.board.execProfiles.find((p) => p.name === m.profile);
  return {
    execution: {
      profile: m.profile,
      ...(profile && profile.scope !== 'builtin' ? { agentFile: profile.path } : {}),
      ...(m.purpose ? { purpose: m.purpose } : {}),
      mcpServers: ['faz-ai', ...m.mcpServers],
      ...(m.tools.length ? { tools: m.tools } : {}),
      ...(m.deniedTools.length ? { deniedTools: m.deniedTools } : {}),
      cliLoads: cliLoadsOf(s),
      enforcedByBoardRun: EXEC_ASPECTS.filter((a) => how[a.id] === 'enforced').map((a) => a.id),
      note: 'Agente do card (`agentFile` tem as instruções). Fora da execução pelo board, siga-o como instrução: leia o arquivo e use só os servidores e ferramentas listados; `enforcedByBoardRun` são impostos só pelo board. Skill faz-ai-harness-do-card.',
    },
  };
}

/** Itens do harness da ferramenta com que o projeto trabalha. */
const toolItems = toolItemsOf;

/** Arquivos de apoio da skill (referências, modelos, scripts), com o caminho ao lado do SKILL.md. */
function supportFiles(skillMd: string, files: string[]) {
  const dir = skillMd.replace(/\/?SKILL\.md$/, '');
  return files.length ? { files: files.map((f) => `${dir}/${f}`) } : {};
}

/** Rules marcadas no campo "Rules" do card (arquivos de instruções do Harness): obrigatórias na execução. */
export function requiredRules(s: BoardState, c: Card) {
  return manifestOf(s, c).rules.map((location) => {
    const item = toolItems(s).find((i) => i.kind === 'instructions' && i.location === location);
    return item ? { name: location, scope: item.scope, path: item.path } : { name: location, note: 'rule fora do board ou não encontrada' };
  });
}

/** Aponta o fluxo do board em `get_card` e `get_pending_work`: quem não leu as instruções do servidor ainda o encontra. */
export const FLOW_NOTE = 'Fluxo do board: get_skill faz-ai-fluxo (as skills faz-ai-* também vêm por get_skill).';

/** Skills marcadas no campo "Skills" do card e as do agente: obrigatórias na execução. */
export function requiredSkills(s: BoardState, c: Card) {
  // as skills do card somam às do agente
  return manifestOf(s, c).skills.map((name) => {
    // a skill do fluxo vem do texto do board pelo get_skill; uma cópia instalada na pasta da ferramenta é ignorada
    if (isFlowSkill(name)) return { name, scope: 'board', via: 'get_skill' };
    if (s.harness.library) {
      const copy = toolItems(s).find((i) => i.kind === 'skill' && i.name === name);
      return copy
        ? { name, scope: copy.boardArtifactId ? 'board' : copy.scope, path: copy.path, ...supportFiles(copy.path, copy.files ?? []) }
        : { name, note: 'skill não encontrada' };
    }
    const skill = s.harness.skills.find((k) => k.name === name);
    if (skill) {
      const files = toolItems(s).find((i) => i.kind === 'skill' && i.scope === 'project' && i.location === skill.path)?.files ?? [];
      return { name, scope: 'project', path: skill.path, ...supportFiles(skill.path, files) };
    }
    // fora do projeto: skill global ou de plugin da ferramenta em uso, com o caminho absoluto
    const outside = toolItems(s).find((i) => i.kind === 'skill' && i.scope !== 'project' && i.name === name);
    return outside
      ? {
          name,
          scope: outside.scope,
          path: outside.path,
          ...(outside.plugin ? { plugin: outside.plugin } : {}),
          ...supportFiles(outside.path, outside.files ?? []),
        }
      : { name, note: 'skill não encontrada' };
  });
}

/**
 * Os documentos das fases anteriores que a história não tem: ela foi criada ou movida direto para uma
 * fase adiante (o caminho curto de uma história pequena) e começou dali.
 */
function missingArtifacts(s: BoardState, story: Card, col: Column): string[] {
  return columnsOf(s, story.workflowId)
    .filter((k) => k.position < col.position && k.category === 'open' && k.aiActive && k.artifactName)
    .map((k) => k.artifactName)
    .filter((name) => !s.attachments.some((a) => a.cardId === story.id && a.artifact && same(a.filename, name)));
}

/**
 * Onde a Homologação grava o registro de decisão da história, quando o board liga os registros (Git →
 * registros de decisão): um arquivo por história, pelo número, para a decisão ficar no repositório.
 */
function decisionRecordOf(s: BoardState, story: Card, col: Column) {
  const dir = s.board.git.decisionRecords;
  if (!dir || col.id !== lastAiColumn(s, story.workflowId)?.id) return {};
  const path = `${dir}/${String(story.number).padStart(4, '0')}-${slug(story.title) || 'historia'}.md`;
  return {
    decisionRecord: {
      path,
      note: `Antes de abrir o pull request, grave em ${path} o registro de decisão desta história, a partir da Spec aprovada e dos desvios do plano: Contexto, Decisão, Alternativas descartadas (com o motivo de cada uma), Consequências e os diagramas Mermaid do desenho do programa. Se o arquivo já existe (a história voltou), atualize-o. Faça o commit na branch da história e cite o arquivo no corpo do PR.`,
    },
  };
}

/** " com --base <prBase>" para a nota do modo autônomo; sem a base conhecida (história sem branch, repositório não detectado), manda ler workspace.prBase */
function prBaseClause(s: BoardState, story: Card): string {
  const base = prBaseOf(s, story)?.prBase;
  return base ? ` com --base ${base}` : ' com --base em workspace.prBase do get_card';
}

/**
 * A fase em que o card está: o que a IA deve fazer e o documento que a fase produz. Numa
 * sub-tarefa, é a fase da história, porque o artefato é construído na sub-tarefa mas pertence à história.
 */
function phaseOf(s: BoardState, c: Card) {
  const story = storyOf(s, c) ?? c;
  const col = columnOf(s, story);
  if (!col || !col.aiActive || (!col.aiInstruction && !col.artifactName)) return undefined;
  const missing = missingArtifacts(s, story, col);
  return {
    name: col.name,
    ...(col.aiInstruction ? { instruction: col.aiInstruction } : {}),
    ...(missing.length
      ? {
          missingArtifacts: missing,
          missingArtifactsNote: `Sem ${list(missing)} das fases anteriores: trabalhe pela descrição, conversa e código; não os crie nem bloqueie.`,
        }
      : {}),
    ...(col.artifactName
      ? {
          artifact: { filename: col.artifactName, ...(col.artifactTemplate ? { template: col.artifactTemplate } : {}) },
          artifactNote: `Construa o documento numa sub-tarefa com Fase = "${col.name}" e grave-o com add_attachment (artifact: true, filename: "${col.artifactName}").`,
        }
      : {}),
    ...decisionRecordOf(s, story, col),
    // no modo autônomo só a coluna até onde a pessoa liberou o modo pede aprovação; a última coluna da IA entrega pelo pull request
    requiresApproval: (col.requiresApproval && !story.yolo) || isAtYoloStop(s, story),
    ...(story.yolo
      ? {
          autonomousNote: isAtYoloStop(s, story)
            ? `Modo autônomo (YOLO) na história ${cardRef(story)} até ${col.name}, a fase atual: faça o trabalho sem perguntas e, ao terminar, chame request_review na história com o resumo e pare (o modo se desliga). Detalhes: skill faz-ai-modo-autonomo.`
            : col.id === lastAiColumn(s, story.workflowId)?.id
              ? `Modo autônomo (YOLO) na história ${cardRef(story)}: última coluna da IA. Envie a branch, abra o pull request${prBaseClause(s, story)}, registre-o com set_pull_request e pare, sem avançar o card. Detalhes: skill faz-ai-modo-autonomo.`
              : `Modo autônomo (YOLO) na história ${cardRef(story)}: ninguém aprova nem responde, nem com pendência. Ao terminar a fase, registre na conversa o que fez e as decisões, e mova o card para a próxima coluna. Detalhes: skill faz-ai-modo-autonomo.`,
        }
      : col.requiresApproval
        ? { reviewNote: `Ao terminar, chame request_review na história ${cardRef(story)} e pare.` }
        : {}),
  };
}

/**
 * A base do pull request (#462): sempre que a história tem branch, a IA lê aqui para onde abri-lo. Sem repositório
 * detectado e com a base vazia (história anterior ao gitflow), `prBase` fica de fora e a nota manda usar a principal.
 */
function prBaseFields(base: PrBase | null, stackedOnLive: boolean) {
  if (!base) return {};
  if (!base.prBase) {
    return { prNote: 'Abra o pull request contra a branch principal do repositório.' };
  }
  return {
    baseBranch: base.baseBranch,
    prBase: base.prBase,
    prNote: `Abra o pull request com --base ${base.prBase}.`,
    ...(stackedOnLive
      ? {
          stackNote: `Empilhada sobre ${base.baseBranch}: diga no pull request de qual ele depende.`,
        }
      : {}),
  };
}

/** Onde o código da história deve ser alterado (sub-tarefas usam a branch e a pasta da história). */
function workspaceOf(s: BoardState, c: Card) {
  const story = storyOf(s, c) ?? c;
  if (story.branch) {
    const base = prBaseOf(s, story);
    return {
      workspace: {
        branch: story.branch,
        path: story.worktreePath,
        ...prBaseFields(
          base,
          // a nota só vale enquanto a história da base está viva: já concluída, o PR dela foi mesclado e não há do que depender
          !!base?.stacked &&
            s.cards.some((o) => o.id !== story.id && !o.parentId && o.branch === story.baseBranch && cardStatus(s, o) === 'open'),
        ),
        ...(story.prUrl ? { pullRequest: story.prUrl } : {}),
        ...(story.mergeCommit ? { mergeCommit: story.mergeCommit } : {}),
        note:
          s.board.git.mode === 'worktree'
            ? `Altere o código só em ${story.worktreePath} (branch ${story.branch}) e faça os commits lá.`
            : `Trabalhe na branch ${story.branch} (git switch antes de alterar o código).`,
      },
    };
  }
  return s.board.git.mode === 'off'
    ? {}
    : {
        workspaceNote: 'Sem branch ainda: antes de alterar código, chame prepare_workspace (skill faz-ai-workspace-e-pr).',
      };
}

/** O que fazer com o `model` do card; o "Esforço da atividade" tem o mesmo nome e outro sentido. */
const MODEL_NOTE =
  'O valor do modelo usa `<perfil>:<modelo>@<esforço>` do perfil de CLI do board. `tool` é o perfil de CLI que executa o card pelo board e `from` diz de onde veio a escolha (card, agente ou regra). Você não troca de CLI: a sub-tarefa roda no perfil dela, numa execução do board. Execute com este modelo e esforço; se forem outros, avise a pessoa. "Esforço da atividade" é o tamanho da tarefa, outra coisa. Skill faz-ai-harness-do-card.';

/**
 * Os blocos do `get_card` que a IA pode pedir em separado (`only`): o resto (título, descrição, campos,
 * modelo, harness e pasta de trabalho) vem sempre. Sem `only`, vem tudo.
 */
export const CARD_SECTIONS = ['phase', 'subtasks', 'checklist', 'links', 'conversation', 'attachments'] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];

export function cardDetail(
  s: BoardState,
  c: Card,
  attachmentPath: (a: BoardState['attachments'][number]) => string,
  only?: readonly CardSection[],
) {
  const wants = (section: CardSection) => !only || only.includes(section);
  const skills = requiredSkills(s, c);
  const rules = requiredRules(s, c);
  const phase = isLive(c) && wants('phase') ? phaseOf(s, c) : undefined;
  const attachment = (a: BoardState['attachments'][number]) => ({
    attachmentId: a.id,
    filename: a.filename,
    mime: a.mime,
    size: a.size,
    path: attachmentPath(a),
    ...(a.artifact ? { artifact: true } : {}),
  });
  const field = modelFieldOf(s, c);
  const chosen = field ? valueOf(s, c.id, field.id) : undefined;
  const suggested = suggestModel(s, c);
  const target = targetModelOf(s, c);
  return {
    ...cardSummary(s, c),
    flowNote: FLOW_NOTE,
    ...(target ? { model: { ...target, note: MODEL_NOTE } } : {}),
    ...(suggested && suggested !== chosen ? { suggestedModel: describeModel(s, suggested) } : {}),
    harnessNote:
      'Escolha skills, rules, MCPs e agente só entre o que está em "Pelo card" (get_harness), o mínimo necessário. Skill faz-ai-harness-do-card.',
    ...(rules.length ? { requiredRules: rules, requiredRulesNote: 'Leia cada arquivo em `path` antes de executar.' } : {}),
    ...(skills.length
      ? {
          requiredSkills: skills,
          requiredSkillsNote:
            'Leia o SKILL.md de cada skill em `path` antes de executar, mesmo as fora da sua lista; sem `path` (`via: "get_skill"`), leia com get_skill; `files` são apoio.',
        }
      : {}),
    ...(phase ? { phase } : {}),
    ...(s.harness.library && manifestOf(s, c).mcpServers.length
      ? {
          mcpGateway: {
            server: 'faz-ai',
            list: 'list_board_mcp_tools',
            call: 'call_board_mcp_tool',
            card: `#${c.number}`,
            servers: manifestOf(s, c).mcpServers,
          },
        }
      : {}),
    ...executionOf(s, c),
    ...workspaceOf(s, c),
    description: c.description,
    ...(c.questions.length
      ? { pendingQuestions: c.questions.map(({ question, options, recommended }) => ({ question, options, recommended })) }
      : {}),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    ...(wants('subtasks')
      ? {
          subtaskList: childrenOf(s, c.id)
            .sort((a, b) => a.number - b.number)
            .map((k) => ({
              id: cardRef(k),
              title: k.title,
              column: columnOf(s, k)?.name,
              status: cardStatus(s, k),
              ...(workStatus(s, k) ? { work: workStatus(s, k) } : {}),
              fields: fieldsOf(s, k),
              ...(openPredecessors(s, k.id).length ? { waitingFor: openPredecessors(s, k.id).map(cardRef) } : {}),
            })),
          // o que da Implementação pode rodar agora, ao mesmo tempo, o que espera outra sub-tarefa terminar e o
          // que não é da IA agora (com a pessoa ou já rodando)
          ...subtasksNow(s, c.id),
        }
      : {}),
    ...(wants('checklist')
      ? { checklistItems: s.checklistItems.filter((i) => i.cardId === c.id).map((i) => ({ itemId: i.id, text: i.text, done: i.done })) }
      : {}),
    ...(wants('links') ? linksOf(s, c) : {}),
    ...(wants('conversation')
      ? {
          // a partir do último resumo: as mensagens anteriores já estão nele e só inchariam o contexto
          comments: activeComments(s.comments, c.id).map((m) => ({
            commentId: m.id,
            author: m.author,
            ...(m.source ? { from: m.source } : {}),
            ...(m.kind === 'summary' ? { kind: 'summary' } : {}),
            at: iso(m.createdAt),
            body: m.body,
          })),
        }
      : {}),
    ...(wants('attachments')
      ? {
          attachments: s.attachments.filter((a) => a.cardId === c.id).map(attachment),
          // os artefatos das fases ficam na história; a sub-tarefa os enxerga por aqui
          ...(c.parentId ? { storyArtifacts: s.attachments.filter((a) => a.cardId === c.parentId && a.artifact).map(attachment) } : {}),
        }
      : {}),
  };
}

/**
 * Como conduzir as rodadas da Implementação. Fica no get_card, ao lado de `subtasksNow`, e não nas instruções
 * do servidor: o Claude Code as corta em 2.048 caracteres, e a IA só precisa disto quando há rodada.
 */
export const SUBTASKS_NOW_NOTE =
  'O board executa as sub-tarefas da fase de código, cada uma numa execução própria: `byBoard` são as que ele executa, na ordem; `waiting` esperam outra; ' +
  '`withPerson` e `running` não são suas. Não execute sub-tarefas, nem por subagente: crie-as e pare. O board chama você de novo, uma vez, para o fechamento. ' +
  'Detalhes: skill faz-ai-implementacao-rodadas.';

/**
 * As rodadas da Implementação: `canRunTogether` só traz as sub-tarefas que a IA pode tocar agora; as que
 * estão com a pessoa (`withPerson`) ou já em execução (`running`) vêm em grupos separados, só quando houver.
 */
function subtasksNow(s: BoardState, storyId: string) {
  const w = subtaskWaves(s, storyId);
  const story = s.cards.find((c) => c.id === storyId);
  const byBoard = !!story && orchestratesStory(s, story);
  if (!w.waiting.length && !w.withPerson.length && !w.running.length && w.ready.length < 2) return {};
  return {
    subtasksNow: {
      // numa fase de código o board executa as sub-tarefas (uma por vez, na ordem); nas demais a sessão as toca
      ...(byBoard ? { byBoard: w.ready.map(cardRef) } : { canRunTogether: w.ready.map(cardRef) }),
      waiting: w.waiting.map(cardRef),
      ...(w.withPerson.length ? { withPerson: w.withPerson.map(cardRef) } : {}),
      ...(w.running.length ? { running: w.running.map(cardRef) } : {}),
    },
    subtasksNowNote: SUBTASKS_NOW_NOTE,
  };
}

/** A fila da IA (o que fazer agora) e, para contexto, o que está esperando a pessoa. */
export function pendingOverview(s: BoardState) {
  const p = pendingWork(s);
  const lastHuman = (c: Card) => {
    const m = s.comments.filter((x) => x.cardId === c.id).at(-1);
    return m ? { lastMessage: { author: m.author, at: iso(m.createdAt), body: m.body } } : {};
  };
  const queue = aiQueue(s, p);
  return {
    flowNote: FLOW_NOTE,
    forYou: {
      approved: p.ai.approved.map((c) => cardSummary(s, c)),
      unanswered: p.ai.unanswered.map((c) => ({ ...cardSummary(s, c), ...lastHuman(c) })),
      ready: p.ai.ready.map((c) => cardSummary(s, c)),
    },
    order: queue.map(cardRef),
    withPerson: humanQueue(s, p).map((c) => cardSummary(s, c)),
    next: queue.length
      ? 'Siga a ordem de order (bug primeiro, depois a coluna mais à direita, e na mesma coluna de cima para baixo); approved, unanswered e ready dizem o que fazer com cada card dessa ordem. Não mexa no que está em withPerson.'
      : 'Nada pendente com você. Encerre sem alterar o board.',
  };
}

const profileName = (s: BoardState, id: string | null) => (id ? s.board.execProfiles.find((p) => p.id === id)?.name : undefined);

export function boardOverview(s: BoardState) {
  const active = s.cards.filter(isLive);
  return {
    board: s.board.name,
    workflows: s.workflows.map((w) => ({
      name: w.name,
      kind: w.kind === 'parent' ? 'parent (histórias)' : 'child (sub-tarefas, sempre ligadas a uma história)',
      columns: s.columns
        .filter((c) => c.workflowId === w.id)
        .map((c) => ({
          name: c.name,
          category: c.category,
          cards: active.filter((k) => k.columnId === c.id).length,
          ...(c.aiActive ? { aiActive: true } : {}),
          ...(c.requiresApproval ? { requiresApproval: true } : {}),
          ...(c.artifactName ? { artifact: c.artifactName } : {}),
          ...(profileName(s, c.execProfile) ? { execProfile: profileName(s, c.execProfile) } : {}),
        })),
    })),
    // os agentes do board: arquivos de agente marcados como disponíveis no Harness (ou o embutido, sem nenhum)
    agents: s.board.execProfiles.map((p) => ({
      name: p.id,
      ...(p.isDefault ? { default: true } : {}),
      ...(p.purpose ? { description: p.purpose } : {}),
      ...(p.skills.length ? { skills: p.skills } : {}),
      ...(p.mcpServers.length ? { mcpServers: p.mcpServers } : {}),
      ...(p.tools.length ? { tools: p.tools } : {}),
      ...(p.model ? { model: p.model } : {}),
      ...(p.scope !== 'builtin' ? { scope: p.scope, path: p.path } : {}),
    })),
    cardTypes: s.cardTypes.map((t) => {
      const defaults = Object.fromEntries(
        Object.entries(t.defaults).flatMap(([id, v]) => {
          const f = s.fieldDefs.find((x) => x.id === id);
          return f ? [[f.name, v]] : [];
        }),
      );
      return {
        name: t.name,
        color: t.color,
        workflow: s.workflows.find((w) => w.id === t.defaultWorkflowId)?.name,
        ...(Object.keys(defaults).length ? { defaultFields: defaults } : {}),
      };
    }),
    fields: s.fieldDefs.map((f) => ({
      name: f.name,
      kind: f.kind,
      // campo do board: as regras e a IA dependem dele, e só a exibição (e as opções de Tags) muda
      ...(isBoardField(f) ? { board: true } : {}),
      ...(f.options.length ? { options: f.options } : {}),
      appliesTo: f.appliesToTypes === null ? 'todos os tipos' : f.appliesToTypes.map((id) => s.cardTypes.find((t) => t.id === id)?.name),
      display: f.display,
    })),
    rules: s.board.rules,
    archivedCards: s.cards.filter(isArchived).length,
    trashedCards: s.cards.filter((c) => c.deletedAt !== null).length,
  };
}

/**
 * O harness da ferramenta em uso, com a marcação do board. Por padrão só o que está marcado (é o que
 * as execuções enxergam); com `onlySelected` falso, tudo que a ferramenta carrega, com `usage` em cada item.
 */
export function harnessOverview(s: BoardState, onlySelected = true) {
  const usage = (i: HarnessItem) => (isSelectableKind(i.kind) ? usageOf(s.harnessSelection, i) : null);
  const sourceItems = s.harness.inventory.find((t) => t.tool === s.board.aiTool)?.items ?? [];
  // o que dá para importar: o inventário da ferramenta em uso que ainda não está no board
  const inBoardOrigin = new Set((s.harness.library?.artifacts ?? []).map((a) => a.origin).filter(Boolean));
  const importable = sourceItems.filter(
    (i) => isSelectableKind(i.kind) && !usage(i) && !inBoardOrigin.has(selectionKey(i)) && !inBoardOrigin.has(i.location),
  );
  const inventory = onlySelected ? toolItems(s).filter((i) => usage(i)) : importable;
  // os agentes do board (no banco); os arquivos da ferramenta que ainda não estão nele aparecem no inventário importável
  const boardAgents = s.harness.library
    ? s.harness.library.artifacts.filter((a) => a.kind === 'agent' && !a.missing).map((a) => agentOfArtifact(a, s.board.aiTool))
    : null;
  const agents = boardAgents ?? s.harness.agents;
  const inBoard = (a: { location: string }) => !!boardAgents?.some((b) => b.location === a.location);
  return {
    library: s.harness.library ? { directory: s.harness.library.directory, artifacts: s.harness.library.artifacts } : undefined,
    aiTool: s.board.aiTool,
    cliLoads: cliLoadsOf(s),
    defaultAgent: s.board.execProfiles.find((p) => p.isDefault)?.id ?? null,
    note: onlySelected
      ? 'Só o que está no board (Configurações → Harness): é tudo o que as execuções do board usam. `usage` "always" (Sempre) entra em toda execução; "contextual" (Pelo card) só quando indicado no card (campos Rules, Skills e MCPs) ou escolhido no planejamento e no refinar; "off" (Desligado) está no board sem entrar em nada. Para ver tudo que a ferramenta carrega, chame get_harness com onlySelected = false.'
      : 'O que dá para importar: o que a ferramenta em uso carrega nesta máquina (projeto, pasta do usuário, plugins e pastas importadas) e ainda não está no board, com a `key` de cada item (`usage` null = fora do board, invisível para as execuções). Para trazer um item, chame set_harness_selection com a `key` e o modo. `rules`, `skills` e `agents` são o que já está no board.',
    // as regras do board, pelo nome que read_rule_file e write_rule_file usam
    rules: (s.harness.library?.artifacts ?? [])
      .filter((a) => a.kind === 'rule' && !a.missing)
      .map((a) => ({ name: a.name, usage: a.usage, ...(a.size === undefined ? {} : { bytes: a.size }), path: a.path })),
    skills: s.harness.library
      ? toolItems(s)
          .filter((i) => i.kind === 'skill' && usage(i))
          .map((i) => ({
            name: i.name,
            usage: usage(i),
            description: i.description,
            path: i.path,
            ...(i.files?.length ? { files: i.files } : {}),
          }))
      : s.harness.skills.map((k) => ({ name: k.name, usage: null, description: k.description, path: k.path })),
    agents: agents
      .filter((a) => usageOf(s.harnessSelection, { kind: 'agent', location: a.location }))
      .map((a) => ({
        name: a.name,
        scope: a.scope,
        description: a.description,
        ...(a.modelValue ? { model: a.modelValue } : a.model ? { model: a.model } : {}),
        ...(a.skills.length ? { skills: a.skills } : {}),
        ...(a.tools.length ? { tools: a.tools } : {}),
        ...(a.mcp.length ? { mcpServers: a.mcp } : {}),
        usage: usageOf(s.harnessSelection, { kind: 'agent', location: a.location }),
        path: inBoard(a) ? a.path : a.location,
      })),
    // o que a ferramenta em uso carrega, com o escopo (project, user, plugin ou imported) e o modo no board
    inventory: inventory.map((i) => ({
      ...(i.boardArtifactId ? { id: i.boardArtifactId } : {}),
      kind: i.kind,
      // o grupo em que a tela de Harness mostra o item (main, topic, memory, skill… plugin, managed)
      group: groupOf(s.board.aiTool, i),
      scope: i.scope,
      name: i.name,
      // a identidade do item no board (para set_harness_selection): o caminho; num servidor MCP, `arquivo#nome`
      ...(isSelectableKind(i.kind) ? { usage: usage(i), key: selectionKey(i) } : {}),
      ...(i.mode ? { mode: i.mode } : {}),
      ...(i.files?.length ? { files: i.files } : {}),
      ...(i.description ? { description: i.description } : {}),
      path: i.boardArtifactId ? i.path : i.location,
      ...(i.plugin ? { plugin: i.plugin } : {}),
    })),
  };
}
