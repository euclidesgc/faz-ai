import type { AiProfile } from '../../../shared/aiProfiles';
import { expandArgLines } from '../../../shared/aiProfiles';
import type { AiProvider } from '../provider';

/** Adapta a montagem nativa; autorização/evidência da base não é herdada pelo perfil. */
export function copyOf(base: AiProvider, profile: AiProfile): AiProvider {
  return {
    ...base,
    tool: profile.id,
    // a retomada documentada é da CLI da base; a cópia pode trocar o comando e os argumentos, então não herda
    resumable: false,
    command: (input) => {
      const { resume: _resume, ...rest } = input;
      const built = base.command(rest);
      return {
        ...built,
        command: profile.config.command || built.command,
        env: { ...built.env, ...profile.config.env },
        args: [...built.args, ...expandArgLines(profile.config.extraArgs ?? [], {})],
      };
    },
  };
}
