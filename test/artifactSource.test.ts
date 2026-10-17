import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMcpByName, readSource, resolveLocation, type SourceDirs } from '../src/extension/artifactSource';
import { FLOW_SKILL } from '../src/extension/flowSkill';
import { scanInventory } from '../src/extension/harnessScan';
import { ARTIFACT_LIMITS, type AgentMeta } from '../src/shared/artifacts';

let root: string;
let dirs: SourceDirs;

const write = (base: string, rel: string, content: string | Buffer) => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const KB = 1024;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-source-')));
  dirs = { projectDir: path.join(root, 'projeto'), homeDir: path.join(root, 'home') };
  fs.mkdirSync(dirs.projectDir);
  fs.mkdirSync(dirs.homeDir);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('resolveLocation', () => {
  it('resolve o caminho relativo ao projeto, a partir de ~ e absoluto', () => {
    expect(resolveLocation('CLAUDE.md', dirs)).toBe(path.join(dirs.projectDir, 'CLAUDE.md'));
    expect(resolveLocation('~/.claude/CLAUDE.md', dirs)).toBe(path.join(dirs.homeDir, '.claude', 'CLAUDE.md'));
    const abs = path.join(root, 'importada', 'AGENTS.md');
    expect(resolveLocation(abs, dirs)).toBe(abs);
  });
});

describe('readSource', () => {
  it('regra: o arquivo inteiro, com a location como nome', () => {
    write(dirs.projectDir, 'CLAUDE.md', '# Regras\n\nUse português.\n');
    const d = readSource({ kind: 'instructions', location: 'CLAUDE.md' }, dirs, 'claude');
    expect(d).toMatchObject({
      kind: 'rule',
      name: 'CLAUDE.md',
      description: '',
      body: '# Regras\n\nUse português.\n',
      origin: 'CLAUDE.md',
      originTool: 'claude',
      missing: false,
      skipped: [],
      files: [],
    });
  });

  it('skill: SKILL.md inteiro, descrição do frontmatter e arquivos de apoio em ordem, com binário em base64', () => {
    const md = '---\nname: revisar\ndescription: "Revisa o código: estilo e testes"\n---\n\nCorpo\n';
    write(dirs.projectDir, '.claude/skills/revisar/SKILL.md', md);
    write(dirs.projectDir, '.claude/skills/revisar/zz.md', 'fim');
    write(dirs.projectDir, '.claude/skills/revisar/refs/guia.md', 'guia ç');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]);
    write(dirs.projectDir, '.claude/skills/revisar/logo.png', png);
    const d = readSource({ kind: 'skill', location: '.claude/skills/revisar/SKILL.md' }, dirs, 'claude');
    expect(d).toMatchObject({ kind: 'skill', name: 'revisar', description: 'Revisa o código: estilo e testes', body: md, missing: false });
    expect(d.files.map((f) => f.path)).toEqual(['logo.png', 'refs/guia.md', 'zz.md']);
    expect(d.files[0]).toEqual({ path: 'logo.png', content: png.toString('base64'), encoding: 'base64', size: png.length });
    expect(d.files[1]).toEqual({ path: 'refs/guia.md', content: 'guia ç', encoding: 'utf8', size: Buffer.byteLength('guia ç') });
    expect(d.skipped).toEqual([]);
  });

  it('skill: texto com \\0 vai em base64', () => {
    write(dirs.projectDir, '.claude/skills/s/SKILL.md', 'x');
    write(dirs.projectDir, '.claude/skills/s/dados.bin', 'a\0b');
    const d = readSource({ kind: 'skill', location: '.claude/skills/s/SKILL.md' }, dirs, 'claude');
    expect(d.files[0]).toMatchObject({ encoding: 'base64', content: Buffer.from('a\0b').toString('base64') });
  });

  it('skill: arquivo de apoio acima de 512 KB fica de fora com o motivo, e os demais entram', () => {
    write(dirs.projectDir, '.claude/skills/s/SKILL.md', 'x');
    write(dirs.projectDir, '.claude/skills/s/grande.txt', 'a'.repeat(600 * KB));
    write(dirs.projectDir, '.claude/skills/s/pequeno.txt', 'b');
    const d = readSource({ kind: 'skill', location: '.claude/skills/s/SKILL.md' }, dirs, 'claude');
    expect(d.missing).toBe(false);
    expect(d.files.map((f) => f.path)).toEqual(['pequeno.txt']);
    expect(d.skipped).toEqual([{ path: 'grande.txt', reason: 'size' }]);
  });

  it('skill: além do 100º arquivo fica de fora por quantidade', () => {
    write(dirs.projectDir, '.claude/skills/s/SKILL.md', 'x');
    for (let i = 0; i < 101; i++) write(dirs.projectDir, `.claude/skills/s/f${String(i).padStart(3, '0')}.txt`, `${i}`);
    const d = readSource({ kind: 'skill', location: '.claude/skills/s/SKILL.md' }, dirs, 'claude');
    expect(d.files).toHaveLength(ARTIFACT_LIMITS.files);
    expect(d.files.at(-1)!.path).toBe('f099.txt');
    expect(d.skipped).toEqual([{ path: 'f100.txt', reason: 'count' }]);
  });

  it('skill: além de 5 MB no total fica de fora pelo total, e um menor que ainda cabe entra', () => {
    write(dirs.projectDir, '.claude/skills/s/SKILL.md', 'x');
    for (let i = 0; i < 11; i++) write(dirs.projectDir, `.claude/skills/s/p${String(i).padStart(2, '0')}.bin`, Buffer.alloc(500 * KB, 1));
    write(dirs.projectDir, '.claude/skills/s/z.txt', 'pequeno');
    const d = readSource({ kind: 'skill', location: '.claude/skills/s/SKILL.md' }, dirs, 'claude');
    expect(d.files.map((f) => f.path)).toEqual([...Array.from({ length: 10 }, (_, i) => `p0${i}.bin`), 'z.txt']);
    expect(d.skipped).toEqual([{ path: 'p10.bin', reason: 'total' }]);
    expect(d.files.reduce((n, f) => n + f.size, 0)).toBeLessThanOrEqual(ARTIFACT_LIMITS.totalBytes);
  });

  it('arquivo principal acima de 512 KB: missing, com o arquivo em skipped', () => {
    write(dirs.projectDir, '.claude/skills/s/SKILL.md', 'a'.repeat(600 * KB));
    write(dirs.projectDir, 'CLAUDE.md', 'a'.repeat(600 * KB));
    const skill = readSource({ kind: 'skill', location: '.claude/skills/s/SKILL.md' }, dirs, 'claude');
    expect(skill).toMatchObject({ missing: true, body: '', files: [], skipped: [{ path: 'SKILL.md', reason: 'size' }] });
    const rule = readSource({ kind: 'instructions', location: 'CLAUDE.md' }, dirs, 'claude');
    expect(rule).toMatchObject({ missing: true, body: '', skipped: [{ path: 'CLAUDE.md', reason: 'size' }] });
  });

  it('skill do fluxo: rascunho gerado com o corpo da extensão, mesmo sem o arquivo no disco', () => {
    const location = `~/.claude/skills/${FLOW_SKILL.name}/SKILL.md`;
    const d = readSource({ kind: 'skill', location }, dirs, 'claude');
    expect(d).toMatchObject({
      kind: 'skill',
      name: FLOW_SKILL.name,
      description: FLOW_SKILL.description,
      missing: false,
      meta: { generated: true },
    });
    expect(d.body).toContain(FLOW_SKILL.body.trim().split('\n')[0]);
    expect(d.origin).toBe(location);
  });

  it('agente do Claude Code: frontmatter, ferramentas nativas e categorias', () => {
    write(
      dirs.projectDir,
      '.claude/agents/revisor.md',
      [
        '---',
        'name: "revisor"',
        'description: "Revisa o código"',
        'tools: mcp__faz-ai__*, Read, Grep, Bash',
        'disallowedTools: WebFetch',
        'model: sonnet',
        'skills: revisar',
        'faz-ai-model: "claude:sonnet@medium"',
        'faz-ai-mcp: github',
        'faz-ai-seed: true',
        '---',
        '',
        'Você revisa.',
        '',
      ].join('\n'),
    );
    const d = readSource({ kind: 'agent', location: '.claude/agents/revisor.md' }, dirs, 'claude');
    expect(d).toMatchObject({ kind: 'agent', name: 'revisor', description: 'Revisa o código', body: 'Você revisa.', missing: false });
    expect(d.meta).toEqual<AgentMeta>({
      skills: ['revisar'],
      mcpServers: ['github'],
      model: 'claude:sonnet@medium',
      tools: { categories: ['read', 'run'], native: { tool: 'claude', allow: ['Read', 'Grep', 'Bash'], deny: ['WebFetch'] } },
      seed: true,
    });
  });

  it('agente do Cursor num board em Claude Code: formato do Cursor, com readonly e background preservados', () => {
    write(
      dirs.homeDir,
      '.cursor/agents/leitor.md',
      '---\nname: leitor\ndescription: Lê\nreadonly: true\nis_background: true\n---\n\nSó lê.\n',
    );
    const d = readSource({ kind: 'agent', location: '~/.cursor/agents/leitor.md' }, dirs, 'claude');
    expect(d).toMatchObject({ name: 'leitor', originTool: 'claude', missing: false });
    expect(d.meta).toMatchObject({
      readonly: true,
      background: true,
      tools: { categories: [], native: { tool: 'cursor', allow: [], deny: [] } },
    });
  });

  it('MCP: a definição do servidor em .mcp.json e o resumo como descrição', () => {
    const server = { type: 'stdio', command: 'npx', args: ['-y', 'srv'], env: { TOKEN: 'segredo' } };
    write(
      dirs.projectDir,
      '.mcp.json',
      JSON.stringify({ mcpServers: { srv: server, web: { type: 'http', url: 'https://x.dev/mcp?k=1' } } }),
    );
    expect(readSource({ kind: 'mcp', location: '.mcp.json#srv' }, dirs, 'claude')).toMatchObject({
      kind: 'mcp',
      name: 'srv',
      description: 'npx',
      body: '',
      meta: { server },
      origin: '.mcp.json#srv',
      missing: false,
    });
    expect(readSource({ kind: 'mcp', location: '.mcp.json#web' }, dirs, 'claude').description).toBe('https://x.dev/mcp');
  });

  it('MCP no ~/.claude.json: vale primeiro o da pasta do projeto, depois o global', () => {
    write(
      dirs.homeDir,
      '.claude.json',
      JSON.stringify({
        mcpServers: { a: { command: 'global-a' }, b: { command: 'global-b' } },
        projects: {
          [dirs.projectDir]: { mcpServers: { a: { command: 'local-a' } } },
          '/outro': { mcpServers: { b: { command: 'outro-b' } } },
        },
      }),
    );
    expect(readSource({ kind: 'mcp', location: '~/.claude.json#a' }, dirs, 'claude')).toMatchObject({
      meta: { server: { command: 'local-a' } },
    });
    expect(readSource({ kind: 'mcp', location: '~/.claude.json#b' }, dirs, 'claude')).toMatchObject({
      meta: { server: { command: 'global-b' } },
    });
  });

  it('origem ausente, servidor que não existe e JSON inválido viram missing, sem lançar', () => {
    write(dirs.projectDir, '.cursor/mcp.json', '{ isto não é json');
    for (const sel of [
      { kind: 'instructions', location: 'AGENTS.md' },
      { kind: 'skill', location: '.claude/skills/nada/SKILL.md' },
      { kind: 'agent', location: '.claude/agents/nada.md' },
      { kind: 'mcp', location: '.mcp.json#nada' },
      { kind: 'mcp', location: '.cursor/mcp.json#srv' },
      { kind: 'mcp', location: 'sem-nome' },
    ] as const) {
      const d = readSource(sel, dirs, 'cursor');
      expect(d.missing, sel.location).toBe(true);
      expect(d.origin).toBe(sel.location);
      expect(d.originTool).toBe('cursor');
    }
    expect(readSource({ kind: 'agent', location: '.claude/agents/nada.md' }, dirs, 'claude').name).toBe('nada');
    expect(readSource({ kind: 'mcp', location: '.cursor/mcp.json#srv' }, dirs, 'claude').name).toBe('srv');
  });
});

describe('readMcpByName', () => {
  it('acha o servidor no inventário com a precedência do Claude Code: pasta do projeto no ~/.claude.json, projeto, usuário', () => {
    write(dirs.projectDir, '.mcp.json', JSON.stringify({ mcpServers: { a: { command: 'projeto-a' }, b: { command: 'projeto-b' } } }));
    write(
      dirs.homeDir,
      '.claude.json',
      JSON.stringify({
        mcpServers: { b: { command: 'global-b' }, c: { command: 'global-c' } },
        projects: { [dirs.projectDir]: { mcpServers: { a: { command: 'local-a' } } } },
      }),
    );
    const inventory = scanInventory('claude', dirs.projectDir, dirs.homeDir, path.join(root, 'managed'), []);
    expect(readMcpByName('a', inventory, dirs)).toMatchObject({ meta: { server: { command: 'local-a' } }, origin: '~/.claude.json#a' });
    expect(readMcpByName('b', inventory, dirs)).toMatchObject({ meta: { server: { command: 'projeto-b' } }, origin: '.mcp.json#b' });
    expect(readMcpByName('c', inventory, dirs)).toMatchObject({ meta: { server: { command: 'global-c' } }, originTool: 'claude' });
    expect(readMcpByName('nada', inventory, dirs)).toBeNull();
  });
});
