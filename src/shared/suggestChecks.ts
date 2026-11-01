import type { ProjectProfile } from './projectProfile';

/** Primeiro script que o projeto tem, na ordem dada; vazio quando nenhum existe. */
const firstScript = (scripts: Record<string, string>, names: string[]): string | undefined => names.find((n) => n in scripts);

/**
 * As checagens que o perfil do projeto sugere para uma coluna: tipos, lint, os testes dos arquivos alterados (só
 * com Vitest) e a suíte. A lista é conservadora de propósito: script que não é reconhecido fica de fora, e o
 * perfil vazio não sugere nada. Função pura: quem decide o que gravar é a pessoa.
 */
export function suggestChecks(profile: ProjectProfile): string[] {
  const out: string[] = [];
  const typecheck = firstScript(profile.scripts, ['typecheck', 'type-check', 'tsc']);
  if (typecheck) out.push(`npm run ${typecheck}`);
  if ('lint' in profile.scripts) out.push('npm run lint');
  // só os testes tocados: rápido o bastante para rodar a cada saída da coluna, antes da suíte completa
  if (profile.tools.includes('vitest')) out.push('npx vitest related {changed_files} --run');
  if ('test' in profile.scripts) out.push('npm run test');
  return out;
}

/** A lista atual mais os comandos sugeridos que ainda faltam (comparados sem espaços nas pontas), sem repetir. */
export function mergeSuggestions(current: string[], suggested: string[]): string[] {
  const seen = new Set(current.map((c) => c.trim()));
  const out = [...current];
  for (const command of suggested) {
    const key = command.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(command);
  }
  return out;
}

/** Nome curto para a linha da checagem sugerida, derivado do comando. */
export function suggestedCheckName(command: string): string {
  const c = command.trim();
  if (/vitest related/.test(c)) return 'Testes alterados';
  if (/\b(typecheck|type-check|tsc)\b/.test(c)) return 'Tipos';
  if (/\blint\b/.test(c)) return 'Lint';
  if (/\btest\b/.test(c)) return 'Testes';
  return c.slice(0, 40);
}
