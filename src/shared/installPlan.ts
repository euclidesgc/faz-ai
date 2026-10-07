import type { EnvCheck, EnvCheckId, EnvironmentReport } from './environment';

/** Um passo do "Instalar tudo": o item e os comandos dele, na ordem de rodar. */
export interface InstallStep {
  id: EnvCheckId;
  commands: string[];
  /** os passos de que este depende: se um deles falhar, este é pulado (o login sem a CLI) */
  after: EnvCheckId[];
}

/** O resultado de cada passo, lido do arquivo que o script grava. */
export interface InstallStepResult {
  id: EnvCheckId;
  status: 'ok' | 'failed' | 'skipped';
  /** o comando que falhou e o código de saída dele */
  command?: string;
  code?: number;
  /** as últimas linhas do erro (no Windows, a mensagem do PowerShell; o resto fica no terminal) */
  error?: string;
  /** o passo que falhou antes e fez este ser pulado */
  because?: EnvCheckId;
}

/** De que passos cada item depende, quando os dois estão no mesmo "Instalar tudo". */
const AFTER: Partial<Record<EnvCheckId, EnvCheckId[]>> = {
  signin: ['cli'],
  repo: ['git'],
  'gh-auth': ['gh'],
  python: ['uv'],
  crg: ['uv'],
  'crg-graph': ['crg'],
  'crg-embeddings': ['crg'],
};

export interface InstallPlan {
  level: EnvCheck['level'];
  /** bash no Linux e no macOS; PowerShell no Windows */
  shell: 'bash' | 'powershell';
  steps: InstallStep[];
  /** a skill do fluxo, que o próprio board instala (não é comando de terminal) */
  installSkill: boolean;
  /** o que falta e não tem comando: fica com a pessoa (ligar o MCP, a permissão, um download) */
  manual: EnvCheckId[];
}

/** O nome do passo no script, igual em qualquer idioma (são nomes de programas). */
export const STEP_NAMES: Record<EnvCheckId, string> = {
  node: 'Node.js',
  cli: 'CLI',
  signin: 'CLI sign-in',
  mcp: 'MCP faz-ai',
  permission: 'Permission level',
  skill: 'Skill faz-ai-fluxo',
  git: 'Git',
  repo: 'git init',
  gh: 'GitHub CLI',
  'gh-auth': 'gh auth login',
  crg: 'Code Review Graph',
  uv: 'uv',
  python: 'Python',
  'crg-graph': 'code-review-graph build',
  'crg-mcp': 'MCP code-review-graph',
  'crg-embeddings': 'Code Review Graph [embeddings]',
};

/** Os comandos que resolvem o item: os do Diagnóstico ou, nos obrigatórios, o comando do aviso de requisitos. */
function commandsOf(c: EnvCheck): string[] | null {
  if (c.fix?.kind === 'commands') return c.fix.commands;
  if (c.requirement?.action?.kind === 'command') return [c.requirement.action.command];
  return null;
}

/**
 * O que o "Instalar tudo" de um nível roda: os itens que faltam e os que só esperam o anterior (o login
 * depois da CLI, o grafo depois do Code Review Graph), com os pré-requisitos antes do item. Comandos
 * repetidos (o `sudo apt update` do git e do gh) rodam uma vez só. null quando não há nada a fazer.
 */
export function installPlan(report: EnvironmentReport, level: EnvCheck['level']): InstallPlan | null {
  const pending = (c: EnvCheck) => c.level === level && c.status !== 'ok';
  const ordered = report.checks
    .filter((c) => !c.parent)
    .flatMap((c) => [...report.checks.filter((p) => p.parent === c.id), c])
    .filter(pending);
  const seen = new Set<string>();
  const steps: InstallStep[] = [];
  const manual: EnvCheckId[] = [];
  let installSkill = false;
  for (const c of ordered) {
    // o caminho completo dos MCPs o board grava sozinho no fim da instalação
    if (c.fix?.kind === 'pinMcp') continue;
    if (c.fix?.kind === 'installSkill') {
      installSkill = true;
      continue;
    }
    const commands = commandsOf(c);
    if (!commands) {
      // o que depende de outro item sem comando (o Python que o uv traz) não é tarefa da pessoa
      if (c.status === 'missing') manual.push(c.id);
      continue;
    }
    const fresh = commands.filter((cmd) => !seen.has(cmd));
    fresh.forEach((cmd) => seen.add(cmd));
    // a CLI instalada pelo npm (Codex, Copilot) precisa do Node do passo anterior
    const after = [...(AFTER[c.id] ?? []), ...(c.id === 'cli' && fresh.some((cmd) => cmd.startsWith('npm ')) ? ['node' as const] : [])];
    if (fresh.length) steps.push({ id: c.id, commands: fresh, after });
  }
  if (!steps.length && !installSkill) return null;
  return { level, shell: report.os.family === 'windows' ? 'powershell' : 'bash', steps, installSkill, manual };
}

const quoteSh = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
const quotePs = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * O script que roda o plano num terminal só: o PATH que um passo ajusta (o nvm, o uv, a CLI do Cursor
 * em ~/.local/bin) vale para os seguintes. Um passo que falha não para os outros: só os que dependem
 * dele são pulados. Com `resultFile`, cada passo grava ali o resultado (`ok`, `fail` com o código e o
 * comando, `skip` com o motivo) e o erro dele num arquivo ao lado; a última linha, `done`, avisa o
 * board de que acabou.
 */
export function installScript(plan: InstallPlan, resultFile?: string): string {
  return plan.shell === 'powershell' ? powershellScript(plan, resultFile) : bashScript(plan, resultFile);
}

function bashScript(plan: InstallPlan, resultFile?: string): string {
  const lines = [
    '#!/usr/bin/env bash',
    '# Faz AI: install script generated by the Environment Diagnostics',
    // onde a CLI do Cursor e o uv se instalam: os passos seguintes já os encontram
    'export PATH="$HOME/.local/bin:$PATH"',
    `FAZAI_RESULT=${quoteSh(resultFile ?? '/dev/null')}`,
    'FAZAI_ERR="$(mktemp)"',
    'FAZAI_FAILED=" "',
    // pula o passo quando um passo de que ele depende falhou
    'fazai_skip() { local id=$1; shift; for d in "$@"; do case "$FAZAI_FAILED" in *" $d "*) echo "skip $id $d" >> "$FAZAI_RESULT"; FAZAI_FAILED="$FAZAI_FAILED$id "; echo "Faz AI: skipped $id because $d failed."; return 0;; esac; done; return 1; }',
    // roda um comando do passo; o erro vai para a tela e para o arquivo do passo
    'fazai_run() { local id=$1 cmd=$2; : > "$FAZAI_ERR"; eval "$cmd" 2> >(tee -a "$FAZAI_ERR" >&2); local code=$?; sleep 0.2; if [ $code -ne 0 ]; then printf \'fail %s %s %s\\n\' "$id" "$code" "$cmd" >> "$FAZAI_RESULT"; [ "$FAZAI_RESULT" != /dev/null ] && tail -n 40 "$FAZAI_ERR" > "$FAZAI_RESULT.$id.err"; FAZAI_FAILED="$FAZAI_FAILED$id "; echo; echo "Faz AI: could not install $id (exit code $code). The board shows the error in the Environment Diagnostics."; return 1; fi; }',
  ];
  for (const s of plan.steps) {
    lines.push('', `echo; echo ${quoteSh(`==> ${STEP_NAMES[s.id]}`)}`);
    const run = s.commands.map((cmd) => `fazai_run ${s.id} ${quoteSh(cmd)}`).join(' && ');
    const skip = s.after.length ? `fazai_skip ${s.id} ${s.after.join(' ')} || ` : '';
    lines.push(`${skip}{ ${run} && echo "ok ${s.id}" >> "$FAZAI_RESULT"; }`);
  }
  lines.push(
    '',
    'rm -f "$FAZAI_ERR"',
    'echo',
    'if [ "$FAZAI_FAILED" = " " ]; then echo \'Faz AI: installation finished.\'; else echo "Faz AI: installation finished with failures:$FAZAI_FAILED"; fi',
    "echo 'The Environment Diagnostics will re-check on its own.'",
    'echo done >> "$FAZAI_RESULT"',
  );
  return lines.join('\n') + '\n';
}

function powershellScript(plan: InstallPlan, resultFile?: string): string {
  const lines = [
    '# Faz AI: install script generated by the Environment Diagnostics',
    `$FazAiResult = ${quotePs(resultFile ?? '')}`,
    '$FazAiFailed = @()',
    'function FazAi-Log($line) { if ($FazAiResult) { Add-Content -LiteralPath $FazAiResult -Value $line } }',
    // o winget grava o PATH novo no registro; a sessão aberta só o vê relendo
    "function Update-FazAiPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }",
    // a saída não é capturada (os instaladores perguntam no terminal): o erro do PowerShell vai para o arquivo
    'function FazAi-Run($id, $cmd) { try { $global:LASTEXITCODE = 0; Invoke-Expression $cmd; $code = $LASTEXITCODE; $msg = \'\' } catch { $code = 1; $msg = $_.Exception.Message }; if ($code -ne 0) { FazAi-Log "fail $id $code $cmd"; if ($FazAiResult -and $msg) { Set-Content -LiteralPath "$FazAiResult.$id.err" -Value $msg }; $script:FazAiFailed += $id; Write-Host ""; Write-Host "Faz AI: could not install $id (exit code $code). The board shows the error in the Environment Diagnostics."; return $false }; Update-FazAiPath; return $true }',
    'function FazAi-Skip($id, $deps) { foreach ($d in $deps) { if ($FazAiFailed -contains $d) { FazAi-Log "skip $id $d"; $script:FazAiFailed += $id; Write-Host "Faz AI: skipped $id because $d failed."; return $true } }; return $false }',
  ];
  for (const s of plan.steps) {
    lines.push('', `Write-Host ''; Write-Host ${quotePs(`==> ${STEP_NAMES[s.id]}`)}`);
    const deps = s.after.length ? `@(${s.after.map(quotePs).join(', ')})` : '@()';
    const run = s.commands.map((cmd) => `(FazAi-Run '${s.id}' ${quotePs(cmd)})`).join(' -and ');
    lines.push(`if (-not (FazAi-Skip '${s.id}' ${deps})) { if (${run}) { FazAi-Log 'ok ${s.id}' } }`);
  }
  lines.push(
    '',
    "Write-Host ''",
    "if ($FazAiFailed.Count -eq 0) { Write-Host 'Faz AI: installation finished.' } else { Write-Host \"Faz AI: installation finished with failures: $($FazAiFailed -join ', ')\" }",
    "Write-Host 'The Environment Diagnostics will re-check on its own.'",
    "FazAi-Log 'done'",
  );
  return lines.join('\n') + '\n';
}

/**
 * Lê o resultado que o script gravou: um passo por linha e, ao lado, o erro de cada um que falhou.
 * `done` diz se o script chegou ao fim.
 */
export function parseInstallResult(
  text: string,
  readError: (id: EnvCheckId) => string | null,
): { done: boolean; steps: InstallStepResult[] } {
  const steps: InstallStepResult[] = [];
  let done = false;
  for (const line of text.split(/\r?\n/)) {
    const [kind, id, ...rest] = line.trim().split(' ');
    if (kind === 'done') done = true;
    else if (kind === 'ok' && id) steps.push({ id: id as EnvCheckId, status: 'ok' });
    else if (kind === 'skip' && id) steps.push({ id: id as EnvCheckId, status: 'skipped', because: rest[0] as EnvCheckId });
    else if (kind === 'fail' && id) {
      const [code, ...command] = rest;
      const error = readError(id as EnvCheckId)?.trim();
      steps.push({ id: id as EnvCheckId, status: 'failed', code: Number(code), command: command.join(' '), ...(error ? { error } : {}) });
    }
  }
  return { done, steps };
}
