import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { installPlan, installScript, parseInstallResult, type InstallPlan } from '../src/shared/installPlan';
import type { EnvCheck, EnvironmentReport } from '../src/shared/environment';

const report = (checks: EnvCheck[], family: EnvironmentReport['os']['family'] = 'debian'): EnvironmentReport => ({
  tool: 'cursor',
  os: { platform: family === 'windows' ? 'win32' : 'linux', family, label: 'x' },
  checks,
  checkedAt: 1,
});

const MACHINE: EnvCheck[] = [
  { id: 'node', level: 'required', status: 'ok' },
  {
    id: 'cli',
    level: 'required',
    status: 'missing',
    requirement: {
      id: 'cli',
      tool: 'cursor',
      cli: 'cursor-agent',
      action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
    },
  },
  { id: 'signin', level: 'required', status: 'skipped', fix: { kind: 'commands', commands: ['cursor-agent login'] } },
  {
    id: 'mcp',
    level: 'recommended',
    status: 'missing',
    requirement: { id: 'mcp-enable', tool: 'cursor', action: { kind: 'openEditorMcp' } },
  },
  {
    id: 'permission',
    level: 'required',
    status: 'missing',
    requirement: { id: 'permission', tool: 'cursor', action: { kind: 'settings' } },
  },
  { id: 'skill', level: 'recommended', status: 'missing', fix: { kind: 'installSkill' } },
  {
    id: 'git',
    level: 'recommended',
    status: 'missing',
    fix: { kind: 'commands', commands: ['sudo apt update', 'sudo apt install -y git'] },
  },
  { id: 'repo', level: 'recommended', status: 'skipped', fix: { kind: 'commands', commands: ['git init'] } },
  { id: 'gh', level: 'recommended', status: 'missing', fix: { kind: 'commands', commands: ['sudo apt update', 'sudo apt install -y gh'] } },
  { id: 'crg', level: 'recommended', status: 'missing', fix: { kind: 'commands', commands: ['uv tool install code-review-graph'] } },
  {
    id: 'uv',
    parent: 'crg',
    level: 'recommended',
    status: 'missing',
    fix: { kind: 'commands', commands: ['curl -LsSf https://astral.sh/uv/install.sh | sh', 'export PATH="$HOME/.local/bin:$PATH"'] },
  },
  { id: 'python', parent: 'crg', level: 'recommended', status: 'skipped' },
];

describe('Instalar tudo: o plano', () => {
  it('necessário: a CLI e, logo depois, o login (que depende dela); o que não tem comando fica com a pessoa', () => {
    const plan = installPlan(report(MACHINE), 'required')!;
    expect(plan.steps).toEqual([
      { id: 'cli', commands: ['curl https://cursor.com/install -fsS | bash'], after: [] },
      { id: 'signin', commands: ['cursor-agent login'], after: ['cli'] },
    ]);
    expect(plan.manual).toEqual(['permission']);
    expect(plan.shell).toBe('bash');
  });

  it('recomendado: pré-requisitos antes do item, comando repetido uma vez só, skill pelo board', () => {
    const plan = installPlan(report(MACHINE), 'recommended')!;
    expect(plan.steps.map((s) => [s.id, s.commands, s.after])).toEqual([
      ['git', ['sudo apt update', 'sudo apt install -y git'], []],
      ['repo', ['git init'], ['git']],
      ['gh', ['sudo apt install -y gh'], []],
      ['uv', ['curl -LsSf https://astral.sh/uv/install.sh | sh', 'export PATH="$HOME/.local/bin:$PATH"'], []],
      ['crg', ['uv tool install code-review-graph'], ['uv']],
    ]);
    expect(plan.installSkill).toBe(true);
    // ligar o MCP no Cursor é com a pessoa; o Python que o uv traz, não
    expect(plan.manual).toEqual(['mcp']);
  });

  it('a CLI instalada pelo npm depende do Node', () => {
    const plan = installPlan(
      report([
        { id: 'node', level: 'required', status: 'missing', fix: { kind: 'commands', commands: ['nvm install --lts'] } },
        {
          id: 'cli',
          level: 'required',
          status: 'missing',
          fix: { kind: 'commands', commands: ['npm install -g @anthropic-ai/claude-code'] },
        },
      ]),
      'required',
    )!;
    expect(plan.steps[1]).toMatchObject({ id: 'cli', after: ['node'] });
  });

  it('nada a fazer: sem plano', () => {
    expect(installPlan(report([{ id: 'node', level: 'required', status: 'ok' }]), 'required')).toBeNull();
  });
});

describe('Instalar tudo: o script', () => {
  const plan = (steps: InstallPlan['steps'], shell: InstallPlan['shell'] = 'bash'): InstallPlan => ({
    level: 'recommended',
    shell,
    steps,
    installSkill: false,
    manual: [],
  });

  // roda o script de verdade, com comandos de mentira: o que falha não para os outros
  it.skipIf(process.platform === 'win32')('bash: um passo que falha não para os outros; os que dependem dele são pulados', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-install-'));
    const result = path.join(dir, "it's.result");
    const script = path.join(dir, 'install.sh');
    fs.writeFileSync(
      script,
      installScript(
        plan([
          { id: 'git', commands: ['echo git ok', "echo 'com aspas'"], after: [] },
          { id: 'gh', commands: ["sh -c 'echo sem rede para o gh >&2; exit 3'", 'echo nunca'], after: [] },
          { id: 'gh-auth', commands: ['echo nunca'], after: ['gh'] },
          { id: 'uv', commands: ['export FAZAI_TESTE=passou', 'test "$FAZAI_TESTE" = passou'], after: [] },
        ]),
        result,
      ),
    );
    const out = execFileSync('bash', [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).not.toContain('nunca');
    const parsed = parseInstallResult(fs.readFileSync(result, 'utf8'), (id) => {
      try {
        return fs.readFileSync(`${result}.${id}.err`, 'utf8');
      } catch {
        return null;
      }
    });
    expect(parsed.done).toBe(true);
    expect(parsed.steps).toEqual([
      { id: 'git', status: 'ok' },
      { id: 'gh', status: 'failed', code: 3, command: "sh -c 'echo sem rede para o gh >&2; exit 3'", error: 'sem rede para o gh' },
      { id: 'gh-auth', status: 'skipped', because: 'gh' },
      // o PATH (ou qualquer variável) que um passo exporta vale para os seguintes
      { id: 'uv', status: 'ok' },
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('bash: começa pondo ~/.local/bin no PATH', () => {
    const script = installScript(installPlan(report(MACHINE), 'required')!);
    expect(script).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(script.indexOf('cursor-agent login')).toBeGreaterThan(script.indexOf('cursor.com/install'));
    expect(script).toContain('fazai_skip signin cli ||');
  });

  it('PowerShell no Windows: código de saída, PATH relido, resultado em arquivo', () => {
    const script = installScript(
      plan([{ id: 'gh', commands: ['winget install --id GitHub.cli -e'], after: [] }], 'powershell'),
      "C:\\Users\\o'x\\r.result",
    );
    expect(script).toContain("$FazAiResult = 'C:\\Users\\o''x\\r.result'");
    expect(script).toContain("(FazAi-Run 'gh' 'winget install --id GitHub.cli -e')");
    expect(script).toContain('Update-FazAiPath');
    expect(script).toContain("FazAi-Log 'done'");
    expect(script).not.toContain('export PATH');
  });

  const PORTUGUES = [/instala[çc][ãa]o/i, /pulado/i, /falhou/i, /\bn[ãa]o\b/i, /Diagn[óo]stico confere/i, /Login da CLI/, /Permiss[ãa]o/];
  it.each(['bash', 'powershell'] as const)('%s: o script gerado está todo em inglês', (kind) => {
    const fullPlan = plan(installPlan(report(MACHINE), 'required')!.steps, kind);
    const script = installScript(fullPlan, kind === 'bash' ? '/tmp/r' : 'C:\\r');
    for (const re of PORTUGUES) expect(script, String(re)).not.toMatch(re);
  });

  it('lê o resultado: sem a linha done, o script ainda não terminou', () => {
    expect(parseInstallResult('ok git\n', () => null)).toEqual({ done: false, steps: [{ id: 'git', status: 'ok' }] });
  });
});
