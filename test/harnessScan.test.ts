import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HarnessOps } from '../src/extension/harnessOps';
import { scanInventory } from '../src/extension/harnessScan';
import { McpServers } from '../src/extension/mcpServers';
import { setSkillMode, skillMode } from '../src/extension/skillMode';
import { HARNESS_CATALOG, createTargets, mcpTargets } from '../src/shared/harnessCatalog';

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

describe('criar, copiar e apagar itens do harness', () => {
  const find = (tool: 'claude' | 'codex' | 'copilot' | 'cursor', kind: string, name: string, scope: string) => scanInventory(tool, project, home).find((i) => i.kind === kind && i.name === name && i.scope === scope)!;
  const target = (tool: 'claude' | 'codex' | 'copilot' | 'cursor', label: string) => createTargets(tool).find((t) => t.label === label)!.source;

  it('cria no projeto e na pasta do usuário, no formato de cada ferramenta', () => {
    const ops = new HarnessOps(project, home);
    const skillFile = ops.create('claude', target('claude', '~/.claude/skills/<nome>/SKILL.md'), 'commit', 'Escreve o commit');
    expect(skillFile).toBe(path.join(home, '.claude/skills/commit/SKILL.md'));
    expect(fs.readFileSync(skillFile, 'utf8')).toContain('description: Escreve o commit');
    expect(fs.readFileSync(ops.create('codex', target('codex', '.codex/agents/<nome>.toml'), 'revisor', 'Revisa'), 'utf8')).toContain('developer_instructions = """');
    expect(ops.create('copilot', target('copilot', '.github/agents/<nome>.agent.md'), 'revisor', 'Revisa')).toBe(path.join(project, '.github/agents/revisor.agent.md'));
    expect(fs.readFileSync(ops.create('cursor', target('cursor', '.cursor/rules/<nome>.mdc'), 'estilo', 'Estilo'), 'utf8')).toBe('---\ndescription: Estilo\nalwaysApply: false\n---\n\n');
    expect(ops.create('claude', target('claude', '~/.claude/CLAUDE.md'), '', '')).toBe(path.join(home, '.claude/CLAUDE.md'));
    // não sobrescreve, não aceita nome fora do padrão e exige descrição em skill e agente
    expect(() => ops.create('claude', target('claude', '~/.claude/skills/<nome>/SKILL.md'), 'commit', 'x')).toThrow('Já existe');
    expect(() => ops.create('claude', target('claude', '.claude/skills/<nome>/SKILL.md'), '../fora', 'x')).toThrow('Nome inválido');
    expect(() => ops.create('claude', target('claude', '.claude/agents/<nome>.md'), 'sem-descricao', ' ')).toThrow('descrição');
    // entradas de arquivo de configuração não são lugares de criação
    expect(() => ops.create('claude', HARNESS_CATALOG.claude.findIndex((s) => s.layout === 'json-keys'), 'x', 'x')).toThrow();
  });

  it('copia do global e de plugin para o projeto, com a pasta inteira da skill', () => {
    write(home, '.claude/skills/commit/SKILL.md', skill('Global'));
    write(home, '.claude/skills/commit/references/modelo.md', 'Modelo');
    write(home, '.claude/plugins/loja/design/.claude-plugin/plugin.json', '{"name":"design"}');
    write(home, '.claude/plugins/loja/design/agents/critico.md', '---\ndescription: Critica\n---\n');
    const ops = new HarnessOps(project, home);
    ops.copy('claude', find('claude', 'skill', 'commit', 'user'), 'project');
    ops.copy('claude', find('claude', 'agent', 'critico', 'plugin'), 'project');
    expect(fs.readFileSync(path.join(project, '.claude/skills/commit/references/modelo.md'), 'utf8')).toBe('Modelo');
    expect(fs.existsSync(path.join(project, '.claude/agents/critico.md'))).toBe(true);
    // a cópia aparece nos dois escopos, com o mesmo resumo de conteúdo até alguém editar uma delas
    expect(find('claude', 'skill', 'commit', 'project').digest).toBe(find('claude', 'skill', 'commit', 'user').digest);
    fs.appendFileSync(path.join(project, '.claude/skills/commit/SKILL.md'), 'ajuste');
    expect(find('claude', 'skill', 'commit', 'project').digest).not.toBe(find('claude', 'skill', 'commit', 'user').digest);
    expect(() => ops.copy('claude', find('claude', 'skill', 'commit', 'user'), 'project')).toThrow('Já existe');
  });

  it('apaga do projeto e do global, mas nunca de um plugin nem um arquivo de configuração', () => {
    write(project, '.claude/skills/velha/SKILL.md', skill('x'));
    write(project, '.claude/skills/velha/assets/a.txt', 'a');
    write(home, '.claude/agents/global.md', '---\ndescription: x\n---\n');
    write(home, '.claude/settings.json', '{}');
    write(home, '.claude/plugins/loja/design/.claude-plugin/plugin.json', '{"name":"design"}');
    write(home, '.claude/plugins/loja/design/skills/critica/SKILL.md', skill('x'));
    write(project, '.mcp.json', JSON.stringify({ mcpServers: { board: { command: 'node' } } }));
    const ops = new HarnessOps(project, home);
    ops.remove(find('claude', 'skill', 'velha', 'project'));
    ops.remove(find('claude', 'agent', 'global', 'user'));
    expect(fs.existsSync(path.join(project, '.claude/skills/velha'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude/agents/global.md'))).toBe(false);
    expect(() => ops.remove(find('claude', 'skill', 'critica', 'plugin'))).toThrow('plugin');
    expect(() => ops.remove(find('claude', 'settings', 'settings.json', 'user'))).toThrow('configuração');
    expect(() => ops.remove(find('claude', 'mcp', 'board', 'project'))).toThrow('não pode ser alterado');
    expect(fs.existsSync(path.join(project, '.mcp.json'))).toBe(true);
  });
});

describe('modo de invocação das skills', () => {
  it('grava e lê no formato de cada ferramenta, preservando o resto do arquivo', () => {
    write(project, '.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: Faz o deploy\n---\n\nPassos\n');
    const md = path.join(project, '.claude/skills/deploy/SKILL.md');
    expect(skillMode(md)).toBe('auto');
    setSkillMode('claude', md, 'manual');
    expect(fs.readFileSync(md, 'utf8')).toBe('---\nname: deploy\ndescription: Faz o deploy\ndisable-model-invocation: true\n---\n\nPassos\n');
    expect(skillMode(md)).toBe('manual');
    setSkillMode('claude', md, 'manual'); // repetir não duplica a chave
    expect(fs.readFileSync(md, 'utf8').match(/disable-model-invocation/g)).toHaveLength(1);
    setSkillMode('claude', md, 'auto');
    expect(fs.readFileSync(md, 'utf8')).toBe('---\nname: deploy\ndescription: Faz o deploy\n---\n\nPassos\n');

    // a grafia do Kimi também é lida, e voltar para automática a remove
    write(project, '.kimi-code/skills/estilo/SKILL.md', '---\nname: estilo\ndescription: x\ndisableModelInvocation: true\n---\n');
    const kimi = path.join(project, '.kimi-code/skills/estilo/SKILL.md');
    expect(skillMode(kimi)).toBe('manual');
    setSkillMode('kimi', kimi, 'auto');
    expect(fs.readFileSync(kimi, 'utf8')).toBe('---\nname: estilo\ndescription: x\n---\n');

    // SKILL.md sem frontmatter ganha um
    write(project, '.claude/skills/solta/SKILL.md', 'Só o corpo');
    setSkillMode('claude', path.join(project, '.claude/skills/solta/SKILL.md'), 'manual');
    expect(fs.readFileSync(path.join(project, '.claude/skills/solta/SKILL.md'), 'utf8')).toBe('---\ndisable-model-invocation: true\n---\n\nSó o corpo');
  });

  it('Codex: grava a política em agents/openai.yaml sem mexer no SKILL.md', () => {
    write(project, '.agents/skills/testar/SKILL.md', skill('Testa'));
    const md = path.join(project, '.agents/skills/testar/SKILL.md');
    const yaml = path.join(project, '.agents/skills/testar/agents/openai.yaml');
    setSkillMode('codex', md, 'manual');
    expect(fs.readFileSync(yaml, 'utf8')).toBe('policy:\n  allow_implicit_invocation: false\n');
    expect(fs.readFileSync(md, 'utf8')).toBe(skill('Testa'));
    expect(scanInventory('codex', project, home).find((i) => i.name === 'testar')?.mode).toBe('manual');
    setSkillMode('codex', md, 'auto');
    expect(fs.readFileSync(yaml, 'utf8')).toBe('policy:\n  allow_implicit_invocation: true\n');
    // arquivo que já tem outras chaves: só a política entra
    fs.writeFileSync(yaml, 'interface:\n  display_name: "Testar"\n');
    setSkillMode('codex', md, 'manual');
    expect(fs.readFileSync(yaml, 'utf8')).toBe('interface:\n  display_name: "Testar"\npolicy:\n  allow_implicit_invocation: false\n');
  });
});

describe('servidores MCP nos arquivos de cada ferramenta', () => {
  const stdio = { name: 'github', transport: 'stdio' as const, command: 'npx', args: ['-y', 'gh-mcp'], env: { TOKEN: 'abc' }, url: '', headers: {} };
  const http = { name: 'docs', transport: 'http' as const, command: '', args: [], env: {}, url: 'https://exemplo.dev/mcp', headers: { Authorization: 'Bearer x' } };
  const at = (tool: 'claude' | 'codex' | 'cursor' | 'kimi' | 'copilot', label: string) => mcpTargets(tool).find((t) => t.label === label)!.source;
  const json = (base: string, rel: string) => JSON.parse(fs.readFileSync(path.join(base, rel), 'utf8'));

  it('grava no formato de cada arquivo, preservando o que já estava lá', () => {
    const mcp = new McpServers(project, home);
    write(project, '.mcp.json', JSON.stringify({ outraChave: 1, mcpServers: { 'faz-ai': { command: 'node' } } }));
    mcp.add('claude', at('claude', '.mcp.json'), stdio);
    mcp.add('claude', at('claude', '.mcp.json'), http);
    expect(json(project, '.mcp.json')).toEqual({ outraChave: 1, mcpServers: { 'faz-ai': { command: 'node' }, github: { type: 'stdio', command: 'npx', args: ['-y', 'gh-mcp'], env: { TOKEN: 'abc' } }, docs: { type: 'http', url: 'https://exemplo.dev/mcp', headers: { Authorization: 'Bearer x' } } } });
    mcp.add('cursor', at('cursor', '~/.cursor/mcp.json'), stdio);
    expect(json(home, '.cursor/mcp.json')).toEqual({ mcpServers: { github: { command: 'npx', args: ['-y', 'gh-mcp'], env: { TOKEN: 'abc' } } } });
    mcp.add('kimi', at('kimi', '.kimi-code/mcp.json'), stdio);
    expect(json(project, '.kimi-code/mcp.json').mcpServers.github.transport).toBe('stdio');
    mcp.add('copilot', at('copilot', '.vscode/mcp.json'), http);
    expect(json(project, '.vscode/mcp.json')).toEqual({ servers: { docs: { type: 'http', url: 'https://exemplo.dev/mcp', headers: { Authorization: 'Bearer x' } } } });
    mcp.add('copilot', at('copilot', '~/.copilot/mcp-config.json'), stdio);
    expect(json(home, '.copilot/mcp-config.json').mcpServers.github.tools).toEqual(['*']);
    // o ~/.claude.json não é um alvo de escrita
    expect(mcpTargets('claude').map((t) => t.label)).toEqual(['.mcp.json']);
  });

  it('recusa nome repetido, dados incompletos e arquivo com comentários', () => {
    const mcp = new McpServers(project, home);
    mcp.add('claude', at('claude', '.mcp.json'), stdio);
    expect(() => mcp.add('claude', at('claude', '.mcp.json'), stdio)).toThrow('Já existe');
    expect(() => mcp.add('claude', at('claude', '.mcp.json'), { ...stdio, name: 'com espaço' })).toThrow('Nome inválido');
    expect(() => mcp.add('claude', at('claude', '.mcp.json'), { ...stdio, name: 'x', command: ' ' })).toThrow('comando');
    expect(() => mcp.add('claude', at('claude', '.mcp.json'), { ...http, url: 'exemplo' })).toThrow('endereço');
    write(project, '.vscode/mcp.json', '{\n  // comentário\n  "servers": {}\n}');
    expect(() => mcp.add('copilot', at('copilot', '.vscode/mcp.json'), stdio)).toThrow('edite-o à mão');
    expect(fs.readFileSync(path.join(project, '.vscode/mcp.json'), 'utf8')).toContain('// comentário');
  });

  it('Codex: acrescenta e remove a tabela do servidor no config.toml sem tocar no resto', () => {
    const mcp = new McpServers(project, home);
    write(home, '.codex/config.toml', 'model = "gpt"\n\n[mcp_servers.faz-ai]\ncommand = "node"\n\n[features]\nhooks = true\n');
    mcp.add('codex', at('codex', '~/.codex/config.toml'), stdio);
    mcp.add('codex', at('codex', '~/.codex/config.toml'), { ...http, name: 'com.ponto' });
    const toml = () => fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    expect(toml()).toContain('[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "gh-mcp"]\n\n[mcp_servers.github.env]\nTOKEN = "abc"');
    expect(toml()).toContain('[mcp_servers."com.ponto"]\nurl = "https://exemplo.dev/mcp"\n\n[mcp_servers."com.ponto".http_headers]\nAuthorization = "Bearer x"');
    expect(() => mcp.add('codex', at('codex', '~/.codex/config.toml'), stdio)).toThrow('Já existe');
    const items = () => scanInventory('codex', project, home).filter((i) => i.kind === 'mcp');
    expect(items().map((i) => i.name)).toEqual(['faz-ai', 'github', 'com.ponto']);
    mcp.remove('codex', items().find((i) => i.name === 'github')!);
    expect(items().map((i) => i.name)).toEqual(['faz-ai', 'com.ponto']);
    expect(toml()).not.toContain('TOKEN');
    expect(toml()).toContain('[features]\nhooks = true');
    expect(toml()).toContain('model = "gpt"');
  });

  it('remove do arquivo certo e nunca de plugin nem do ~/.claude.json', () => {
    const mcp = new McpServers(project, home);
    mcp.add('claude', at('claude', '.mcp.json'), stdio);
    write(home, '.claude.json', JSON.stringify({ mcpServers: { global: { command: 'x' } } }));
    write(home, '.claude/plugins/loja/p/.claude-plugin/plugin.json', '{"name":"p"}');
    write(home, '.claude/plugins/loja/p/.mcp.json', JSON.stringify({ mcpServers: { deplugin: { command: 'y' } } }));
    const item = (name: string) => scanInventory('claude', project, home).find((i) => i.kind === 'mcp' && i.name === name)!;
    expect(() => mcp.remove('claude', item('global'))).toThrow('não edita');
    expect(() => mcp.remove('claude', item('deplugin'))).toThrow('plugin');
    mcp.remove('claude', item('github'));
    expect(json(project, '.mcp.json')).toEqual({ mcpServers: {} });
  });
});
