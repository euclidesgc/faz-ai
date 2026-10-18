import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildSync } from 'esbuild';
import { spawnHeadless } from '../src/extension/spawn';
import { SPAWN_GATE } from '../src/extension/spawnGate';
import { SpawnNotStartedError, type ProcessIdentity, processGroupState } from '../src/extension/processIdentity';
import { recoverProjectServers } from '../src/extension/mcp/projectServerLease';

let dir: string;
const children: ChildProcess[] = [];
const groups: number[] = [];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-spawn-gate-'));
});
afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  for (const group of groups.splice(0))
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      /* já encerrou */
    }
  fs.rmSync(dir, { recursive: true, force: true });
});
const marker = () => path.join(dir, 'inferiu.txt');
const code = () => `require('fs').writeFileSync(${JSON.stringify(marker())}, 'executou'); console.log('pronto');`;

it('um launcher real que não recebeu descrição termina sem iniciar a ferramenta', async () => {
  const child = spawn(process.execPath, ['-e', SPAWN_GATE], { stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  const end = new Promise<number | null>((resolve) => child.once('exit', resolve));
  child.stdin.end();
  expect(await end).toBe(0);
  expect(fs.existsSync(marker())).toBe(false);
});

it('falha ao registrar a identidade não executa o comando e produz erro tipado de não iniciado', () => {
  let identity: ProcessIdentity | undefined;
  expect(() =>
    spawnHeadless({ command: process.execPath, args: ['-e', code()], format: 'text' }, dir, () => {}, undefined, {
      beforePreparation: () => {},
      beforeStart: (value) => {
        identity = value;
        throw new Error('disco cheio');
      },
    }),
  ).toThrow(SpawnNotStartedError);
  expect(identity?.pid).toBeGreaterThan(0);
  expect(fs.existsSync(marker())).toBe(false);
});

it('registra identidade antes do primeiro efeito da CLI e transporta stdin sem colocá-lo nos argumentos', async () => {
  let identity: ProcessIdentity | undefined;
  let output = '';
  const proc = spawnHeadless(
    {
      command: process.execPath,
      args: ['-e', "process.stdin.on('data', data => process.stdout.write(data))"],
      stdin: 'texto com ação\n',
      format: 'text',
    },
    dir,
    (text) => {
      expect(identity).toBeDefined();
      output += text;
    },
    undefined,
    {
      beforePreparation: () => expect(fs.existsSync(marker())).toBe(false),
      beforeStart: (value) => {
        identity = value;
        expect(fs.existsSync(marker())).toBe(false);
      },
    },
  );
  await new Promise<void>((resolve) => proc.onExit(() => resolve()));
  expect(proc.identity).toEqual(identity);
  expect(output).toBe('texto com ação\n');
  expect(proc.terminationConfirmed?.()).toBe(process.platform !== 'win32');
});

/** Processo separado representa uma janela/host que pode morrer em cada fronteira do protocolo. */
function crashHost(boundary: 'before-record' | 'after-record' | 'running'): Promise<ChildProcess> {
  const bundle = path.join(dir, 'host.cjs');
  buildSync({
    stdin: {
      contents: `export { spawnHeadless } from ${JSON.stringify(path.resolve(__dirname, '../src/extension/spawn.ts'))}; export { leaseProjectServer } from ${JSON.stringify(path.resolve(__dirname, '../src/extension/mcp/projectServerLease.ts'))};`,
      resolveDir: dir,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
  });
  const script = `
const {spawnHeadless, leaseProjectServer}=require(process.argv[1]);
const fs=require('fs'), path=require('path');
const dir=process.argv[2], boundary=process.argv[3];
const lease=leaseProjectServer(dir, {file:'.cursor/mcp.json',entry:{command:'node',args:['bridge.js']}}, {coordinationDir:path.join(dir,'leases'),log:()=>{}});
lease.markProcessUnconfirmed();
spawnHeadless({command:process.execPath,args:['-e',${JSON.stringify(code() + 'setInterval(()=>{},1000);')}],format:'text'},dir,(text)=>{ if(text.includes('pronto')) process.stdout.write('ready\\n'); },undefined,{
 beforePreparation:()=>lease.prepareControlledProcess(),
 beforeStart:(identity)=>{
   if(boundary==='before-record') { fs.writeSync(1,'ready\\n'); process.kill(process.pid,'SIGKILL'); }
   lease.recordControlledProcess(identity);
   if(boundary==='after-record') { fs.writeSync(1,'ready\\n'); process.kill(process.pid,'SIGKILL'); }
 }
});
`;
  const child = spawn(process.execPath, ['-e', script, bundle, dir, boundary], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return new Promise((resolve, reject) => {
    let error = '';
    child.stderr!.on('data', (d) => (error += String(d)));
    child.once('error', reject);
    child.stdout!.once('data', () => resolve(child));
    child.once('exit', (exit) => {
      if (exit !== null && exit !== 0) reject(new Error(`Host encerrou: ${error}`));
    });
  });
}
async function dead(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}
function recordedIdentity(): ProcessIdentity {
  const root = path.join(dir, 'leases');
  const name = fs.readdirSync(root).find((n) => /^[a-f0-9]{64}$/.test(n))!;
  return JSON.parse(fs.readFileSync(path.join(root, name, 'journal.json'), 'utf8')).gate.process;
}

describe('queda real do host', () => {
  it.each(['before-record', 'after-record'] as const)('recupera %s sem executar a ferramenta', async (boundary) => {
    const host = await crashHost(boundary);
    await dead(host);
    const options = { coordinationDir: path.join(dir, 'leases'), log: () => {} };
    // Após registrar, o launcher pode levar alguns milissegundos para receber EOF do host morto.
    if (boundary === 'after-record' && process.platform === 'win32') {
      expect(recoverProjectServers(options)).toBe(0);
      expect(fs.existsSync(marker())).toBe(false);
      return; // A árvore Windows permanece desconhecida; não declarar esta fronteira validada.
    }
    await vi.waitFor(() => expect(recoverProjectServers(options)).toBe(1), { timeout: 5000, interval: 50 });
    expect(fs.existsSync(marker())).toBe(false);
    expect(fs.existsSync(path.join(dir, '.cursor/mcp.json'))).toBe(false);
  });

  it('não restaura enquanto o grupo da execução órfã vive; restaura quando ele comprovadamente acaba', async () => {
    if (process.platform === 'win32') {
      expect(processGroupState({ pid: process.pid, birth: null, platform: 'win32', groupId: null, generation: 'teste' })).toBe('unknown');
      return; // Valida só o bloqueio conservador, não a árvore Windows.
    }
    const host = await crashHost('running');
    const identity = recordedIdentity();
    groups.push(identity.groupId!);
    const ended = dead(host);
    host.kill('SIGKILL');
    await ended;
    const options = { coordinationDir: path.join(dir, 'leases'), log: () => {} };
    expect(fs.existsSync(marker())).toBe(true);
    expect(recoverProjectServers(options)).toBe(0);
    expect(fs.existsSync(path.join(dir, '.cursor/mcp.json'))).toBe(true);
    process.kill(-identity.groupId!, 'SIGKILL');
    await vi.waitFor(() => expect(processGroupState(identity)).toBe('dead'), { timeout: 5000, interval: 50 });
    expect(recoverProjectServers(options)).toBe(1);
    expect(fs.existsSync(path.join(dir, '.cursor/mcp.json'))).toBe(false);
  });
});

it('não confirma término só porque o líder acabou: um descendente vivo mantém o grupo pendente', async () => {
  if (process.platform === 'win32') {
    expect(processGroupState({ pid: process.pid, birth: null, platform: 'win32', groupId: null, generation: 'teste' })).toBe('unknown');
    return;
  }
  const script =
    "const {spawn}=require('child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); child.unref();";
  const proc = spawnHeadless({ command: process.execPath, args: ['-e', script], format: 'text' }, dir, () => {}, undefined, {
    beforePreparation: () => {},
    beforeStart: () => {},
  });
  groups.push(proc.identity!.groupId!);
  await new Promise<void>((resolve) => proc.onExit(() => resolve()));
  expect(proc.terminationConfirmed?.()).toBe(false);
  expect(processGroupState(proc.identity!)).not.toBe('dead');
  process.kill(-proc.identity!.groupId!, 'SIGKILL');
  await vi.waitFor(() => expect(proc.terminationConfirmed?.()).toBe(true), { timeout: 5000, interval: 50 });
});
