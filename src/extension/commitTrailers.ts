import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Os nomes dos trailers, que a história #1164 também vai ler. */
export const TRAILER_KEYS = { card: 'Faz-AI-Card', phase: 'Faz-AI-Phase', run: 'Faz-AI-Run' } as const;

export interface CommitTrailerValues {
  /** número do card que a run executa (sub-tarefa ou história) */
  card: number;
  /** coluna da história no início da run */
  phase: string;
  /** id da linha em ai_runs */
  runId: string;
}

export interface CommitTrailerKit {
  readonly dir: string;
  /**
   * As variáveis a somar no ambiente do processo, calculadas sobre o ambiente que ele vai receber
   * (`base`): os pares GIT_CONFIG_* da pessoa ficam, e o do board entra no índice seguinte.
   * Devolve {} quando `base` traz um GIT_CONFIG_COUNT inválido, e aí a run segue sem trailers.
   */
  env(base: Readonly<Record<string, string | undefined>>): Record<string, string>;
  /** Apaga a pasta. Idempotente, nunca lança. */
  dispose(): void;
}

const KIT_PREFIX = 'fazai-run-hooks-';

/** Hooks client-side repassados ao hook original (githooks(5)); os de servidor e o fsmonitor ficam fora. */
const PASSTHROUGH_HOOKS = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'post-rewrite',
  'reference-transaction',
  'pre-auto-gc',
  'post-index-change',
  'sendemail-validate',
] as const;

/** "git version 2.39.3 (Apple Git-146)" → true quando ≥ 2.31 (GIT_CONFIG_COUNT). */
export function supportsConfigEnv(versionOutput: string): boolean {
  const m = /(\d+)\.(\d+)/.exec(versionOutput);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 2 || (major === 2 && minor >= 31);
}

/**
 * Acha o hook a que repassar: o do `core.hooksPath` em vigor antes deste kit. O índice vem do par
 * GIT_CONFIG_* que aponta para a pasta do próprio kit, e não de FAZ_AI_GIT_CONFIG_COUNT: numa
 * execução dentro de outra, o kit de dentro sobrescreve essa variável, e o de fora acharia a si
 * mesmo e faria `exec` em laço (git init/add/commit travavam). Se ainda assim o alvo for o próprio
 * kit, cai no `hooks` do repositório em vez de chamar a si mesmo.
 */
function findOriginal(name: string): string {
  return [
    '#!/bin/sh',
    '# Faz AI: repassa ao hook do repositório (só existe no processo da run do board)',
    'self=$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)',
    'n="${FAZ_AI_GIT_CONFIG_COUNT:-0}"',
    'total="${GIT_CONFIG_COUNT:-0}"',
    'case "$total" in ""|*[!0-9]*) total=0 ;; esac',
    'i=0',
    'while [ "$i" -lt "$total" ]; do',
    '  eval "k=\\${GIT_CONFIG_KEY_$i-}; v=\\${GIT_CONFIG_VALUE_$i-}"',
    '  if [ "$k" = core.hooksPath ] && [ -n "$v" ] && [ "$(cd "$v" 2>/dev/null && pwd -P)" = "$self" ]; then',
    '    n=$i',
    '    break',
    '  fi',
    '  i=$((i + 1))',
    'done',
    'orig=$(GIT_CONFIG_COUNT="$n" git config --get core.hooksPath)',
    'if [ -z "$orig" ] || [ "$(cd "$orig" 2>/dev/null && pwd -P)" = "$self" ]; then',
    '  orig="$(git rev-parse --git-common-dir)/hooks"',
    'fi',
    `hook="$orig/${name}"`,
  ].join('\n');
}

/** Os hooks de repasse (nomes client-side) e o prepare-commit-msg do board: nome → conteúdo `sh`. */
export function hookScripts(): Record<string, string> {
  const scripts: Record<string, string> = {};
  for (const name of PASSTHROUGH_HOOKS) {
    scripts[name] = `${findOriginal(name)}\n[ -x "$hook" ] || exit 0\nexec "$hook" "$@"\n`;
  }
  scripts['prepare-commit-msg'] = [
    findOriginal('prepare-commit-msg'),
    'if [ -x "$hook" ]; then',
    '  "$hook" "$@" || exit $?',
    'fi',
    '[ -n "$FAZ_AI_TRAILER_RUN" ] || exit 0',
    'git interpret-trailers --in-place --if-exists replace \\',
    `  --trailer "${TRAILER_KEYS.card}: $FAZ_AI_TRAILER_CARD" \\`,
    `  --trailer "${TRAILER_KEYS.phase}: $FAZ_AI_TRAILER_PHASE" \\`,
    `  --trailer "${TRAILER_KEYS.run}: $FAZ_AI_TRAILER_RUN" "$1"`,
    '',
  ].join('\n');
  return scripts;
}

function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* melhor esforço */
  }
}

/** Cria a pasta `fazai-run-hooks-*` (0o700) e grava os hooks (0o755). Lança na falha, já sem deixar resto. */
export function createKit(values: CommitTrailerValues, tempRoot: string = os.tmpdir()): CommitTrailerKit {
  const dir = fs.mkdtempSync(path.join(tempRoot, KIT_PREFIX));
  try {
    fs.chmodSync(dir, 0o700);
    for (const [name, content] of Object.entries(hookScripts())) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, content, { mode: 0o755 });
      fs.chmodSync(file, 0o755);
    }
  } catch (err) {
    removeDir(dir);
    throw err;
  }
  return {
    dir,
    env(base): Record<string, string> {
      const raw = base.GIT_CONFIG_COUNT;
      let prev = 0;
      if (raw !== undefined && raw !== '') {
        if (!/^\d+$/.test(raw.trim())) return {};
        prev = Number(raw.trim());
      }
      return {
        GIT_CONFIG_COUNT: String(prev + 1),
        [`GIT_CONFIG_KEY_${prev}`]: 'core.hooksPath',
        [`GIT_CONFIG_VALUE_${prev}`]: dir,
        FAZ_AI_GIT_CONFIG_COUNT: String(prev),
        FAZ_AI_TRAILER_CARD: `#${values.card}`,
        FAZ_AI_TRAILER_PHASE: values.phase.replace(/[\r\n]/g, ' '),
        FAZ_AI_TRAILER_RUN: values.runId,
      };
    },
    dispose() {
      removeDir(dir);
    },
  };
}

/** Os trailers do host: lê a versão do git uma vez e avisa uma vez quando ela não serve. */
export class CommitTrailers {
  private supported: boolean | undefined;
  private warned = false;

  constructor(private readonly deps: { gitVersion(): string | null; tempRoot?: string }) {}

  /** null quando o git não serve ou a pasta não pôde ser criada (o motivo vai para `log`); nunca lança. */
  prepare(values: CommitTrailerValues, log: (line: string) => void): CommitTrailerKit | null {
    try {
      if (this.supported === undefined) {
        let out: string | null = null;
        try {
          out = this.deps.gitVersion();
        } catch {
          out = null;
        }
        this.supported = out !== null && supportsConfigEnv(out);
      }
      if (!this.supported) {
        if (!this.warned) {
          this.warned = true;
          log('Trailers de rastreio desligados: o git desta máquina não aceita GIT_CONFIG_COUNT (precisa da 2.31 ou mais nova).');
        }
        return null;
      }
      return createKit(values, this.deps.tempRoot);
    } catch (err) {
      try {
        log(`Trailers de rastreio indisponíveis nesta execução: ${err instanceof Error ? err.message : String(err)}`);
      } catch {
        /* nunca lança */
      }
      return null;
    }
  }
}
