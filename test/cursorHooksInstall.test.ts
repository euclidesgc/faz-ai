import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CURSOR_HOOK_EVENTS, cursorHookStatus, installCursorHook, uninstallCursorHook } from '../src/extension/mcp/cursorHooks';

const dirs: string[] = [];
const home = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'chook-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const file = (h: string) => path.join(h, '.cursor', 'hooks.json');
const o = (h: string, script = '/x/cursor-hook.js') => ({ homeDir: h, scriptPath: script });

describe('hooks.json global', () => {
  it('cria, é idempotente e atualiza o caminho', () => {
    const h = home();
    expect(installCursorHook(o(h))).toBe('created');
    expect(installCursorHook(o(h))).toBe('unchanged');
    expect(installCursorHook(o(h, '/y/cursor-hook.js'))).toBe('updated');
    const j = JSON.parse(fs.readFileSync(file(h), 'utf8'));
    for (const ev of CURSOR_HOOK_EVENTS) expect(j.hooks[ev]).toHaveLength(1);
    expect(j.hooks.preToolUse[0].command).toContain('/y/cursor-hook.js');
  });
  it('preserva os hooks da pessoa e os remove só do board', () => {
    const h = home();
    fs.mkdirSync(path.dirname(file(h)), { recursive: true });
    fs.writeFileSync(
      file(h),
      JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: './meu.sh' }], stop: [{ command: './s.sh' }] } }),
    );
    installCursorHook(o(h));
    let j = JSON.parse(fs.readFileSync(file(h), 'utf8'));
    expect(j.hooks.preToolUse).toHaveLength(2);
    expect(j.hooks.stop).toEqual([{ command: './s.sh' }]);
    expect(uninstallCursorHook(h)).toBe(true);
    j = JSON.parse(fs.readFileSync(file(h), 'utf8'));
    expect(j.hooks.preToolUse).toEqual([{ command: './meu.sh' }]);
    expect(j.hooks.beforeMCPExecution).toBeUndefined();
    expect(uninstallCursorHook(h)).toBe(false);
  });
  it('arquivo inválido não é sobrescrito', () => {
    const h = home();
    fs.mkdirSync(path.dirname(file(h)), { recursive: true });
    fs.writeFileSync(file(h), '{ nao json');
    expect(installCursorHook(o(h))).toBe('invalid');
    expect(fs.readFileSync(file(h), 'utf8')).toBe('{ nao json');
  });
  it('o estado do hook: pronto, ausente, sem script ou desatualizado (o perfil volta a parcial, com o motivo)', () => {
    const h = home();
    const script = path.join(h, 'cursor-hook.js');
    expect(cursorHookStatus({ homeDir: h, scriptPath: script })).toContain('não existe');
    fs.writeFileSync(script, '');
    expect(cursorHookStatus({ homeDir: h, scriptPath: script })).toContain('não está registrado');
    installCursorHook({ homeDir: h, scriptPath: script });
    expect(cursorHookStatus({ homeDir: h, scriptPath: script })).toBeNull();
    installCursorHook({ homeDir: h, scriptPath: '/outro/cursor-hook.js' });
    expect(cursorHookStatus({ homeDir: h, scriptPath: script })).toContain('desatualizado');
    fs.writeFileSync(file(h), '{ nao json');
    expect(cursorHookStatus({ homeDir: h, scriptPath: script })).toContain('JSON');
  });
});
