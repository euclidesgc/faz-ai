import type { AiProfile } from '../shared/aiProfiles';
import type { AiTool } from '../shared/harness';
import type { LoginState, ProfileProbe } from '../shared/profileHealth';

/** O que o probe de um perfil precisa do host: tudo injetável, para o teste não rodar nenhuma CLI. */
export interface ProfileProbeDeps {
  /** o executável do perfil, ou null */
  resolve(profile: AiProfile): string | null;
  /** a versão pelo comando do perfil; null quando ele não diz */
  version(profile: AiProfile, executable: string): Promise<string | null>;
  /** o login pelo comando de status do perfil; null quando o perfil não tem como dizer */
  signedIn(profile: AiProfile, executable: string): Promise<boolean | null>;
}

/** Importado e ainda não revisado: nenhum comando dele roda antes de a pessoa revisar. */
export const isPendingReview = (profile: AiProfile): boolean => profile.credentials?.review === 'pending';

/**
 * Os probes locais, sem inferência: binário, versão e login de cada perfil, em paralelo (um perfil
 * lento não segura os outros). O perfil pendente de revisão não roda nada e fica fora do resultado.
 */
export async function probeProfiles(profiles: readonly AiProfile[], deps: ProfileProbeDeps): Promise<Map<AiTool, ProfileProbe>> {
  const probed = await Promise.all(
    profiles
      .filter((p) => !isPendingReview(p))
      .map(async (profile): Promise<ProfileProbe> => {
        // o modo API não tem binário: quem fala com a rede é a extensão, então ele está sempre presente. O
        // login é a chave no cofre (só a presença, sem rede: quem a confere é o Conectar)
        if (profile.mode === 'api') {
          const signedIn = await deps.signedIn(profile, '').catch(() => null);
          return { id: profile.id, found: true, login: signedIn === null ? 'unchecked' : signedIn ? 'signed-in' : 'signed-out' };
        }
        const executable = deps.resolve(profile);
        if (!executable) return { id: profile.id, found: false, login: 'unchecked' };
        const [version, signedIn] = await Promise.all([
          deps.version(profile, executable).catch(() => null),
          deps.signedIn(profile, executable).catch(() => null),
        ]);
        const login: LoginState = signedIn === null ? 'unchecked' : signedIn ? 'signed-in' : 'signed-out';
        return { id: profile.id, found: true, path: executable, ...(version ? { version } : {}), login };
      }),
  );
  return new Map(probed.map((p) => [p.id, p]));
}
