import { describe, expect, it } from 'vitest';
import type { AgentMeta } from '../src/shared/artifacts';
import { TOOL_ADAPTERS, adapterFor } from '../src/extension/toolAdapters';
import type { ExportSource } from '../src/extension/toolAdapters/types';
import type { ExportKind, LossCode } from '../src/shared/toolExport';

const TOOLS = ['claude', 'cursor', 'kimi'] as const;
const agentMeta = (over: Partial<AgentMeta> = {}): AgentMeta => ({
  skills: [],
  mcpServers: [],
  model: '',
  tools: { categories: [], native: { tool: '', allow: [], deny: [] } },
  ...over,
});
const src = (kind: ExportKind, name: string, over: Record<string, unknown> = {}, body = 'Corpo\n', meta: unknown = {}): ExportSource => ({
  artifact: {
    id: name,
    kind,
    name,
    description: `Descrição de ${name}`,
    usage: 'contextual',
    origin: '',
    originTool: '',
    missing: false,
    skipped: [],
    files: [],
    body: '',
    createdAt: 0,
    updatedAt: 0,
    meta,
    ...over,
  } as ExportSource['artifact'],
  body,
  files: [],
  isDefaultAgent: false,
});
const agent = (meta: Partial<AgentMeta>, over: Record<string, unknown> = {}) => src('agent', 'rev', over, 'Instruções\n', agentMeta(meta));
const lossCodes = (tool: string, s: ExportSource) =>
  adapterFor(tool)!
    .losses(s)
    .map((l) => l.code);
const text = (tool: string, s: ExportSource, target: 'project' | 'user' = 'project') =>
  adapterFor(tool)!
    .render(s.artifact.kind as ExportKind, [s], target)
    .files.map((f) => f.data.toString());

describe('registro', () => {
  it('tem as três ferramentas e nenhuma outra', () => {
    expect(Object.keys(TOOL_ADAPTERS).sort()).toEqual([...TOOLS]);
    expect(adapterFor('copilot')).toBeUndefined();
  });
});

describe('caminhos', () => {
  it.each(TOOLS)('%s: regra, skill e agente ficam dentro da pasta da ferramenta', (tool) => {
    const a = adapterFor(tool)!;
    for (const kind of ['rule', 'skill', 'agent'] as const) {
      const s = src(kind, 'x', {}, '---\nname: x\ndescription: d\n---\nB');
      for (const f of a.render(kind, [s], 'project').files) expect(f.rel.startsWith(`${a.root}/`)).toBe(true);
    }
  });
  it('caminhos exatos', () => {
    const rel = (tool: string, kind: ExportKind, name: string) =>
      adapterFor(tool)!
        .render(kind, [src(kind, name)], 'project')
        .files.map((f) => f.rel);
    expect(rel('claude', 'rule', 'CLAUDE.md')).toEqual(['.claude/rules/claude.md']);
    expect(rel('cursor', 'rule', 'CLAUDE.md')).toEqual(['.cursor/rules/claude.mdc']);
    expect(rel('kimi', 'rule', 'CLAUDE.md')).toEqual(['.kimi-code/AGENTS.md']);
    expect(rel('claude', 'agent', 'rev')).toEqual(['.claude/agents/rev.md']);
    expect(rel('cursor', 'agent', 'rev')).toEqual(['.cursor/agents/rev.md']);
    expect(rel('kimi', 'agent', 'rev')).toEqual(['.kimi-code/agents/rev.md']);
    expect(rel('kimi', 'skill', 'rev')[0]).toBe('.kimi-code/skills/rev/SKILL.md');
    expect(adapterFor('cursor')!.skillDir('rev')).toBe('.cursor/skills/rev');
  });
  it('Cursor: regra no destino do usuário não é suportada', () => {
    const a = adapterFor('cursor')!;
    expect(a.supports('rule', 'user')).toBe(false);
    expect(a.render('rule', [src('rule', 'r')], 'user')).toEqual({ files: [], refused: [{ id: 'r', reason: 'unsupported' }] });
    expect(a.supports('agent', 'user')).toBe(true);
  });
  it('nome inseguro e arquivo de apoio fora da pasta são recusados', () => {
    const bad = src('skill', 'a/b');
    expect(adapterFor('claude')!.render('skill', [bad], 'project').refused).toEqual([{ id: 'a/b', reason: 'unsafe-name' }]);
    const up = { ...src('skill', 'ok'), files: [{ path: '../x', content: 'x', encoding: 'utf8' as const, size: 1 }] };
    expect(adapterFor('claude')!.render('skill', [up], 'project').refused).toEqual([{ id: 'ok', reason: 'unsafe-path' }]);
  });
  it('duas regras com o mesmo slug: a segunda é duplicate', () => {
    const r = adapterFor('claude')!.render('rule', [src('rule', 'A/CLAUDE.md'), src('rule', 'B/claude.md')], 'project');
    expect(r.files).toHaveLength(1);
    expect(r.refused).toEqual([{ id: 'B/claude.md', reason: 'duplicate' }]);
  });
});

describe('renderização', () => {
  it('regras do Kimi vão juntas, na ordem do nome', () => {
    const r = adapterFor('kimi')!.render('rule', [src('rule', 'b', {}, 'Segunda'), src('rule', 'a', {}, 'Primeira')], 'user');
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.data.toString()).toBe('Primeira\n\nSegunda\n');
    expect(r.files[0]!.from).toEqual(['a', 'b']);
  });
  it('.mdc do Cursor: alwaysApply por modo; da mesma origem vai como está', () => {
    const always = text('cursor', src('rule', 'r', { usage: 'always' }, '---\npaths: x\n---\nT'))[0]!;
    expect(always).toContain('alwaysApply: true');
    expect(always).not.toContain('paths');
    expect(text('cursor', src('rule', 'r', { usage: 'contextual' }))[0]).toContain('alwaysApply: false');
    expect(text('cursor', src('rule', 'r', { originTool: 'cursor' }, '---\nglobs: *.ts\n---\nT'))[0]).toBe('---\nglobs: *.ts\n---\nT');
  });
  it('SKILL.md byte a byte quando completo; acrescenta name/description quando faltam', () => {
    const full = '---\nname: s\ndescription: d\n---\n\nX';
    expect(text('claude', src('skill', 's', {}, full))[0]).toBe(full);
    expect(text('kimi', src('skill', 's', {}, 'Só texto'))[0]).toContain('name: "s"');
  });
  it('agente: chaves de cada formato e nenhum faz-ai-* nem mcp__faz-ai__', () => {
    const meta = {
      model: 'claude:opus@high',
      skills: ['s1'],
      mcpServers: ['github'],
      tools: { categories: [], native: { tool: 'claude', allow: ['Read', 'Grep'], deny: ['Bash'] } },
    } satisfies Partial<AgentMeta>;
    const c = text('claude', agent(meta))[0]!;
    expect(c).toContain('tools: Read, Grep');
    expect(c).toContain('disallowedTools: Bash');
    expect(c).toContain('model: opus');
    expect(c).toContain('effort: high');
    expect(c).toContain('mcpServers: ["github"]');
    expect(c).toContain('skills: ["s1"]');
    const cu = text('cursor', agent({ ...meta, readonly: true, background: true }))[0]!;
    expect(cu).toContain('readonly: true');
    expect(cu).toContain('is_background: true');
    expect(cu).not.toContain('tools:');
    const k = text('kimi', agent({ ...meta, tools: { categories: [], native: { tool: 'kimi', allow: ['ReadFile'], deny: [] } } }))[0]!;
    expect(k).toContain('tools: ReadFile');
    for (const t of [c, cu, k]) {
      expect(t).not.toMatch(/faz-ai-|mcp__faz-ai__/);
      expect(t).toContain('Instruções');
    }
  });
});

describe('tabela de equivalências e perdas (RF07)', () => {
  const claudeTools = { tools: { categories: [], native: { tool: 'claude', allow: ['Read'], deny: [] } } } as Partial<AgentMeta>;
  const kimiTools = {
    tools: { categories: [], native: { tool: 'kimi', allow: ['ReadFile', 'mcp__faz-ai__x'], deny: [] } },
  } as Partial<AgentMeta>;
  type Row = { nome: string; s: ExportSource; has: Record<string, boolean[]> };
  // cada linha: [claude, cursor, kimi] diz se o código aparece em `losses`
  const rows: Row[] = [
    { nome: 'ferramentas do Claude', s: agent(claudeTools), has: { tools: [false, true, true], 'board-tools': [true, false, false] } },
    { nome: 'ferramentas do Kimi', s: agent(kimiTools), has: { tools: [true, true, false], 'board-tools': [false, false, false] } },
    { nome: 'MCP', s: agent({ mcpServers: ['gh'] }), has: { mcpServers: [true, true, true] } },
    { nome: 'skills', s: agent({ skills: ['a'] }), has: { skills: [false, true, true] } },
    { nome: 'modelo do Claude', s: agent({ model: 'claude:opus@high' }), has: { model: [false, true, true], effort: [false, true, true] } },
    { nome: 'modelo do Cursor', s: agent({ model: 'cursor:gpt' }), has: { model: [true, false, true] } },
    { nome: 'readonly', s: agent({ readonly: true }), has: { readonly: [true, false, true] } },
    { nome: 'background', s: agent({ background: true }), has: { background: [true, false, true] } },
    { nome: 'agente padrão', s: { ...agent({}), isDefaultAgent: true }, has: { default: [true, true, true] } },
    { nome: 'modo do agente', s: agent({}), has: { usage: [true, true, true] } },
    { nome: 'modo da skill', s: src('skill', 's'), has: { usage: [true, true, true] } },
    {
      nome: 'modo da regra',
      s: src('rule', 'r'),
      has: { 'rule-load': [true, true, true], 'rules-merged': [false, false, true], usage: [false, false, false] },
    },
    { nome: 'cabeçalho de outra ferramenta', s: src('rule', 'r', {}, '---\npaths: x\n---\nT'), has: { 'rule-header': [true, true, true] } },
    {
      nome: 'cabeçalho da mesma ferramenta',
      s: src('rule', 'r', { originTool: 'claude' }, '---\npaths: x\n---\nT'),
      has: { 'rule-header': [false, true, true] },
    },
    {
      nome: 'arquivos que ficaram de fora',
      s: src('skill', 's', { skipped: [{ path: 'big', reason: 'size' }] }),
      has: { 'skipped-files': [true, true, true] },
    },
  ];
  for (const row of rows)
    for (const [code, expected] of Object.entries(row.has))
      it(`${row.nome}: ${code}`, () => {
        TOOLS.forEach((tool, i) => expect(lossCodes(tool, row.s).includes(code as LossCode), `${tool}`).toBe(expected[i]));
      });
  it('lista fechada não ganha mcp__faz-ai__*', () => {
    expect(text('claude', agent(claudeTools))[0]).not.toContain('mcp__faz-ai__');
  });
});

describe('tools neutras na exportação', () => {
  const skillMd = '---\nname: s\ndescription: d\n---\n\nCorpo';
  const lostValue = (tool: string, s: ExportSource) =>
    adapterFor(tool)!
      .losses(s)
      .find((l) => l.code === 'allowed-tools');

  it('Claude: a skill com tools ganha allowed-tools separado por espaço no SKILL.md', () => {
    const out = text('claude', src('skill', 's', { tools: ['read', 'search'] }, skillMd))[0]!;
    expect(out).toBe('---\nname: s\ndescription: d\nallowed-tools: Read Glob Grep\n---\n\nCorpo');
    expect(lossCodes('claude', src('skill', 's', { tools: ['read'] }, skillMd))).not.toContain('allowed-tools');
  });

  it('Claude: o allowed-tools que já está no SKILL.md é trocado, não duplicado', () => {
    const md = '---\nname: s\ndescription: d\nallowed-tools: Bash\n---\nX';
    const out = text('claude', src('skill', 's', { tools: ['read'] }, md))[0]!;
    expect(out.match(/allowed-tools/g)).toHaveLength(1);
    expect(out).toContain('allowed-tools: Read\n');
  });

  it('Claude: a skill sem tools não ganha a linha', () => {
    expect(text('claude', src('skill', 's', { tools: [] }, skillMd))[0]).toBe(skillMd);
    expect(text('claude', src('skill', 's', {}, skillMd))[0]).toBe(skillMd);
  });

  it.each(['cursor', 'kimi'])('%s: a skill sai sem allowed-tools e a prévia avisa a perda', (tool) => {
    const s = src('skill', 's', { tools: ['read', 'search'] }, skillMd);
    expect(text(tool, s)[0]).toBe(skillMd);
    expect(lostValue(tool, s)).toEqual({ code: 'allowed-tools', effect: 'lost', value: 'read search' });
    expect(lostValue(tool, src('skill', 's', { tools: [] }, skillMd))).toBeUndefined();
  });

  it('Claude: o agente com tools neutras grava tools: Read, Glob, Grep, ...', () => {
    const s = agent({ mcpServers: ['github'] }, { tools: ['read', 'search', 'shell', 'delegate', 'mcp'] });
    expect(text('claude', s)[0]).toContain('tools: Read, Glob, Grep, Bash, Agent, mcp__github__*');
  });

  it('Claude: o agente legado com lista nativa do claude mantém a nativa, mesmo com tools neutras', () => {
    const native = { tool: 'claude' as const, allow: ['Read', 'Grep'], deny: ['Bash'] };
    const legacy = agent({ tools: { categories: [], native } });
    expect(text('claude', legacy)[0]).toContain('tools: Read, Grep');
    const mixed = agent({ tools: { categories: [], native } }, { tools: ['shell'] });
    expect(text('claude', mixed)[0]).toContain('tools: Read, Grep');
    expect(text('claude', mixed)[0]).not.toContain('Bash,');
  });

  it('Cursor e Kimi: o agente com tools neutras não grava tools: e avisa allowed-tools perdido', () => {
    const s = agent({}, { tools: ['read', 'shell'] });
    expect(text('cursor', s)[0]).not.toContain('tools:');
    expect(text('kimi', s)[0]).not.toContain('tools:');
    for (const tool of ['cursor', 'kimi']) {
      expect(lostValue(tool, s)).toEqual({ code: 'allowed-tools', effect: 'lost', value: 'read shell' });
      expect(lossCodes(tool, s)).not.toContain('tools');
    }
  });
});
