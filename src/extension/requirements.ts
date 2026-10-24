import { isReadyCli, isReadyProfile } from '../shared/aiProfiles';
import type { AiProfile } from '../shared/aiProfiles';
import { profileCanProbe } from './cliProbe';
import { toolModeEntry } from '../shared/aiTools';
import type { HarnessIssue } from '../shared/harnessStatus';
import { boardAvailability, type ProfileHealth } from '../shared/profileHealth';
import type { BoardRequirement } from '../shared/requirements';
import { driverOf } from './ai/drivers';

// onde cada ferramenta lê o servidor do board vem do driver dela (história 13); a leitura continua exportada daqui
export { registeredServer } from './mcp/boardServer';
export type { Registered } from './mcp/clientConfig';

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
        // o board refaz sozinho: o Diagnóstico mostra o andamento. Sem isso (a CLI do Claude, que roda quatro vezes
        // na sonda), a pessoa refaz: no Reconectar do perfil do catálogo, ou no "Verificar capacidades" do perfil
        // sem Conectar (a cópia), em Conectar agentes; o comando da paleta saiu na história 13
        action:
          h.evidenceInvalidated === 'automatic'
            ? { kind: 'diagnostic', profile: h.id }
            : isReadyProfile(h) && toolModeEntry(h.tool, h.mode)
              ? { kind: 'connect', profile: h.id }
              : { kind: 'aiTools', profile: h.id },
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
