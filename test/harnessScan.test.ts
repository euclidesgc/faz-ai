import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanInventory } from '../src/extension/harnessScan';

let root: string;
let project: string;
let home: string;

const write = (base: string, rel: string, content: string) => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const skill = (description: string) => `---\nname: x\ndescription: ${description}\n---\n\nCorpo\n`;
const names = (items: ReturnType<typeof scanInventory>, kind: string, scope: string) => items.filter((i) => i.kind === kind && i.scope === scope).map((i) => i.name);

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-scan-')));
  project = path.join(root, 'projeto');
  home = path.join(root, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('varredura do harness por ferramenta e escopo', () => {
  it('Claude Code: separa projeto, global e plugins em todos os tipos', () => {
    write(project, 'CLAUDE.md', '# Regras');
    write(project, '.claude/rules/api/rest.md', '---\ndescription: Regras de API\n---\n');
    write(project, '.claude/skills/revisar/SKILL.md', skill('Do projeto'));
    write(project, '.claude/agents/revisor.md', '---\nname: revisor\ndescription: Revisa\n---\n');
    write(project, '.claude/commands/deploy.md', 'Faça o deploy');
    write(project, '.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './check.sh' }] }] } }));
    write(project, '.mcp.json', JSON.stringify({ mcpServers: { 'faz-ai': { command: 'node', args: ['bridge.js', '--token=segredo'], env: { CHAVE: 'segredo' } } } }));
    write(home, '.claude/CLAUDE.md', '# Global');
    write(home, '.claude/skills/commit/SKILL.md', skill('Global'));
    write(home, '.claude.json', JSON.stringify({ mcpServers: { remoto: { type: 'http', url: 'https://exemplo.dev/mcp?key=segredo' } }, projects: { [project]: { mcpServers: { local: { command: 'npx' } } } } }));
    // plugin com duas gerações lado a lado: vale a mais recente
    for (const dir of ['design', 'design~g3']) {
      write(home, `.claude/plugins/synced/abc/${dir}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'design', description: 'Plugin de design' }));
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
    expect(items.find((i) => i.kind === 'hook')).toMatchObject({ name: 'PreToolUse', description: './check.sh', location: '.claude/settings.json' });
    expect(names(items, 'mcp', 'user')).toEqual(['remoto', 'local']);
    expect(names(items, 'plugin', 'plugin')).toEqual(['design']);
    expect(items.find((i) => i.kind === 'skill' && i.scope === 'plugin')).toMatchObject({ name: 'critica', description: 'design~g3', plugin: 'design' });
    expect(items.find((i) => i.name === 'commit')).toMatchObject({ description: 'Global', location: '~/.claude/skills/commit/SKILL.md', path: path.join(home, '.claude/skills/commit/SKILL.md') });
    // nada que possa ser segredo vai para a lista
    expect(JSON.stringify(items)).not.toContain('segredo');
    expect(items.find((i) => i.name === 'remoto')?.description).toBe('https://exemplo.dev/mcp');
  });

  it('Codex: skills em .agents, agentes e servidores MCP em TOML', () => {
    write(project, 'AGENTS.md', '# Regras');
    write(project, '.agents/skills/testar/SKILL.md', skill('Testa'));
    write(project, '.codex/agents/revisor.toml', 'name = "revisor"\ndescription = "Revisa a spec"\ndeveloper_instructions = """\nx\n"""\n');
    write(home, '.agents/skills/global/SKILL.md', skill('Global'));
    write(home, '.codex/skills/.system/imagegen/SKILL.md', skill('Embutida'));
    write(home, '.codex/config.toml', 'model = "gpt"\n\n[mcp_servers.faz-ai]\ncommand = "node"\nargs = ["x"]\n\n[mcp_servers.faz-ai.env]\nTOKEN = "segredo"\n\n[mcp_servers."com.ponto"]\nurl = "https://exemplo.dev/mcp"\n');
    const items = scanInventory('codex', project, home);
    expect(names(items, 'skill', 'project')).toEqual(['testar']);
    expect(names(items, 'skill', 'user')).toEqual(['global']);
    expect(items.find((i) => i.name === 'imagegen')).toMatchObject({ scope: 'plugin', plugin: 'Codex (embutidas)' });
    expect(items.find((i) => i.kind === 'agent')).toMatchObject({ name: 'revisor', description: 'Revisa a spec' });
    expect(items.filter((i) => i.kind === 'mcp').map((i) => [i.name, i.description])).toEqual([['faz-ai', 'node'], ['com.ponto', 'https://exemplo.dev/mcp']]);
    expect(JSON.stringify(items)).not.toContain('segredo');
  });

  it('Cursor, Kimi Code e Copilot: caminhos de cada ferramenta', () => {
    write(project, '.cursor/rules/estilo.mdc', '---\ndescription: Estilo\nalwaysApply: true\n---\n');
    write(project, '.cursor/hooks.json', JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: 'fmt.sh' }] } }));
    write(project, '.claude/skills/compat/SKILL.md', skill('Lida por compatibilidade'));
    const cursor = scanInventory('cursor', project, home);
    expect(names(cursor, 'instructions', 'project')).toEqual(['estilo']);
    expect(names(cursor, 'skill', 'project')).toEqual(['compat']);
    expect(cursor.find((i) => i.kind === 'hook')).toMatchObject({ name: 'afterFileEdit', description: 'fmt.sh' });

    write(project, '.kimi-code/skills/nova/SKILL.md', skill('Nova'));
    write(project, '.kimi/skills/antiga/SKILL.md', skill('Da CLI antiga'));
    write(project, '.kimi-code/mcp.json', JSON.stringify({ mcpServers: { board: { command: 'node' } } }));
    write(home, '.kimi-code/config.toml', '[[hooks]]\nevent = "PreToolUse"\ncommand = "guard.sh"\n\n[thinking]\neffort = "high"\n');
    write(home, '.kimi-code/plugins/managed/br/kimi.plugin.json', JSON.stringify({ name: 'br' }));
    write(home, '.kimi-code/plugins/managed/br/agents/planner.md', '---\nname: planner\ndescription: Planeja\n---\n');
    const kimi = scanInventory('kimi', project, home);
    expect(names(kimi, 'skill', 'project')).toEqual(['nova', 'antiga']);
    expect(names(kimi, 'mcp', 'project')).toEqual(['board']);
    expect(kimi.find((i) => i.kind === 'hook')).toMatchObject({ name: 'PreToolUse', description: 'guard.sh', scope: 'user' });
    expect(kimi.find((i) => i.kind === 'agent')).toMatchObject({ name: 'planner', scope: 'plugin', plugin: 'br' });

    write(project, '.github/copilot-instructions.md', '# Copilot');
    write(project, '.github/instructions/api.instructions.md', '---\napplyTo: "src/**"\ndescription: API\n---\n');
    write(project, '.github/agents/revisor.agent.md', '---\ndescription: Revisa\n---\n');
    write(project, '.github/prompts/pr.prompt.md', '---\ndescription: Abre PR\n---\n');
    write(project, '.github/hooks/seguranca.json', JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: 'command', bash: './scan.sh' }] } }));
    write(project, '.vscode/mcp.json', '{\n  // servidor do board\n  "servers": { "faz-ai": { "command": "node" } }\n}');
    write(home, '.copilot/skills/global/SKILL.md', skill('Global'));
    const copilot = scanInventory('copilot', project, home);
    expect(names(copilot, 'instructions', 'project')).toEqual(['copilot-instructions.md', 'api']);
    expect(names(copilot, 'agent', 'project')).toEqual(['revisor']);
    expect(names(copilot, 'command', 'project')).toEqual(['pr']);
    expect(copilot.find((i) => i.kind === 'hook')).toMatchObject({ name: 'preToolUse', description: './scan.sh' });
    expect(names(copilot, 'mcp', 'project')).toEqual(['faz-ai']);
    expect(names(copilot, 'skill', 'user')).toEqual(['global']);
  });

  it('pastas ausentes e arquivos inválidos não quebram a varredura', () => {
    write(project, '.mcp.json', '{ isto não é json');
    expect(scanInventory('claude', project, home)).toEqual([]);
    expect(scanInventory('claude', project, '')).toEqual([]);
  });
});
