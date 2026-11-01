/**
 * #604: reduz o comando de uma chamada de Bash aos termos que identificam o que rodou, sem argumentos
 * (que podem ter caminhos ou dados da pessoa). Um termo por segmento de um comando encadeado.
 */

/**
 * Executáveis cujo subcomando também é guardado (`npm test`, `git status`). `node` não entra: o que
 * vem depois dele é um arquivo, e o nome do arquivo é argumento.
 */
const WITH_SUBCOMMAND = new Set(['npm', 'npx', 'git', 'pnpm', 'yarn', 'docker', 'gh', 'cargo', 'go', 'make']);
/** Um verbo de subcomando: minúsculas e hífen, sem ponto nem barra, para não gravar nome de arquivo. */
const VERB = /^[a-z][a-z-]*$/;
const SAFE_WORD = /^[A-Za-z0-9._-]+$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function bashCommandTerms(command: string): string[] {
  const terms: string[] = [];
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length && ASSIGNMENT.test(words[0]!)) words.shift();
    if (!words.length) continue;
    const exec = words[0]!;
    if (exec === 'cd') continue;
    const base = exec.includes('/') ? exec.slice(exec.lastIndexOf('/') + 1) : exec;
    if (!SAFE_WORD.test(base)) {
      terms.push('outro');
      continue;
    }
    const sub = words[1];
    if (WITH_SUBCOMMAND.has(base) && sub && VERB.test(sub)) terms.push(`${base} ${sub}`);
    else terms.push(base);
  }
  return terms;
}
