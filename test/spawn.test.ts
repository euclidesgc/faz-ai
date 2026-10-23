// O transporte de bytes do processo: o que chega pelo pipe é UTF-8 cortado onde o sistema quiser,
// inclusive no meio de um caractere acentuado. Roda um processo de verdade (o próprio Node) para que
// os pedaços cheguem separados como chegariam da CLI.
import { describe, expect, it } from 'vitest';
import type { OutputStream } from '../src/extension/aiOutput/reader';
import { cmdArg, launchSpec, spawnHeadless } from '../src/extension/spawn';

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

it('a confirmação de término só aparece após o fechamento real do processo', async () => {
  const proc = spawnHeadless(
    { command: process.execPath, args: ['-e', 'setTimeout(()=>{},100)'], format: 'text' },
    process.cwd(),
    () => {},
    undefined,
  );
  expect(proc.terminationConfirmed?.()).toBe(false);
  await new Promise<void>((resolve) => proc.onExit(() => resolve()));
  // O Windows ainda não dispõe de prova da árvore inteira; não recebe confirmação por encerrar só o pai.
  expect(proc.terminationConfirmed?.()).toBe(process.platform !== 'win32');
});

it('a chave do cofre chega ao processo só no ambiente, na variável que o comando declara', async () => {
  let out = '';
  const proc = spawnHeadless(
    {
      command: process.execPath,
      args: ['-e', 'process.stdout.write(String(process.env.GEMINI_API_KEY) + "|" + process.argv.slice(1).join(","))'],
      format: 'text',
      apiKeyEnv: 'GEMINI_API_KEY',
      apiKey: 'chave-do-cofre',
    },
    process.cwd(),
    (text) => (out += text),
    undefined,
  );
  await new Promise<void>((resolve) => proc.onExit(() => resolve()));
  expect(out).toBe('chave-do-cofre|');
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
    const spec = launchSpec('C:\\npm\\cursor-agent.cmd', ['-p', 'diga "oi" & saia | fim'], 'win32');
    expect(spec.shell).toBe(true);
    expect(spec.args[1]).toBe(cmdArg('diga "oi" & saia | fim'));
    // nenhum metacaractere do cmd.exe fica sem o ^ na frente
    expect(spec.args[1]).not.toMatch(/(^|[^^])[&|<>]/);
  });

  it('quebra de linha vira espaço: o cmd.exe não a transporta', () => {
    expect(cmdArg('linha 1\nlinha 2')).not.toContain('\n');
  });
});

describe('spawnAcpProcess', () => {
  it('a entrada fica aberta: escreve depois do início e end() fecha', async () => {
    const { spawnAcpProcess } = await import('../src/extension/spawn');
    let got = '';
    const proc = spawnAcpProcess(
      {
        command: process.execPath,
        args: ['-e', "process.stdin.on('data',d=>process.stdout.write('eco:'+d)).on('end',()=>process.stdout.write('fim'))"],
        format: 'text',
      },
      process.cwd(),
      (text, stream) => stream === 'stdout' && (got += text),
      undefined,
    );
    await new Promise((r) => setTimeout(r, 100));
    proc.write('oi');
    await new Promise((r) => setTimeout(r, 100));
    proc.end();
    await new Promise<void>((resolve) => proc.onExit(() => resolve()));
    expect(got).toBe('eco:oifim');
  });
});
