// Teste de caracterização da execução: fotografa o que um card recebe (agente, ferramentas liberadas e
// negadas, skills, rules, servidores MCP e modelo) a partir de arquivos reais de uma pasta de projeto e de
// uma home. Foi escrito antes da troca da fonte dos artefatos e fica depois dela: provar que o agente, as
// skills, as rules, os servidores e o modelo de antes continuam os mesmos. Só `buildExecutionState` sabe de
// onde o estado vem; as asserções são sobre nomes e conteúdo, nunca sobre o caminho absoluto.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { executionPlan, type BoardServerSpec } from '../src/extension/execution';
import { requiredRules, requiredSkills } from '../src/extension/mcp/format';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { FLOW_LINE, contextLines } from '../src/extension/promptContext';
import type { ModelOption } from '../src/shared/models';
import type { BoardState, Card } from '../src/shared/model';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const AGENT = 'revisor';
const SKILL = 'revisar-codigo';
const RULE = 'estilo';
const BOARD_SERVER: BoardServerSpec = { command: 'node', args: ['board-server.js'], env: { FAZ_AI_SOCKET: '/tmp/faz.sock' } };
const MEMORIA = { command: 'memoria-mcp', args: ['--db', 'mem.sqlite'], env: { MEMORIA_TOKEN: 'segredo-123' } };
const GITHUB = { command: 'gh-mcp', args: [] as string[] };
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0xc3, 0x28]); // não é UTF-8 válido
const SONNET: ModelOption = {
  id: 'claude:sonnet',
  tool: 'claude',
  model: 'sonnet',
  label: 'Sonnet',
  efforts: ['low', 'medium', 'high'],
  defaultEffort: null,
};

interface Fixture {
  s: BoardState;
  servers: Record<string, unknown>;
  card: Card;
  projectDir: string;
  homeDir: string;
  /** apaga as origens (projeto e home) sem tocar no board */
  removeSources(): void;
  /** relê o board (como a abertura e cada mudança de artefato fazem) */
  reload(): BoardState;
  router: MessageRouter;
  cleanup(): void;
}

/**
 * ÚNICO ponto que monta o estado: grava os arquivos de origem, marca os itens em `harness_selection` pelo
 * caminho que o host usa (`harness.selection.set`) e devolve o `snapshot` com um card pronto para executar.
 * Quando a fonte dos artefatos mudar (cópia no banco), só esta função muda.
 */
async function buildExecutionState(): Promise<Fixture> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-parity-')));
  const projectDir = path.join(root, 'projeto');
  const homeDir = path.join(root, 'home');
  const write = (file: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  // agente do usuário: ferramentas liberadas, negadas, skill, servidor e modelo
  write(
    path.join(homeDir, '.claude', 'agents', `${AGENT}.md`),
    [
      '---',
      `name: "${AGENT}"`,
      'description: "Revisa código com rigor"',
      'tools: Read, Grep, Glob',
      'disallowedTools: Write, Edit',
      'model: sonnet',
      `skills: ${SKILL}`,
      'faz-ai-model: "claude:sonnet@medium"',
      'faz-ai-mcp: memoria',
      '---',
      '',
      'Revise o código sem alterar arquivos.',
      '',
    ].join('\n'),
  );
  // skill de projeto com um arquivo de apoio de texto e uma imagem
  const skillDir = path.join(projectDir, '.claude', 'skills', SKILL);
  write(path.join(skillDir, 'SKILL.md'), `---\nname: ${SKILL}\ndescription: Checklist de revisão\n---\n\nSiga a referência.\n`);
  write(path.join(skillDir, 'referencia.md'), '# Referência\nItens da revisão.\n');
  write(path.join(skillDir, 'logo.png'), PNG_BYTES);
  // a skill do fluxo instalada à mão na pasta da ferramenta: o pedido a ignora (vem por get_skill)
  write(
    path.join(projectDir, '.claude', 'skills', 'faz-ai-fluxo', 'SKILL.md'),
    '---\nname: faz-ai-fluxo\ndescription: Fluxo\n---\n\nCópia velha.\n',
  );
  // instruções: CLAUDE.md em "Sempre" e uma rule pelo card
  write(path.join(projectDir, 'CLAUDE.md'), '# Regras do projeto\nResponda em português.\n');
  write(path.join(projectDir, '.claude', 'rules', `${RULE}.md`), '# Estilo\nSem ponto e vírgula solto.\n');
  // servidores MCP do projeto
  write(path.join(projectDir, '.mcp.json'), JSON.stringify({ mcpServers: { memoria: MEMORIA, github: GITHUB } }));

  const db = await openInMemory(WASM_DIR);
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws-parity',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'attachments'),
    workspaceDir: projectDir,
    homeDir,
  });
  router.handle({ type: 'settings.models.set', catalog: [SONNET] });

  const inventory = () => router.snapshot().harness.inventory.find((t) => t.tool === 'claude')!.items;
  const mark = (kind: 'agent' | 'skill' | 'instructions' | 'mcp', names: string[], usage: 'always' | 'contextual') =>
    router.handle({
      type: 'harness.selection.set',
      items: names.map((n) => ({ kind, location: selectionLocation(inventory(), kind, n) })),
      usage,
    });
  mark('agent', [AGENT], 'contextual');
  mark('skill', [SKILL], 'contextual');
  mark('skill', ['faz-ai-fluxo'], 'always');
  mark('instructions', ['CLAUDE.md'], 'always');
  mark('instructions', [RULE], 'contextual');
  mark('mcp', ['memoria', 'github'], 'contextual');
  for (const [name, server] of Object.entries({ memoria: MEMORIA, github: GITHUB })) {
    const item = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp' && a.name === name)!;
    router.handle({ type: 'harness.library.save', input: { ...router.readLibraryArtifact(item.id), server } });
  }

  // um card com a rule indicada no campo Rules
  const s0 = router.snapshot();
  const wf = s0.workflows.find((w) => w.kind === 'parent')!;
  const cardId = router.createCard({
    typeId: s0.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s0.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId: null,
    title: 'Revisar',
  });
  const rulesField = router.snapshot().fieldDefs.find((f) => f.kind === 'multiselect' && f.name.toLowerCase() === 'rules')!;
  router.handle({ type: 'field.setValue', cardId, fieldId: rulesField.id, value: [selectionLocation(inventory(), 'instructions', RULE)] });

  const s = router.snapshot();
  return {
    s,
    servers: router.libraryMcpDefinitions(),
    card: s.cards.find((c) => c.id === cardId)!,
    router,
    projectDir,
    homeDir,
    removeSources: () => {
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    },
    reload: () => {
      router.refreshHarness();
      return router.snapshot();
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** A identidade do item na marcação, como a tela a manda: `arquivo#nome` para servidor MCP, a localização para o resto. */
function selectionLocation(items: { kind: string; name: string; location: string }[], kind: string, name: string): string {
  const found = items.find((i) => i.kind === kind && i.name === name);
  if (!found) throw new Error(`item de fixture não encontrado: ${kind} ${name}`);
  return kind === 'mcp' ? `${found.location}#${name}` : found.location;
}

/** Tudo o que a execução do card recebe, reduzido a valores comparáveis (sem caminho absoluto). */
function snapshotOf(f: Fixture) {
  const plan = executionPlan(f.s, f.card, f.servers, BOARD_SERVER);
  const lines = contextLines(f.s, f.card);
  return { plan, lines, skills: requiredSkills(f.s, f.card), rules: requiredRules(f.s, f.card) };
}

let fx: Fixture;
beforeEach(async () => {
  fx = await buildExecutionState();
});
afterEach(() => fx.cleanup());

/** As asserções, iguais com a origem presente e (depois da troca) com ela apagada. */
function expectSameExecution(f: Fixture) {
  const { plan, lines, skills, rules } = snapshotOf(f);
  const { input, manifest } = plan;

  // agente
  expect(manifest.profile).toBe(AGENT);
  expect(input.agent).toBe(AGENT);
  expect(input.agentDefinition).toEqual({
    name: AGENT,
    description: 'Revisa código com rigor',
    prompt: 'Revise o código sem alterar arquivos.',
  });
  expect(input.delegates).toEqual([]);

  // ferramentas liberadas e negadas
  expect(input.tools).toEqual(['Read', 'Grep', 'Glob']);
  expect(input.deniedTools).toEqual(['Write', 'Edit']);

  // modelo e esforço
  expect(input.model).toEqual({ name: 'sonnet', effort: 'medium' });

  // servidores: o do board e o que o agente libera, com a definição completa; o outro fica de fora
  expect(input.mcpAllowed).toEqual(['memoria']);
  expect(input.mcpBlocked).toEqual(['github']);
  const servers = JSON.parse(input.mcpConfig!).mcpServers;
  expect(Object.keys(servers)).toEqual(['faz-ai', 'memoria']);
  expect(servers['faz-ai']).toEqual({ type: 'stdio', ...BOARD_SERVER });
  expect(servers.memoria).toEqual(MEMORIA);

  // skills (nome, apoio de texto e imagem) e rules do card
  expect(manifest.skills).toEqual([SKILL]);
  expect(skills).toHaveLength(1);
  expect(skills[0]).toMatchObject({ name: SKILL, scope: 'board' });
  const skill = skills[0]! as { path: string; files?: string[] };
  expect(path.basename(skill.path)).toBe('SKILL.md');
  expect((skill.files ?? []).map((p) => path.basename(p)).sort()).toEqual(['logo.png', 'referencia.md']);
  expect(manifest.rules).toEqual([`.claude/rules/${RULE}.md`]);
  expect(rules.map((r) => r.name)).toEqual([`.claude/rules/${RULE}.md`]);
  expect(rules[0]).toMatchObject({ scope: 'project' });
  expect(path.basename((rules[0] as { path: string }).path)).toBe(`${RULE}.md`);

  // o pedido: CLAUDE.md em "Sempre" no contexto fixo; skill e rule do card no contexto do card
  expect(lines.always).toHaveLength(2);
  expect(lines.always[0]).toBe(FLOW_LINE);
  expect(lines.always[1]).toContain('Contexto fixo deste board');
  expect(lines.always[1]).toContain('rule CLAUDE.md (');
  expect(lines.card).toHaveLength(1);
  expect(lines.card[0]).toContain(`skill ${SKILL} (`);
  expect(lines.card[0]).toContain(`rule .claude/rules/${RULE}.md (`);
  expect(lines.card[0]).toContain('SKILL.md)');

  // resumo e orientações do log da execução
  expect(plan.summary).toContain('Agente do board: revisor (inline)');
  expect(plan.summary).toContain('Fluxo do board: faz-ai-fluxo (pelo MCP)');
  expect(plan.summary).toContain('Contexto fixo: rule CLAUDE.md (pelo pedido)');
  expect(plan.summary).toContain(`Skills: ${SKILL} (pelo pedido)`);
  expect(plan.summary).toContain('Servidores MCP: faz-ai, memoria (imposto pela CLI)');
  expect(plan.summary).toContain('Ferramentas: Read, Grep, Glob (imposto pela CLI)');
  expect(plan.summary).toContain('Ferramentas negadas: Write, Edit (imposto pela CLI)');
  expect(plan.summary).toContain('Modelo: sonnet · medium (imposto pela CLI)');
  expect(plan.advice).toEqual([expect.stringContaining('list_board_mcp_tools')]);
}

describe('paridade da execução: o que o card recebe a partir dos artefatos', () => {
  it('agente, ferramentas, skills, rules, servidores e modelo vêm dos arquivos marcados no board', () => {
    expectSameExecution(fx);
  });

  it('a cópia mantém a execução completa depois de apagar as origens', () => {
    fx.removeSources();
    expectSameExecution(fx);
  });

  it('a pasta da cópia de leitura apagada volta na releitura, e a execução continua igual', () => {
    const skill = (requiredSkills(fx.s, fx.card)[0] as { path: string }).path;
    const directory = fx.s.harness.library!.directory;
    fs.rmSync(directory, { recursive: true, force: true });
    expect(fs.existsSync(skill)).toBe(false);
    const s = fx.reload();
    expect(fs.existsSync(skill)).toBe(true);
    expectSameExecution({ ...fx, s, card: s.cards.find((c) => c.id === fx.card.id)! });
  });
});

describe('pedido igual em toda ferramenta', () => {
  const lineOf = (f: Fixture, tool: 'claude' | 'cursor' | 'kimi') => {
    f.router.handle({ type: 'settings.board.update', patch: { aiTool: tool } });
    const s = f.router.snapshot();
    const card = s.cards.find((c) => c.id === f.card.id)!;
    return { s, card, lines: contextLines(s, card) };
  };

  it('contextLines começa por FLOW_LINE, ignora a faz-ai-fluxo instalada e é o mesmo em claude, cursor e kimi', () => {
    const claude = lineOf(fx, 'claude');
    expect(claude.lines.always[0]).toBe(FLOW_LINE);
    expect(claude.lines.always.join('\n')).not.toContain('SKILL.md');
    expect(claude.lines.always[1]).toContain('rule CLAUDE.md (');
    expect(claude.lines.card[0]).toContain(`skill ${SKILL} (`);
    for (const tool of ['cursor', 'kimi'] as const) {
      const other = lineOf(fx, tool);
      expect(other.lines.always).toEqual(claude.lines.always);
      expect(other.lines.card).toEqual(claude.lines.card);
    }
  });

  it('o resumo marca a origem; no Cursor e no Kimi Code as instruções do agente vão no aviso do pedido', () => {
    const claude = lineOf(fx, 'claude');
    const summary = executionPlan(claude.s, claude.card, fx.servers, BOARD_SERVER).summary;
    expect(summary).toContain('Fluxo do board: faz-ai-fluxo (pelo MCP)');
    expect(summary).toContain('Agente do board: revisor (inline)');
    for (const tool of ['cursor', 'kimi'] as const) {
      const { s, card } = lineOf(fx, tool);
      const plan = executionPlan(s, card, fx.servers, BOARD_SERVER);
      expect(plan.input.agentDefinition).toBeNull();
      expect(plan.summary).toContain('Fluxo do board: faz-ai-fluxo (pelo MCP)');
      expect(plan.summary.join(' | ')).not.toContain('pelo caminho do arquivo');
      expect(plan.advice.join('\n')).toContain('Revise o código sem alterar arquivos.');
    }
  });
});
