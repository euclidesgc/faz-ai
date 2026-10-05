// O transporte de bytes do processo: o que chega pelo pipe é UTF-8 cortado onde o sistema quiser,
// inclusive no meio de um caractere acentuado. Roda um processo de verdade (o próprio Node) para que
// os pedaços cheguem separados como chegariam da CLI.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OutputStream } from '../src/extension/aiOutput/reader';
import { cmdArg, fitCommandLine, launchSpec, spawnHeadless } from '../src/extension/spawn';

/** Um script que escreve "ação" partindo o "ç" e o "ã" em dois `write` separados por uma pausa. */
const SCRIPT = `
const bytes = Buffer.from('ação', 'utf8');
const [canal] = process.argv.slice(1);
const out = canal === 'stderr' ? process.stderr : process.stdout;
const parts = [bytes.subarray(0, 2), bytes.subarray(2, 4), bytes.subarray(4)];
let i = 0;
const next = () => { if (i < parts.length) { out.write(parts[i++]); setTimeout(next, 40); } };
next();
`;

function collect(canal: OutputStream): Promise<Record<OutputStream, string>> {
  return new Promise((resolve, reject) => {
    const got: Record<OutputStream, string> = { stdout: '', stderr: '' };
    const proc = spawnHeadless(
      { command: process.execPath, args: ['-e', SCRIPT, canal], format: 'text' },
      process.cwd(),
      (text, stream) => (got[stream] += text),
      undefined,
    );
    proc.onExit((_code, error) => (error ? reject(error) : resolve(got)));
  });
}

describe('spawnHeadless', () => {
  it('um caractere acentuado partido entre dois pedaços do stdout chega inteiro', async () => {
    const got = await collect('stdout');
    expect(got.stdout).toBe('ação');
    expect(got.stdout).not.toContain('�');
  });

  it('o mesmo vale para o stderr, com o seu próprio decodificador', async () => {
    const got = await collect('stderr');
    expect(got.stderr).toBe('ação');
  });
});

describe('linha de comando do Windows', () => {
  it('um .exe roda direto, sem shell e sem escape', () => {
    expect(launchSpec('C:\\bin\\claude.exe', ['-p', 'a & b'], 'win32')).toEqual({
      file: 'C:\\bin\\claude.exe',
      args: ['-p', 'a & b'],
      shell: false,
    });
    expect(launchSpec('/usr/bin/agent', ['x'], 'linux').shell).toBe(false);
  });

  it('um .cmd vai pelo shell com os argumentos escapados duas vezes: aspas, & e | não viram outro comando', () => {
    const spec = launchSpec('C:\\npm\\copilot.cmd', ['-p', 'diga "oi" & saia | fim'], 'win32');
    expect(spec.shell).toBe(true);
    expect(spec.args[1]).toBe(cmdArg('diga "oi" & saia | fim'));
    // nenhum metacaractere do cmd.exe fica sem o ^ na frente
    expect(spec.args[1]).not.toMatch(/(^|[^^])[&|<>]/);
  });

  it('quebra de linha vira espaço: o cmd.exe não a transporta', () => {
    expect(cmdArg('linha 1\nlinha 2')).not.toContain('\n');
  });
});

describe('pedido longo pelo cmd.exe', () => {
  const copilot = (prompt: string) => ({ args: ['-p', prompt, '--no-ask-user'], promptArg: { index: 1, addDirFlag: '--add-dir=' } });

  it('um pedido curto, ou fora de um .cmd, fica na linha de comando', () => {
    expect(fitCommandLine('C:\\npm\\copilot.cmd', copilot('curto'), 'win32')).toEqual({ args: copilot('curto').args, promptDir: null });
    const long = 'x '.repeat(5000);
    expect(fitCommandLine('/usr/bin/copilot', copilot(long), 'linux').promptDir).toBeNull();
    expect(fitCommandLine('C:\\bin\\copilot.exe', copilot(long), 'win32').promptDir).toBeNull();
  });

  it('um pedido que estouraria os 8191 caracteres vai para um arquivo, com a pasta liberada', () => {
    const long = 'Linha 1\nLinha "2" & | %PATH%\n'.repeat(400);
    const { args, promptDir } = fitCommandLine('C:\\npm\\copilot.cmd', copilot(long), 'win32');
    try {
      expect(promptDir).not.toBeNull();
      const file = path.join(promptDir!, 'pedido.md');
      expect(fs.readFileSync(file, 'utf8')).toBe(long);
      expect(args).toEqual([`--add-dir=${promptDir}`, '-p', expect.stringContaining(file), '--no-ask-user']);
      // o que sobra na linha cabe com folga, já escapado
      const spec = launchSpec('C:\\npm\\copilot.cmd', args, 'win32');
      expect([spec.file, ...spec.args].join(' ').length).toBeLessThan(2000);
    } finally {
      if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
    }
  });
});
