import type { AiProfile } from '../../../shared/aiProfiles';
import { expandArgLines } from '../../../shared/aiProfiles';
import type { AiProvider } from '../provider';

/** Adapta a montagem nativa; autorização/evidência da base não é herdada pelo perfil. */
export function copyOf(base: AiProvider, profile: AiProfile): AiProvider {
  return {
    ...base,
    tool: profile.id,
    command: (input) => {
      const built = base.command(input);
      return {
        ...built,
        command: profile.config.command || built.command,
        env: { ...built.env, ...profile.config.env },
        args: [...built.args, ...expandArgLines(profile.config.extraArgs ?? [], {})],
      };
    },
  };
}
