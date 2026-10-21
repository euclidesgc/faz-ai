import { HarnessStore } from '../src/extension/harness';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importsOf, scanInventory } from '../src/extension/harnessScan';
import { skillMode } from '../src/extension/skillMode';
import {
  HARNESS_CATALOG,
  HARNESS_GROUPS,
  claudeProjectKey,
  createTargets,
  groupOf,
  importPath,
  instructionRoles,
  permissionTargets,
} from '../src/shared/harnessCatalog';

let root: string;
let project: string;
let home: string;

const write = (base: string, rel: string, content: string) => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const skill = (description: string) => `---\nname: x\ndescription: ${description}\n---\n\nCorpo\n`;
const names = (items: ReturnType<typeof scanInventory>, kind: string, scope: string) =>
  items.filter((i) => i.kind === kind && i.scope === scope).map((i) => i.name);

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-scan-')));
  project = path.join(root, 'projeto');
  home = path.join(root, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('varredura do harness por ferramenta e escopo', () => {
  it('toda fonte do catálogo diz o grupo e o que é, numa frase', () => {
    const groups = HARNESS_GROUPS.map((g) => g.id);
    for (const list of Object.values(HARNESS_CATALOG))
      for (const src of list) {
        expect(groups).toContain(src.group);
        expect(src.hint?.length).toBeGreaterThan(20);
      }
  });

  it('Claude Code: AGENTS.md, memória automática do projeto e política da organização (só leitura, sem criar)', () => {
    const managed = path.join(root, 'politica');
    write(project, 'AGENTS.md', '# Agentes');
    write(home, `.claude/projects/${claudeProjectKey(project)}/memory/MEMORY.md`, '- [Uma](uma.md)');
    write(home, `.claude/projects/${claudeProjectKey(project)}/memory/uma.md`, '---\ndescription: Uma nota\n---\n');
    write(home, '.claude/projects/-outro-projeto/memory/MEMORY.md', 'de outro projeto');
    write(managed, 'CLAUDE.md', '# Da empresa');
    write(managed, 'managed-settings.json', '{}');
    const items = scanInventory('claude', project, home, managed);
    const byName = (name: string) => items.find((i) => i.name === name)!;
    expect(groupOf('claude', byName('AGENTS.md'))).toBe('main');
    expect(items.filter((i) => i.kind === 'memory').map((i) => i.name)).toEqual(['MEMORY', 'uma']);
    expect(byName('uma')).toMatchObject({ description: 'Uma nota', scope: 'user' });
    expect(groupOf('claude', byName('MEMORY'))).toBe('memory');
    const policy = items.filter((i) => groupOf('claude', i) === 'managed');
    expect(policy.map((i) => i.location)).toEqual([path.join(managed, 'CLAUDE.md'), path.join(managed, 'managed-settings.json')]);
    // nem a memória nem a política aparecem como lugar de criar ou destino de cópia
    expect(createTargets('claude').some((t) => t.label.includes('memory') || (t.label === 'CLAUDE.md' && t.scope === 'user'))).toBe(false);
  });

  it('Claude Code: os @caminho das instruções, fora de código, até quatro níveis e sem repetir', () => {
    write(
      project,
      'CLAUDE.md',
      [
        'Veja @docs/arquitetura.md e @~/.claude/pessoal.md.',
        'O e-mail fulano@empresa.com não é importação, nem `@README` em código, nem @nao-existe.md.',
        '```',
        '@docs/dentro-de-bloco.md',
        '```',
      ].join('\n'),
    );
    write(project, 'docs/arquitetura.md', 'Detalhes em @camadas.md');
    write(project, 'docs/camadas.md', 'Volta para @arquitetura.md');
    write(project, 'docs/dentro-de-bloco.md', 'x');
    write(home, '.claude/pessoal.md', 'Meu jeito');
    const claude = scanInventory('claude', project, home, path.join(root, 'sem-politica')).find((i) => i.location === 'CLAUDE.md')!;
    expect(claude.imports).toEqual([
      { path: path.join(project, 'docs/arquitetura.md'), location: 'docs/arquitetura.md', depth: 1 },
      { path: path.join(project, 'docs/camadas.md'), location: 'docs/camadas.md', depth: 2 },
      { path: path.join(home, '.claude/pessoal.md'), location: '~/.claude/pessoal.md', depth: 1 },
    ]);
    // uma cadeia longa para no quarto nível
    for (let n = 1; n <= 6; n++) write(project, `cadeia/${n}.md`, `@${n + 1}.md`);
    expect(importsOf(path.join(project, 'cadeia/1.md'), home).map((x) => x.depth)).toEqual([1, 2, 3, 4]);
  });

  it('regras de subpasta: CLAUDE.md e AGENTS.md abaixo da raiz, sem pastas ocultas nem de dependências', () => {
    write(project, 'CLAUDE.md', '# Raiz');
    write(project, 'packages/api/CLAUDE.md', '---\ndescription: Regras da API\n---\n');
    write(project, 'packages/web/AGENTS.md', '# Web');
    write(project, 'node_modules/lib/CLAUDE.md', 'de dependência');
    write(project, '.git/CLAUDE.md', 'oculto');
    const claude = scanInventory('claude', project, home, path.join(root, 'sem-politica'));
    const nested = claude.filter((i) => HARNESS_CATALOG.claude[i.source!]?.layout === 'nested');
    expect(nested.map((i) => i.name)).toEqual(['packages/api/CLAUDE.md', 'packages/web/AGENTS.md']);
    expect(nested[0]).toMatchObject({ description: 'Regras da API', layout: 'file', scope: 'project' });
    expect(groupOf('claude', nested[0]!)).toBe('main');
    const cursor = scanInventory('cursor', project, home, path.join(root, 'sem-politica'));
    expect(cursor.filter((i) => HARNESS_CATALOG.cursor[i.source!]?.layout === 'nested').map((i) => i.name)).toEqual([
      'packages/web/AGENTS.md',
    ]);
  });

  it('Cursor: .cursorignore e comandos da pasta do usuário', () => {
    write(project, '.cursorignore', '.env\n');
    write(home, '.cursor/commands/revisar.md', 'Revise');
    const items = scanInventory('cursor', project, home, path.join(root, 'sem-politica'));
    expect(
      groupOf(
        'cursor',
        items.find((i) => i.name === '.cursorignore')!,
      ),
    ).toBe('settings');
    expect(items.find((i) => i.name === 'revisar')).toMatchObject({ kind: 'command', scope: 'user' });
  });

  it('Claude Code: separa projeto, global e plugins em todos os tipos', () => {
    write(project, 'CLAUDE.md', '# Regras');
    write(project, '.claude/rules/api/rest.md', '---\ndescription: Regras de API\n---\n');
    write(project, '.claude/skills/revisar/SKILL.md', skill('Do projeto'));
    write(project, '.claude/agents/revisor.md', '---\nname: revisor\ndescription: Revisa\n---\n');
    write(project, '.claude/commands/deploy.md', 'Faça o deploy');
    write(
      project,
      '.claude/settings.json',
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './check.sh' }] }] } }),
    );
    write(
      project,
      '.mcp.json',
      JSON.stringify({ mcpServers: { 'faz-ai': { command: 'node', args: ['bridge.js', '--token=segredo'], env: { CHAVE: 'segredo' } } } }),
    );
    write(home, '.claude/CLAUDE.md', '# Global');
    write(home, '.claude/skills/commit/SKILL.md', skill('Global'));
    write(
      home,
      '.claude.json',
      JSON.stringify({
        mcpServers: { remoto: { type: 'http', url: 'https://exemplo.dev/mcp?key=segredo' } },
        projects: { [project]: { mcpServers: { local: { command: 'npx' } } } },
      }),
    );
    // plugin com duas gerações lado a lado: vale a mais recente
    for (const dir of ['design', 'design~g3']) {
      write(
        home,
        `.claude/plugins/synced/abc/${dir}/.claude-plugin/plugin.json`,
        JSON.stringify({ name: 'design', description: 'Plugin de design' }),
      );
      write(home, `.claude/plugins/synced/abc/${dir}/skills/critica/SKILL.md`, skill(dir));
    }
    write(home, '.claude/plugins/.trash/velho/.claude-plugin/plugin.json', JSON.stringify({ name: 'lixo' }));

    const items = scanInventory('claude', project, home);
    expect(names(items, 'instructions', 'project')).toEqual(['CLAUDE.md', 'api/rest']);
    expect(names(items, 'instructions', 'user')).toEqual(['CLAUDE.md']);
    expect(names(items, 'skill', 'project')).toEqual(['revisar']);
    expect(names(items, 'skill', 'user')).toEqual(['commit']);
    expect(names(items, 'agent', 'project')).toEqual(['revisor']);
    expect(names(items, 'command', 'project')).toEqual(['deploy']);
    expect(items.find((i) => i.kind === 'hook')).toMatchObject({
      name: 'PreToolUse',
      description: 'Bash → ./check.sh',
      detail: './check.sh',
      location: '.claude/settings.json',
    });
    expect(names(items, 'mcp', 'user')).toEqual(['remoto', 'local']);
    expect(names(items, 'plugin', 'plugin')).toEqual(['design']);
    expect(items.find((i) => i.kind === 'skill' && i.scope === 'plugin')).toMatchObject({
      name: 'critica',
      description: 'design~g3',
      plugin: 'design',
    });
    expect(items.find((i) => i.name === 'commit')).toMatchObject({
      description: 'Global',
      location: '~/.claude/skills/commit/SKILL.md',
      path: path.join(home, '.claude/skills/commit/SKILL.md'),
    });
    // nada que possa ser segredo vai para a lista
    expect(JSON.stringify(items)).not.toContain('segredo');
    expect(items.find((i) => i.name === 'remoto')?.description).toBe('MCP HTTP');
  });

  it('Cursor: caminhos da ferramenta', () => {
    write(project, '.cursor/rules/estilo.mdc', '---\ndescription: Estilo\nalwaysApply: true\n---\n');
    write(project, '.cursor/hooks.json', JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: 'fmt.sh' }] } }));
    write(project, '.claude/skills/compat/SKILL.md', skill('Lida por compatibilidade'));
    const cursor = scanInventory('cursor', project, home);
    expect(names(cursor, 'instructions', 'project')).toEqual(['estilo']);
    expect(names(cursor, 'skill', 'project')).toEqual(['compat']);
    expect(cursor.find((i) => i.kind === 'hook')).toMatchObject({ name: 'afterFileEdit', description: 'fmt.sh' });
  });

  it('guarda o tamanho dos arquivos (rules, skills, agentes), mas não o das entradas de um arquivo de configuração', () => {
    write(project, 'CLAUDE.md', '# Regras do projeto');
    write(project, '.claude/skills/revisar/SKILL.md', skill('Revisa o diff'));
    write(project, '.claude/agents/revisor.md', '---\nname: revisor\ndescription: Revisa\n---\n\nRevise o diff.');
    write(project, '.mcp.json', JSON.stringify({ mcpServers: { local: { command: 'npx' } } }));
    const items = scanInventory('claude', project, home);
    const of = (kind: string, name: string) => items.find((i) => i.kind === kind && i.name === name);
    expect(of('instructions', 'CLAUDE.md')?.size).toBe(Buffer.byteLength('# Regras do projeto'));
    expect(of('skill', 'revisar')?.size).toBe(Buffer.byteLength(skill('Revisa o diff')));
    expect(of('agent', 'revisor')?.size).toBeGreaterThan(0);
    expect(of('mcp', 'local')).toBeDefined();
    expect(of('mcp', 'local')?.size).toBeUndefined();
  });

  it('pastas ausentes e arquivos inválidos não quebram a varredura', () => {
    write(project, '.mcp.json', '{ isto não é json');
    expect(scanInventory('claude', project, home)).toEqual([]);
    expect(scanInventory('claude', project, '')).toEqual([]);
  });
});

describe('instruções do Claude Code', () => {
  it('separa os arquivos que decidem se o Claude Code lê o AGENTS.md e monta o caminho do @import', () => {
    write(project, 'CLAUDE.local.md', '# Local');
    write(project, '.claude/AGENTS.md', '# Agentes');
    write(project, 'CLAUDE.md', '# Projeto');
    const { claudeMd, agentsMd } = instructionRoles('claude', scanInventory('claude', project, home));
    expect(claudeMd.map((i) => i.location)).toEqual(['CLAUDE.md', 'CLAUDE.local.md']);
    expect(agentsMd.map((i) => i.location)).toEqual(['.claude/AGENTS.md']);
    // no Cursor o AGENTS.md não tem esse papel
    expect(instructionRoles('cursor', scanInventory('cursor', project, home)).agentsMd).toEqual([]);
    expect(importPath('CLAUDE.md', '.claude/AGENTS.md')).toBe('.claude/AGENTS.md');
    expect(importPath('.claude/CLAUDE.md', 'AGENTS.md')).toBe('../AGENTS.md');
    expect(importPath('.claude/CLAUDE.md', '.claude/AGENTS.md')).toBe('AGENTS.md');
  });
});

describe('modo de invocação das skills', () => {
  it('lê o modo na chave do frontmatter, nas duas grafias', () => {
    write(project, '.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: Faz o deploy\n---\n\nPassos\n');
    expect(skillMode(path.join(project, '.claude/skills/deploy/SKILL.md'))).toBe('auto');
    write(project, '.claude/skills/manual/SKILL.md', '---\nname: manual\ndescription: x\ndisable-model-invocation: true\n---\n');
    expect(skillMode(path.join(project, '.claude/skills/manual/SKILL.md'))).toBe('manual');
    write(project, '.claude/skills/estilo/SKILL.md', '---\nname: estilo\ndescription: x\ndisableModelInvocation: true\n---\n');
    expect(skillMode(path.join(project, '.claude/skills/estilo/SKILL.md'))).toBe('manual');
  });
});

it('perfil genérico não presume pastas ou inventário de outra ferramenta', () => {
  write(project, 'CLAUDE.md', 'Sentinela nativa');
  write(project, '.claude/skills/x/SKILL.md', skill('Sentinela skill'));
  expect(scanInventory('claude', project, home).length).toBeGreaterThan(0);
  expect(scanInventory('personalizado', project, home, undefined, null, [project])).toEqual([]);
  expect(new HarnessStore(project, 'personalizado', home).scan()).toEqual({ rules: [], skills: [], agents: [], inventory: [] });
  expect(createTargets('personalizado')).toEqual([]);
  expect(permissionTargets('personalizado')).toEqual([]);
});

describe('Kimi Code: instruções na pasta do projeto', () => {
  it('lê .kimi-code/AGENTS.md no escopo do projeto', () => {
    write(project, '.kimi-code/AGENTS.md', '# Regras');
    const items = scanInventory('kimi', project, home);
    expect(items.filter((i) => i.scope === 'project').map((i) => i.location)).toContain('.kimi-code/AGENTS.md');
  });
});
