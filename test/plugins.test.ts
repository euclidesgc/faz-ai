import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginInstall } from '../src/shared/harness';
import { parseClaudePlugins } from '../src/extension/plugins';
import { scanInventory } from '../src/extension/harnessScan';

let root: string;
let home: string;
let project: string;

const write = (base: string, rel: string, content: string) => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-plugins-')));
  home = path.join(root, 'home');
  project = path.join(root, 'projeto');
  fs.mkdirSync(home);
  fs.mkdirSync(project);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const install = (over: Partial<PluginInstall> = {}): PluginInstall => ({
  id: 'fmt@loja',
  scopes: ['user'],
  enabled: true,
  dir: '/p',
  ...over,
});

describe('lista de plugins do Claude Code', () => {
  it('lê a saída de claude plugin list --json: junta os escopos e deixa de fora o de outro projeto', () => {
    const out = JSON.stringify([
      { id: 'fmt@loja', scope: 'user', enabled: true, installPath: '/cache/fmt/1.0' },
      { id: 'fmt@loja', scope: 'project', enabled: true, installPath: '/cache/fmt/1.0', projectPath: project },
      { id: 'outro@loja', scope: 'local', enabled: true, installPath: '/cache/outro', projectPath: '/outro/projeto' },
      { id: 'design@synced', scope: 'synced', enabled: false, installPath: '/synced/design~g2' },
      { id: 'local@pasta', scope: 'user', enabled: true, installPath: '/x', readFromFolder: '/mk/local' },
    ]);
    expect(parseClaudePlugins(`aviso antes\n${out}`, project)).toEqual([
      { id: 'fmt@loja', scopes: ['user', 'project'], enabled: true, dir: '/cache/fmt/1.0' },
      { id: 'design@synced', scopes: ['synced'], enabled: false, dir: '/synced/design~g2' },
      { id: 'local@pasta', scopes: ['user'], enabled: true, dir: '/mk/local' },
    ]);
    expect(parseClaudePlugins('No plugins installed.', project)).toBeNull();
  });
});

describe('varredura dos plugins instalados', () => {
  it('com a lista do Claude Code, só os instalados; sem ela, nunca o catálogo dos marketplaces', () => {
    write(home, '.claude/plugins/marketplaces/oficial/plugins/catalogo/.claude-plugin/plugin.json', '{"name":"catalogo"}');
    write(home, '.claude/plugins/synced/org/design~g2/.claude-plugin/plugin.json', '{"name":"design","description":"Design"}');
    write(home, '.claude/plugins/synced/org/design~g2/skills/critica/SKILL.md', '---\ndescription: Critica\n---\n');
    const plugins = (list: PluginInstall[] | null) =>
      scanInventory('claude', project, home, '/sem-politica', list).filter((i) => i.kind === 'plugin');
    expect(plugins(null).map((p) => p.name)).toEqual(['design']);
    expect(plugins(null)[0]!.install).toBeUndefined();
    const design = install({ id: 'design@synced', scopes: ['synced'], dir: path.join(home, '.claude/plugins/synced/org/design~g2') });
    expect(plugins([design])).toEqual([expect.objectContaining({ name: 'design', install: design, description: 'Design' })]);
    // o que vem do plugin continua listado com ele
    expect(scanInventory('claude', project, home, '/sem-politica', [design]).some((i) => i.kind === 'skill' && i.plugin === 'design')).toBe(
      true,
    );
    // a lista vazia da CLI: nenhum plugin, nem os das pastas
    expect(plugins([])).toEqual([]);
  });

  it('no Cursor, lista cada plugin local, inclusive o que é um link', () => {
    write(home, '.cursor/plugins/local/meu/.cursor-plugin/plugin.json', '{"name":"meu"}');
    write(root, 'fonte/linkado/plugin.json', '{"name":"linkado"}');
    fs.symlinkSync(path.join(root, 'fonte/linkado'), path.join(home, '.cursor/plugins/local/linkado'));
    const plugins = scanInventory('cursor', project, home).filter((i) => i.kind === 'plugin');
    expect(plugins.map((p) => [p.name, p.install?.id])).toEqual(
      expect.arrayContaining([
        ['meu', 'meu'],
        ['linkado', 'linkado'],
      ]),
    );
  });
});
