// O MCP do board na ferramenta de cada perfil de CLI, para o item "MCP do board na ferramenta" do Diagnóstico. As
// execuções do board entregam o MCP elas mesmas, então o registro na ferramenta não é requisito; mas as sessões fora
// do board (o chat do editor, o terminal) dependem dele, e a pessoa via o servidor desligado sem aviso nenhum. Só
// leitura: quem registra é `registerClients` (o comando "Faz AI: Instalar o MCP do board").
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../../shared/harness';
import type { BoardMcpStatus } from '../../shared/environment';
import { byPath, samePath } from '../samePath';
import { resolveCommand } from '../cliResolve';
import { registeredServer } from './boardServer';

const SERVER = 'faz-ai';

export interface BoardMcpOptions {
  workspaceDir: string;
  homeDir: string;
  /** a ponte atual (`~/.faz-ai/mcp/bridge.js`): o registro que aponta para outra é de uma versão anterior */
  bridgePath: string;
  /** o PATH do terminal, para conferir o comando do registro quando ele não é absoluto */
  pathEnv?: string;
}

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const listHas = (list: unknown, name: string): boolean => Array.isArray(list) && list.includes(name);

/**
 * Onde o Claude Code desliga um servidor sem apagá-lo (documentação conferida em 2026-11-01): o botão do `/mcp`
 * grava `disabledMcpServers` no `~/.claude.json`, no topo ou dentro de `projects[<pasta>]`; o servidor do
 * `.mcp.json` do projeto é recusado por `disabledMcpjsonServers`, no mesmo arquivo (por projeto) ou em qualquer
 * settings (`~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`). Devolve o arquivo
 * em que a lista desligou o `faz-ai`, ou null.
 */
export function claudeDisabledIn(o: Pick<BoardMcpOptions, 'workspaceDir' | 'homeDir'>, server = SERVER): string | null {
  const userFile = path.join(o.homeDir, '.claude.json');
  const user = readJson(userFile);
  const project = byPath(user?.projects as Record<string, Record<string, unknown>> | undefined, o.workspaceDir);
  for (const section of [user, project])
    if (listHas(section?.disabledMcpServers, server) || listHas(section?.disabledMcpjsonServers, server)) return '~/.claude.json';
  const settings: [string, string][] = [
    [path.join(o.homeDir, '.claude', 'settings.json'), '~/.claude/settings.json'],
    [path.join(o.workspaceDir, '.claude', 'settings.json'), '.claude/settings.json'],
    [path.join(o.workspaceDir, '.claude', 'settings.local.json'), '.claude/settings.local.json'],
  ];
  for (const [file, shown] of settings) if (listHas(readJson(file)?.disabledMcpjsonServers, server)) return shown;
  return null;
}

/**
 * A situação do MCP do board na ferramenta de cada perfil de CLI ligado: registrado e apontando para a ponte atual
 * com um comando que existe (`registered`), registrado para outra ponte ou com um node que sumiu (`outdated`),
 * desligado no arquivo da ferramenta (`disabled`, só no Claude Code: o Cursor e o Kimi guardam isso fora dos
 * arquivos documentados) ou sem registro (`unregistered`). Uma ferramenta sem suporte ao servidor do board (o
 * Gemini) fica de fora.
 */
export function boardMcpStatus(profiles: { id: string; name: string; tool: AiTool }[], o: BoardMcpOptions): BoardMcpStatus[] {
  const out: BoardMcpStatus[] = [];
  for (const p of profiles) {
    if (!['claude', 'cursor', 'kimi'].includes(p.tool)) continue;
    const registered = registeredServer(p.tool, o.workspaceDir, o.homeDir);
    const base = { profile: p.id, name: p.name, tool: p.tool };
    if (!registered) {
      out.push({ ...base, state: 'unregistered' });
      continue;
    }
    const disabledIn = p.tool === 'claude' ? claudeDisabledIn(o) : null;
    const bridge = registered.args[0];
    const commandOk = !!resolveCommand(registered.command, o.pathEnv, o.homeDir);
    const current = !!bridge && samePath(bridge, o.bridgePath) && commandOk;
    out.push({
      ...base,
      state: disabledIn ? 'disabled' : current ? 'registered' : 'outdated',
      file: disabledIn ?? registered.file,
      ...(current || disabledIn ? {} : { reason: !commandOk ? 'command' : 'bridge' }),
    });
  }
  return out;
}
