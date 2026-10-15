import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HooksAndPermissions } from '../src/extension/hooksAndPermissions';
import { scanInventory } from '../src/extension/harnessScan';
import { AGENT_TOOLS } from '../src/shared/agentTools';
import { HOOK_EVENTS, hookTargets } from '../src/shared/harnessCatalog';
import { appendKimiHook, parseKimiHooks, removeKimiHook, validateKimiHook } from '../src/shared/kimiHooks';

const base =
  'model = "kimi"\n\n[[hooks]]\nevent = "PreToolUse"\nmatcher = "Bash"\ncommand = "./a.sh"\ntimeout = 30\n\n[[hooks]]\nevent = "Stop"\ncommand = "./b.sh"\n';

describe('hooks do Kimi (TOML)', () => {
  it('lê os blocos reconhecidos e conta os desconhecidos', () => {
    const r = parseKimiHooks(`${base}\n[[hooks]]\nevent = "Stop"\ncommand = """x"""\n`);
    expect(r.hooks).toEqual([
      { event: 'PreToolUse', matcher: 'Bash', command: './a.sh', timeout: 30 },
      { event: 'Stop', matcher: '', command: './b.sh', timeout: 0 },
    ]);
    expect(r.unknownBlocks).toBe(1);
  });

  it('acrescenta só os 4 campos, omite filtro e timeout vazios e preserva o resto', () => {
    const out = appendKimiHook(base, { event: 'SessionStart', matcher: '', command: 'echo "oi"', timeout: 0 });
    expect(out.startsWith(base)).toBe(true);
    expect(out.slice(base.length)).toBe('\n[[hooks]]\nevent = "SessionStart"\ncommand = "echo \\"oi\\""\n');
    expect(appendKimiHook('', { event: 'Stop', matcher: '', command: 'x', timeout: 5 })).toBe(
      '[[hooks]]\nevent = "Stop"\ncommand = "x"\ntimeout = 5\n',
    );
  });

  it('valida evento, comando e timeout de 1 a 600', () => {
    const ok = { event: 'Stop', matcher: '', command: 'x', timeout: 30 };
    const ev = HOOK_EVENTS.kimi;
    expect(validateKimiHook(ok, ev)).toBeNull();
    expect(validateKimiHook({ ...ok, timeout: 601 }, ev)).toMatch(/timeout/);
    expect(validateKimiHook({ ...ok, timeout: 1.5 }, ev)).toMatch(/timeout/);
    expect(validateKimiHook({ ...ok, event: 'Nada' }, ev)).toMatch(/Evento/);
    expect(validateKimiHook({ ...ok, command: 'a\nb' }, ev)).toMatch(/quebra/);
  });

  it('remove só o primeiro bloco e devolve o arquivo anterior ao append', () => {
    const h = { event: 'Stop', matcher: '', command: './novo.sh', timeout: 0 };
    expect(removeKimiHook(appendKimiHook(base, h), 'Stop', './novo.sh')).toBe(base);
    expect(removeKimiHook(base, 'Stop', './b.sh')).toBe(
      'model = "kimi"\n\n[[hooks]]\nevent = "PreToolUse"\nmatcher = "Bash"\ncommand = "./a.sh"\ntimeout = 30\n',
    );
  });

  it('recusa remover quando há bloco não reconhecido ou o hook não existe', () => {
    const weird = '[[hooks]]\nevent = "Stop"\ncommand = "x"\nextra = 1\n';
    expect(() => removeKimiHook(weird, 'Stop', 'x')).toThrow(/à mão/);
    expect(() => removeKimiHook(base, 'Stop', 'nao-existe')).toThrow(/não encontrado/);
  });

  it('catálogo: 20 eventos, formato TOML e FetchURL nas ferramentas do agente', () => {
    expect(HOOK_EVENTS.kimi).toHaveLength(20);
    expect(hookTargets('kimi').map((t) => [t.format, t.scope, t.label])).toEqual([['toml', 'user', '~/.kimi-code/config.toml']]);
    expect(AGENT_TOOLS.kimi.flatMap((g) => g.tools.map((t) => t.name))).toContain('FetchURL');
  });
});

describe('hooks do Kimi no disco', () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-hooks-'));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it('adiciona, lista na varredura e remove', () => {
    const hp = new HooksAndPermissions('', home);
    const index = hookTargets('kimi')[0]!.source;
    const file = hp.addHook('kimi', index, { event: 'PreToolUse', matcher: 'Bash', command: './c.sh', timeout: 10 });
    expect(file).toBe(path.join(home, '.kimi-code', 'config.toml'));
    expect(() => hp.addHook('kimi', index, { event: 'Foo', matcher: '', command: 'x', timeout: 0 })).toThrow(/Evento/);
    const items = scanInventory('kimi', '', home);
    const item = items.find((i) => i.kind === 'hook')!;
    expect(item).toMatchObject({ name: 'PreToolUse', detail: './c.sh' });
    hp.removeHook('kimi', item);
    expect(fs.readFileSync(file, 'utf8')).toBe('');
  });
});
