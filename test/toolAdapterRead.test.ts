import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSource } from '../src/extension/artifactSource';
import { adapterFor } from '../src/extension/toolAdapters';
import type { ExportSource } from '../src/extension/toolAdapters/types';
import type { ExportKind } from '../src/shared/toolExport';

const TOOLS = ['claude', 'cursor', 'kimi'] as const;
const tmps: string[] = [];
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-read-'));
  tmps.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const src = (kind: ExportKind, name: string, body: string): ExportSource => ({
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
    meta: { skills: [], mcpServers: [], model: '', tools: { categories: [], native: { tool: '', allow: [], deny: [] } } },
  } as ExportSource['artifact'],
  body,
  files: [],
  isDefaultAgent: false,
});

const write = (base: string, rel: string, data: string | Buffer): void => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), data);
};

describe('leitor dos adaptadores: list', () => {
  it.each(TOOLS)('%s: o que render grava, list encontra e readSource lê', (tool) => {
    const a = adapterFor(tool)!;
    const base = tmp();
    const skill = src('skill', 'revisar', '---\nname: revisar\ndescription: Revisa o diff\n---\nPassos\n');
    const agent = src('agent', 'rev', 'Instruções do agente\n');
    for (const [kind, s] of [
      ['skill', skill],
      ['agent', agent],
    ] as const)
      for (const f of a.render(kind, [s], 'project').files) write(base, f.rel, f.data);
    const listed = a.list('project', base);
    expect(listed.map((l) => l.kind).sort()).toEqual(['agent', 'skill']);
    const sk = listed.find((l) => l.kind === 'skill')!;
    expect(sk.scope).toBe('project');
    const draft = readSource(sk, { projectDir: base, homeDir: base }, tool);
    expect(draft.missing).toBe(false);
    expect(draft.name).toBe('revisar');
    expect(draft.description).toBe('Revisa o diff');
    expect(draft.body).toContain('Passos');
    const ag = readSource(
      listed.find((l) => l.kind === 'agent')!,
      { projectDir: base, homeDir: base },
      tool,
    );
    expect(ag.name).toBe('rev');
    expect(ag.body).toContain('Instruções do agente');
  });

  it('regras: Claude (.claude/rules e CLAUDE.md), Cursor (.mdc) e Kimi (AGENTS.md)', () => {
    const base = tmp();
    write(base, '.claude/rules/estilo.md', 'x');
    write(base, 'CLAUDE.md', 'y');
    write(base, '.cursor/rules/estilo.mdc', 'x');
    write(base, '.cursor/rules/ignorada.md', 'x');
    write(base, 'AGENTS.md', 'z');
    expect(
      adapterFor('claude')!
        .list('project', base)
        .map((l) => l.location),
    ).toEqual(['CLAUDE.md', '.claude/rules/estilo.md']);
    expect(
      adapterFor('cursor')!
        .list('project', base)
        .map((l) => l.location),
    ).toEqual(['.cursor/rules/estilo.mdc']);
    expect(
      adapterFor('kimi')!
        .list('project', base)
        .map((l) => l.location),
    ).toEqual(['AGENTS.md']);
  });

  it('skill feita à mão, no destino do usuário, ganha ~/', () => {
    const home = tmp();
    write(home, '.claude/skills/manual/SKILL.md', '---\nname: manual\ndescription: Feita à mão\n---\nCorpo\n');
    const listed = adapterFor('claude')!.list('user', home);
    expect(listed).toEqual([{ kind: 'skill', location: '~/.claude/skills/manual/SKILL.md', scope: 'user' }]);
    expect(readSource(listed[0], { projectDir: home, homeDir: home }, 'claude').description).toBe('Feita à mão');
  });

  it('pasta ausente dá lista vazia e link para fora é ignorado', () => {
    const base = tmp();
    const outside = tmp();
    for (const t of TOOLS) expect(adapterFor(t)!.list('project', base)).toEqual([]);
    write(outside, 'x.md', 'segredo');
    fs.mkdirSync(path.join(base, '.claude/agents'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'x.md'), path.join(base, '.claude/agents/fora.md'));
    expect(adapterFor('claude')!.list('project', base)).toEqual([]);
  });
});

describe('leitor dos adaptadores: mcpFiles', () => {
  it.each([
    ['claude', ['.mcp.json'], ['~/.claude.json']],
    ['cursor', ['.cursor/mcp.json'], ['~/.cursor/mcp.json']],
    ['kimi', ['.kimi-code/mcp.json'], ['~/.kimi-code/mcp.json']],
  ] as const)('%s', (tool, project, user) => {
    expect(adapterFor(tool)!.mcpFiles('project', '/x')).toEqual(project);
    expect(adapterFor(tool)!.mcpFiles('user', '/x')).toEqual(user);
  });
});
