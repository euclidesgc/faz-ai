import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  HARNESS_WATCH_DELAY,
  HarnessWatcher,
  nodeWatch,
  projectWatchTargets,
  userWatchTargets,
  type Disposable,
  type WatchTarget,
} from '../src/extension/harnessWatch';
import { claudeProjectKey } from '../src/shared/harnessCatalog';

let root: string;
let home: string;
let project: string;
const open: Disposable[] = [];

beforeEach(() => {
  // sem links no caminho: no macOS o tmpdir passa por /private
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-watch-')));
  home = path.join(root, 'home');
  project = path.join(root, 'projeto');
  fs.mkdirSync(home);
  fs.mkdirSync(project);
});

afterEach(() => {
  vi.useRealTimers();
  for (const d of open.splice(0)) d.dispose();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Os alvos como `** pasta` ou `* arquivo`, a partir de `base`. */
const shown = (base: string, targets: WatchTarget[]) =>
  targets.map((t) => `${t.recursive ? '**' : '*'} ${path.relative(base, t.path).split(path.sep).join('/')}`);
const paths = (base: string, targets: WatchTarget[]) => targets.map((t) => path.relative(base, t.path).split(path.sep).join('/'));

describe('o que observar na pasta do usuário', () => {
  it('as pastas e os arquivos que o catálogo varre, das duas ferramentas, com os plugins', () => {
    expect(shown(home, userWatchTargets(home, project))).toEqual(
      expect.arrayContaining([
        '* .claude/CLAUDE.md',
        '** .claude/rules',
        '** .claude/skills',
        '** .claude/agents',
        '** .claude/commands',
        '** .claude/output-styles',
        '* .claude/settings.json',
        '* .claude.json',
        '** .cursor/skills',
        '** .agents/skills',
        '** .codex/skills',
        '** .cursor/agents',
        '** .cursor/commands',
        '* .cursor/hooks.json',
        '* .cursor/mcp.json',
        '* .cursor/cli-config.json',
        '* .claude/plugins/installed_plugins.json',
        '* .claude/plugins/synced',
        '** .cursor/plugins/local',
      ]),
    );
  });

  it('nunca a home inteira: de ~/.claude/projects só a memória deste projeto, de ~/.claude/plugins só o registro', () => {
    const got = paths(home, userWatchTargets(home, project));
    expect(new Set(got).size).toBe(got.length);
    for (const p of got) expect(p !== '' && !p.startsWith('..'), p).toBe(true);
    for (const p of ['.claude', '.cursor', '.agents', '.claude/projects', '.claude/plugins', '.claude/plugins/marketplaces'])
      expect(got).not.toContain(p);
    expect(got.filter((p) => p.startsWith('.claude/projects/'))).toEqual([`.claude/projects/${claudeProjectKey(project)}/memory`]);
    expect(got.filter((p) => p.startsWith('.claude/plugins/'))).toEqual([
      '.claude/plugins/installed_plugins.json',
      '.claude/plugins/synced',
    ]);
  });

  it('a política da organização, fora da home, não entra', () => {
    for (const t of userWatchTargets(home, project)) expect(t.path.startsWith(home + path.sep), t.path).toBe(true);
  });

  it('sem pasta de projeto não há memória para observar, e sem home, nada', () => {
    expect(paths(home, userWatchTargets(home, '')).some((p) => p.startsWith('.claude/projects'))).toBe(false);
    expect(userWatchTargets('', project)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('a skill instalada como link também é observada, e o link quebrado não', () => {
    const elsewhere = path.join(root, 'repo', 'minha-skill');
    fs.mkdirSync(elsewhere, { recursive: true });
    fs.writeFileSync(path.join(elsewhere, 'SKILL.md'), '---\ndescription: x\n---\n');
    fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
    fs.symlinkSync(elsewhere, path.join(home, '.claude', 'skills', 'minha-skill'));
    fs.symlinkSync(path.join(root, 'sumiu'), path.join(home, '.claude', 'skills', 'quebrada'));
    fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'revisor.md'), '# revisor');
    fs.symlinkSync(path.join(root, 'revisor.md'), path.join(home, '.claude', 'agents', 'revisor.md'));

    const got = shown(home, userWatchTargets(home, project));
    expect(got).toContain('** .claude/skills/minha-skill');
    expect(got).toContain('* .claude/agents/revisor.md');
    expect(got.some((t) => t.includes('quebrada'))).toBe(false);
  });
});

describe('o que observar na pasta do projeto (modo navegador)', () => {
  it('as fontes do catálogo e as skills desligadas, sem a .claude inteira, onde ficam as worktrees', () => {
    const got = shown(project, projectWatchTargets(project));
    expect(got).toEqual(
      expect.arrayContaining([
        '* CLAUDE.md',
        '* CLAUDE.local.md',
        '* AGENTS.md',
        '* .mcp.json',
        '* .claude/settings.json',
        '** .claude/skills',
        '** .claude/skills-disabled',
        '** .claude/agents',
        '** .cursor/rules',
        '** .cursor/skills-disabled',
        '* .cursorignore',
      ]),
    );
    const all = paths(project, projectWatchTargets(project));
    for (const p of ['', '.claude', '.cursor', '.claude/worktrees']) expect(all).not.toContain(p);
  });
});

/** Watchers de mentira: guardam o caminho e deixam o teste disparar o evento. */
function fakeWatch() {
  const live = new Map<string, { target: WatchTarget; fire: () => void; disposed: boolean }>();
  const created: string[] = [];
  const watch = (target: WatchTarget, onEvent: () => void): Disposable => {
    const entry = { target, fire: onEvent, disposed: false };
    live.set(target.path, entry);
    created.push(target.path);
    return {
      dispose: () => {
        entry.disposed = true;
        live.delete(target.path);
      },
    };
  };
  return { watch, live, created };
}

describe('HarnessWatcher', () => {
  it('junta a rajada de eventos numa releitura só, 300 ms depois do último', () => {
    vi.useFakeTimers();
    const { watch, live } = fakeWatch();
    const reread = vi.fn();
    const w = new HarnessWatcher(() => [{ path: '/h/.claude/skills', recursive: true }], watch, reread);
    open.push(w);

    const fire = live.get('/h/.claude/skills')!.fire;
    fire();
    vi.advanceTimersByTime(100);
    fire();
    vi.advanceTimersByTime(100);
    fire();
    vi.advanceTimersByTime(HARNESS_WATCH_DELAY - 1);
    expect(reread).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it('a cada releitura refaz a lista: observa o caminho novo, solta o que saiu e mantém o resto', () => {
    vi.useFakeTimers();
    const { watch, live, created } = fakeWatch();
    let targets: WatchTarget[] = [
      { path: '/h/.claude/skills', recursive: true },
      { path: '/h/.claude/skills/velha', recursive: true },
    ];
    const w = new HarnessWatcher(
      () => targets,
      watch,
      () => {},
    );
    open.push(w);
    const old = live.get('/h/.claude/skills/velha')!;

    targets = [
      { path: '/h/.claude/skills', recursive: true },
      { path: '/h/.claude/skills/nova', recursive: true },
    ];
    w.notify();
    vi.advanceTimersByTime(HARNESS_WATCH_DELAY);
    expect(old.disposed).toBe(true);
    expect([...live.keys()].sort()).toEqual(['/h/.claude/skills', '/h/.claude/skills/nova']);
    expect(created.filter((p) => p === '/h/.claude/skills')).toHaveLength(1);
  });

  it('ao fechar, solta os watchers e não relê mais, nem a releitura que já estava agendada', () => {
    vi.useFakeTimers();
    const { watch, live } = fakeWatch();
    const reread = vi.fn();
    const w = new HarnessWatcher(() => [{ path: '/h/.claude.json', recursive: false }], watch, reread);
    const entry = live.get('/h/.claude.json')!;
    entry.fire();
    w.dispose();
    vi.advanceTimersByTime(HARNESS_WATCH_DELAY * 2);
    w.notify();
    vi.advanceTimersByTime(HARNESS_WATCH_DELAY * 2);
    expect(reread).not.toHaveBeenCalled();
    expect(entry.disposed).toBe(true);
    expect(live.size).toBe(0);
  });

  it('um caminho que o sistema não deixa observar não impede os outros', () => {
    const { watch, live } = fakeWatch();
    const w = new HarnessWatcher(
      () => [
        { path: '/h/negado', recursive: true },
        { path: '/h/.claude/agents', recursive: true },
      ],
      (target, onEvent) => {
        if (target.path === '/h/negado') throw new Error('EACCES');
        return watch(target, onEvent);
      },
      () => {},
    );
    open.push(w);
    expect([...live.keys()]).toEqual(['/h/.claude/agents']);
  });
});

/**
 * Espera o evento repetindo a mudança: o watcher do sistema demora um pouco a começar (no macOS, o
 * FSEvents), e uma mudança feita antes disso não chega.
 */
async function until(ok: () => boolean, poke: () => void, what: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    poke();
    await new Promise((r) => setTimeout(r, 50));
    if (ok()) return;
  }
  throw new Error(`não aconteceu a tempo: ${what}`);
}

describe('watchers do Node (modo navegador)', () => {
  it('avisa quando um arquivo dentro da pasta muda, também numa subpasta', async () => {
    const dir = path.join(home, '.claude', 'skills');
    fs.mkdirSync(path.join(dir, 'revisar', 'references'), { recursive: true });
    let events = 0;
    open.push(nodeWatch()({ path: dir, recursive: true }, () => void events++));
    let n = 0;
    await until(
      () => events > 0,
      () => fs.writeFileSync(path.join(dir, 'revisar', 'references', 'guia.md'), `versão ${n++}`),
      'mudança na subpasta',
    );
  });

  it('o arquivo salvo por troca (outro inode no mesmo caminho) continua observado', async () => {
    const file = path.join(home, '.claude.json');
    fs.writeFileSync(file, '{}');
    let events = 0;
    open.push(nodeWatch()({ path: file, recursive: false }, () => void events++));
    let n = 0;
    // como os editores e as ferramentas salvam: escreve ao lado e renomeia por cima
    await until(
      () => events > 0,
      () => {
        fs.writeFileSync(`${file}.tmp`, `{"n":${n++}}`);
        fs.renameSync(`${file}.tmp`, file);
      },
      'troca do arquivo',
    );
    await new Promise((r) => setTimeout(r, 100));
    events = 0;
    // a escrita no arquivo novo só chega se o watcher foi religado nele
    await until(
      () => events > 0,
      () => fs.appendFileSync(file, ' '),
      'escrita no arquivo novo',
    );
  });

  it('o caminho que ainda não existe passa a ser observado quando aparece', async () => {
    const dir = path.join(home, '.claude', 'projects', claudeProjectKey(project), 'memory');
    let events = 0;
    open.push(nodeWatch(20)({ path: dir, recursive: true }, () => void events++));
    fs.mkdirSync(dir, { recursive: true });
    await until(
      () => events > 0,
      () => {},
      'pasta criada',
    );
    events = 0;
    let n = 0;
    await until(
      () => events > 0,
      () => fs.writeFileSync(path.join(dir, 'MEMORY.md'), `- nota ${n++}`),
      'arquivo na pasta nova',
    );
  });

  it('depois de solto, não avisa mais', async () => {
    const dir = path.join(home, '.cursor', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    let events = 0;
    const watcher = nodeWatch(20)({ path: dir, recursive: true }, () => void events++);
    let n = 0;
    await until(
      () => events > 0,
      () => fs.writeFileSync(path.join(dir, 'a.md'), `${n++}`),
      'primeira mudança',
    );
    watcher.dispose();
    await new Promise((r) => setTimeout(r, 100));
    events = 0;
    fs.writeFileSync(path.join(dir, 'b.md'), 'novo');
    fs.rmSync(dir, { recursive: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toBe(0);
  });
});
