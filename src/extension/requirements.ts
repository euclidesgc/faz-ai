import { isReadyCli, isReadyProfile } from '../shared/aiProfiles';
import type { AiProfile } from '../shared/aiProfiles';
import { profileCanProbe } from './cliProbe';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import type { HarnessIssue } from '../shared/harnessStatus';
import { boardAvailability, type ProfileHealth } from '../shared/profileHealth';
import type { BoardRequirement } from '../shared/requirements';
import { driverOf } from './ai/drivers';
import { byPath } from './samePath';
import { kimiHome } from './mcp/clientConfig';

/** Onde a ferramenta lê o servidor do board, e o que está registrado lá. */
export interface Registered {
  /** o arquivo, como a pessoa o reconhece (relativo ao projeto ou com `~`) */
  file: string;
  /** o arquivo, com o caminho completo */
  path: string;
  /** do projeto (vale sobre o global na ferramenta) ou do usuário */
  scope: 'project' | 'user';
  command: string;
  args: string[];
}

const SERVER = 'faz-ai';

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** O registro de um servidor (por padrão, o do board) num JSON (`mcpServers`). */
function fromJson(file: string, shown: string, server = SERVER): Registered | null {
  const section = readJson(file)?.mcpServers as Record<string, { command?: unknown; args?: unknown }> | undefined;
  const entry = section?.[server];
  if (!entry || typeof entry.command !== 'string') return null;
  return {
    file: shown,
    path: file,
    scope: scopeOf(shown),
    command: entry.command,
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
  };
}

/** O arquivo mostrado com `~` é do usuário; o relativo é do projeto. */
const scopeOf = (shown: string): Registered['scope'] => (shown.startsWith('~') ? 'user' : 'project');

/**
 * O servidor do board no arquivo que a ferramenta lê nas conversas da pessoa (fora do board), nos
 * mesmos lugares em que a instalação do MCP grava: primeiro o do projeto, que vale sobre o global
 * nas ferramentas, e depois o global. null quando não está registrado.
 */
export function registeredServer(tool: AiTool, workspaceDir: string, homeDir: string, server = SERVER): Registered | null {
  const inProject = (rel: string) => path.join(workspaceDir, rel);
  const inHome = (rel: string) => path.join(homeDir, rel);
  switch (tool) {
    case 'claude': {
      // `claude mcp add` grava no projeto (.mcp.json) ou no ~/.claude.json: para o usuário inteiro,
      // ou só para esta pasta (escopo "local", dentro de `projects`)
      const found = fromJson(inProject('.mcp.json'), '.mcp.json', server);
      if (found) return found;
      const user = readJson(inHome('.claude.json'));
      const local = byPath(user?.projects as Record<string, Record<string, unknown>> | undefined, workspaceDir);
      for (const section of [local?.mcpServers, user?.mcpServers]) {
        const entry = (section as Record<string, { command?: unknown; args?: unknown }> | undefined)?.[server];
        if (entry && typeof entry.command === 'string')
          return {
            file: '~/.claude.json',
            path: inHome('.claude.json'),
            scope: 'user',
            command: entry.command,
            args: Array.isArray(entry.args) ? entry.args.map(String) : [],
          };
      }
      return null;
    }
    // o global do Cursor é um processo só para todas as janelas e não sabe qual board atender: não conta
    case 'cursor':
      return fromJson(inProject('.cursor/mcp.json'), '.cursor/mcp.json', server);
    // Kimi Code: primeiro o do projeto (que vale sobre o global), depois o da pasta de dados dele
    case 'kimi':
      return (
        fromJson(inProject('.kimi-code/mcp.json'), '.kimi-code/mcp.json', server) ??
        fromJson(path.join(kimiHome(homeDir), 'mcp.json'), '~/.kimi-code/mcp.json', server)
      );
  }
  return null;
}

export interface RequirementProbe {
  /** o node encontrado no PATH do terminal, com caminho absoluto */
  nodePath: string | undefined;
  /** a saúde de cada perfil de CLI (só os ligados entram no aviso) */
  health: readonly ProfileHealth[];
  /** o que falta no banco de artefatos do board; ausente quando não dá para saber (sem o inventário) */
  harnessIssues?: HarnessIssue[];
}

/**
 * O que falta, agora, para o board trabalhar. Lista vazia é tudo pronto. A ordem é a de resolver:
 * sem o Node.js o servidor do board não sobe, depois o perfil, por último a recomendação do harness.
 * O aviso só bloqueia quando nenhum perfil ligado está disponível; o problema de um perfil, com outro
 * disponível, vira o aviso dele.
 */
export function checkRequirements(p: RequirementProbe): BoardRequirement[] {
  const out: BoardRequirement[] = [];
  if (!p.nodePath) out.push({ id: 'node', action: null });
  const availability = boardAvailability(p.health);
  if (availability.blocked) out.push({ id: 'no-profile', reason: availability.reason, action: { kind: 'diagnostic' } });
  for (const w of availability.warnings) {
    const health = p.health.find((h) => h.id === w.id)!;
    // o login dos prontos tem comando conhecido, o do driver da CLI; o da ferramenta que entra por chave de API
    // (o Gemini pelo ACP) é o Conectar; o dos demais se resolve pelo bloco do perfil
    const auth = isReadyProfile(health) && w.problem === 'signin' ? driverOf(health)?.auth : undefined;
    const login = isReadyCli(health) && auth?.kind === 'login-command' ? auth.command : undefined;
    const viaConnect = auth?.kind === 'api-key';
    out.push({
      id: 'profile',
      profile: w.id,
      name: w.name,
      problem: w.problem,
      ...(w.problem === 'signin' && health.authExpired && health.probe?.login !== 'signed-out' ? { expired: true as const } : {}),
      optional: true,
      action: login
        ? { kind: 'command', command: login, terminal: true }
        : viaConnect
          ? { kind: 'connect', profile: w.id }
          : { kind: 'diagnostic', profile: w.id },
    });
  }
  // a prova de capacidades que perdeu a validade não impede o perfil: só avisa, e só quando nada mais o impede
  for (const h of p.health)
    if (h.registration === 'enabled' && !h.problem && h.evidenceInvalidated)
      out.push({
        id: 'profile',
        profile: h.id,
        name: h.name,
        problem: 'evidence-invalidated',
        ...(h.evidenceInvalidated === 'automatic' ? { automatic: true as const } : {}),
        optional: true,
        action: { kind: 'diagnostic', profile: h.id },
      });
  // o harness definido é recomendação, não requisito: o board trabalha sem ele, só sem a economia de contexto
  if (p.harnessIssues?.length) out.push({ id: 'harness', optional: true, harnessIssues: p.harnessIssues, action: { kind: 'settings' } });
  return out;
}

/** Link de instalação é metadado público revisado; URLs com credenciais/parâmetros não são divulgadas. */
export function profileInstallUrl(profile: AiProfile): string | null {
  if (!profileCanProbe(profile) || isReadyCli(profile) || typeof profile.config.installUrl !== 'string') return null;
  try {
    const value = profile.config.installUrl.trim(),
      url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? value : null;
  } catch {
    return null;
  }
}
