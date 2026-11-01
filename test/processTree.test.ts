// O que sai do grupo da CLI: o Claude Code põe cada comando do terminal num grupo próprio, e quando o
// comando cai no meio os workers que ele iniciou (o Vitest em `forks`) ficam órfãos. O board os anota
// enquanto a CLI vive e os encerra no fim da execução.
import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { escapedDescendants, orphansOfGroups, trackEscapedProcesses, type ProcessRow } from '../src/extension/processTree';

const row = (pid: number, ppid: number, pgid: number, birth = `b${pid}`): ProcessRow => ({ pid, ppid, pgid, birth });

describe('escapedDescendants', () => {
  it('desce pela árvore da CLI e devolve só o que está fora do grupo dela', () => {
    const table = [row(100, 50, 100), row(101, 100, 100), row(200, 100, 200), row(201, 200, 200), row(300, 1, 300)];
    expect(escapedDescendants(table, 100).map((r) => r.pid)).toEqual([200, 201]);
  });

  it('parte também do que ficou no grupo depois que o pai saiu', () => {
    const table = [row(101, 1, 100), row(200, 101, 200)];
    expect(escapedDescendants(table, 100).map((r) => r.pid)).toEqual([200]);
  });

  it('parte dos já anotados, mas não de um PID reutilizado por outro processo', () => {
    const table = [row(200, 1, 200), row(201, 200, 200), row(400, 1, 400, 'outro'), row(401, 400, 400)];
    const known = [row(200, 100, 200), row(400, 100, 400)];
    expect(escapedDescendants(table, 100, known).map((r) => r.pid)).toEqual([201]);
  });
});

describe('orphansOfGroups', () => {
  it('pega o órfão de um grupo anotado cujo líder morreu', () => {
    const table = [row(201, 1, 200), row(900, 1, 900)];
    expect(orphansOfGroups(table, [row(200, 100, 200)], 100).map((r) => r.pid)).toEqual([201]);
  });

  it('não pega um grupo cujo líder agora é outro processo', () => {
    const table = [row(200, 1, 200, 'outro'), row(201, 1, 200)];
    expect(orphansOfGroups(table, [row(200, 100, 200)], 100)).toEqual([]);
  });

  it('não pega quem tem pai vivo nem o grupo da própria CLI', () => {
    const table = [row(201, 150, 200), row(101, 1, 100)];
    expect(orphansOfGroups(table, [row(200, 100, 200), row(102, 100, 100)], 100)).toEqual([]);
  });
});

describe('trackEscapedProcesses', () => {
  it('encerra com SIGTERM e, se não bastar, com SIGKILL só quem continua o mesmo processo', async () => {
    const tables = [
      [row(100, 50, 100), row(200, 100, 200), row(300, 100, 300)],
      [row(200, 1, 200), row(300, 1, 300, 'outro')],
    ];
    const sent: string[] = [];
    const tracker = trackEscapedProcesses(100, {
      table: async () => tables.shift() ?? null,
      signal: (pid, sig) => sent.push(`${pid}:${sig}`),
      graceMs: 1,
    });
    await tracker.end();
    expect(sent).toEqual(['200:SIGTERM', '300:SIGTERM', '200:SIGKILL']);
  });

  it('sem a tabela de processos não sinaliza nada', async () => {
    const signal = vi.fn();
    await trackEscapedProcesses(100, { table: async () => null, signal }).end();
    expect(signal).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')(
    'o worker que ficou órfão de um comando em grupo próprio é encerrado no fim',
    async () => {
      // a CLI abre um comando num grupo novo (como o terminal do Claude Code), e o comando inicia um
      // worker no grupo dele e cai, deixando o worker com o init como pai
      const worker = `setInterval(() => {}, 1000)`;
      const command = `const w = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], { stdio: 'ignore' }); console.log(w.pid); setTimeout(() => process.exit(0), 1500);`;
      const cli = `const c = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(command)}], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.pipe(process.stdout); c.on('exit', () => setTimeout(() => process.exit(0), 200));`;
      const proc = spawn(process.execPath, ['-e', cli], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const workerPid = await new Promise<number>((resolve) => proc.stdout.once('data', (d: Buffer) => resolve(Number(String(d).trim()))));
      const tracker = trackEscapedProcesses(proc.pid!);
      // anotado enquanto o comando vive, como o board faz a cada 10 s
      await tracker.record();
      await new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      const alive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      expect(alive(workerPid)).toBe(true);
      await tracker.end();
      await vi.waitFor(() => expect(alive(workerPid)).toBe(false), { timeout: 3000, interval: 50 });
    },
    15_000,
  );
});
