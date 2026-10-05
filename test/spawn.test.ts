// O transporte de bytes do processo: o que chega pelo pipe é UTF-8 cortado onde o sistema quiser,
// inclusive no meio de um caractere acentuado. Roda um processo de verdade (o próprio Node) para que
// os pedaços cheguem separados como chegariam da CLI.
import { describe, expect, it } from 'vitest';
import type { OutputStream } from '../src/extension/aiOutput/reader';
import { spawnHeadless } from '../src/extension/spawn';

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
