// O item "MCP do board na ferramenta (sessões fora do board)" do Diagnóstico: o que cada arquivo da ferramenta diz
// sobre o servidor `faz-ai` (registrado para a ponte atual, para outra ponte, desligado ou ausente). Só leitura.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { boardMcpStatus, claudeDisabledIn } from '../src/extension/mcp/boardMcpStatus';

const tmps: string[] = [];
const tmp = (): string => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'board-mcp-')));
  tmps.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const write = (base: string, rel: string, data: unknown): string => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
};
const PROFILES = [
  { id: 'claude', name: 'Claude Code', tool: 'claude' as const },
  { id: 'cursor', name: 'Cursor', tool: 'cursor' as const },
  { id: 'kimi', name: 'Kimi Code', tool: 'kimi' as const },
];

describe('o MCP do board na ferramenta (boardMcpStatus)', () => {
  it('sem registro em nenhuma ferramenta, cada perfil fica "não registrado"; o Gemini não entra (não registra servidor)', () => {
    const home = tmp();
    const project = tmp();
    const bridgePath = path.join(home, '.faz-ai/mcp/bridge.js');
    const out = boardMcpStatus([...PROFILES, { id: 'gemini', name: 'Gemini CLI', tool: 'gemini' }], {
      workspaceDir: project,
      homeDir: home,
      bridgePath,
    });
    expect(out).toEqual([
      { profile: 'claude', name: 'Claude Code', tool: 'claude', state: 'unregistered' },
      { profile: 'cursor', name: 'Cursor', tool: 'cursor', state: 'unregistered' },
      { profile: 'kimi', name: 'Kimi Code', tool: 'kimi', state: 'unregistered' },
    ]);
  });
  it('registrado para a ponte atual com um comando que existe: pronto, com o arquivo de cada ferramenta', () => {
    const home = tmp();
    const project = tmp();
    const bridgePath = path.join(home, '.faz-ai/mcp/bridge.js');
    const entry = { type: 'stdio', command: process.execPath, args: [bridgePath] };
    write(home, '.claude.json', { mcpServers: { 'faz-ai': entry } });
    write(project, '.cursor/mcp.json', { mcpServers: { 'faz-ai': { ...entry, args: [bridgePath, project] } } });
    write(home, '.kimi-code/mcp.json', { mcpServers: { 'faz-ai': entry } });
    const out = boardMcpStatus(PROFILES, { workspaceDir: project, homeDir: home, bridgePath });
    expect(out.map((s) => [s.profile, s.state, s.file])).toEqual([
      ['claude', 'registered', '~/.claude.json'],
      ['cursor', 'registered', '.cursor/mcp.json'],
      ['kimi', 'registered', '~/.kimi-code/mcp.json'],
    ]);
  });
  it('o registro de uma versão anterior (outra ponte) ou com um node que sumiu fica "desatualizado", com o motivo', () => {
    const home = tmp();
    const project = tmp();
    const bridgePath = path.join(home, '.faz-ai/mcp/bridge.js');
    write(home, '.claude.json', { mcpServers: { 'faz-ai': { command: process.execPath, args: ['/antiga/mcp/bridge.js'] } } });
    write(home, '.kimi-code/mcp.json', { mcpServers: { 'faz-ai': { command: '/node/que/sumiu', args: [bridgePath] } } });
    const out = boardMcpStatus(PROFILES, { workspaceDir: project, homeDir: home, bridgePath });
    expect(out[0]).toMatchObject({ profile: 'claude', state: 'outdated', reason: 'bridge', file: '~/.claude.json' });
    expect(out[2]).toMatchObject({ profile: 'kimi', state: 'outdated', reason: 'command' });
  });
  it('no Claude Code, o servidor desligado pelo /mcp (disabledMcpServers no ~/.claude.json, global ou do projeto) e o do .mcp.json recusado pelos settings', () => {
    const home = tmp();
    const project = tmp();
    const bridgePath = path.join(home, '.faz-ai/mcp/bridge.js');
    const entry = { command: process.execPath, args: [bridgePath] };
    const claude = [PROFILES[0]!];
    write(home, '.claude.json', { mcpServers: { 'faz-ai': entry }, disabledMcpServers: ['faz-ai'] });
    expect(boardMcpStatus(claude, { workspaceDir: project, homeDir: home, bridgePath })[0]).toMatchObject({
      state: 'disabled',
      file: '~/.claude.json',
    });
    write(home, '.claude.json', { mcpServers: { 'faz-ai': entry }, projects: { [project]: { disabledMcpServers: ['outro', 'faz-ai'] } } });
    expect(boardMcpStatus(claude, { workspaceDir: project, homeDir: home, bridgePath })[0]).toMatchObject({ state: 'disabled' });
    // outra pasta desligada não conta para esta
    write(home, '.claude.json', { mcpServers: { 'faz-ai': entry }, projects: { '/outro/projeto': { disabledMcpServers: ['faz-ai'] } } });
    expect(boardMcpStatus(claude, { workspaceDir: project, homeDir: home, bridgePath })[0]).toMatchObject({ state: 'registered' });
    // o servidor do .mcp.json do projeto, recusado no settings local
    write(home, '.claude.json', {});
    write(project, '.mcp.json', { mcpServers: { 'faz-ai': entry } });
    write(project, '.claude/settings.local.json', { disabledMcpjsonServers: ['faz-ai'] });
    expect(boardMcpStatus(claude, { workspaceDir: project, homeDir: home, bridgePath })[0]).toMatchObject({
      state: 'disabled',
      file: '.claude/settings.local.json',
    });
    expect(claudeDisabledIn({ workspaceDir: project, homeDir: home })).toBe('.claude/settings.local.json');
    // um ~/.claude.json que não é JSON não derruba a conferência
    fs.writeFileSync(path.join(home, '.claude.json'), '{');
    fs.rmSync(path.join(project, '.claude'), { recursive: true });
    expect(boardMcpStatus(claude, { workspaceDir: project, homeDir: home, bridgePath })[0]).toMatchObject({
      state: 'registered',
      file: '.mcp.json',
    });
  });
});
