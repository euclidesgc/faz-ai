import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildSync } from 'esbuild';
import { acquireWorkspace, adoptWorkspace } from '../src/extension/workspaceLock';
import { processBirth, processGroupState } from '../src/extension/processIdentity';

let dir: string;
let workspace: string;
let root: string;
let children: ChildProcess[];
let groups: number[];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-workspace-lock-'));
  workspace = path.join(dir, 'workspace');
  fs.mkdirSync(workspace);
  root = path.join(dir, 'coordination');
  children = [];
  groups = [];
});
afterEach(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      /* Já encerrado. */
    }
  }
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
const journalFile = () =>
  path.join(
    root,
    fs.readdirSync(root).find((n) => /^[a-f0-9]{64}$/.test(n))!,
    'journal.json',
  );

describe('exclusão de escrita por pasta real', () => {
  it('duas histórias e o alias simbólico disputam a mesma reserva sem alterar o workspace', () => {
    const a = acquireWorkspace(workspace, 'work-a', 1, 'host-a', root)!;
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(workspace, alias, 'dir');
    expect(acquireWorkspace(alias, 'work-b', 1, 'host-b', root)).toBeNull();
    expect(acquireWorkspace(workspace, 'work-b', 1, 'host-b', root)).toBeNull();
    expect(fs.readdirSync(workspace)).toEqual([]);
    expect(a.release()).toBe(true);
    const b = acquireWorkspace(alias, 'work-b', 1, 'host-b', root)!;
    expect(b.workspace).toBe(fs.realpathSync(workspace));
    expect(a.release()).toBe(true);
    expect(acquireWorkspace(workspace, 'work-c', 1, 'host-c', root)).toBeNull();
    expect(b.release()).toBe(true);
  });
  it('diário inválido ou reserva sem diário não é liberado automaticamente', () => {
    acquireWorkspace(workspace, 'work-a', 1, 'host-a', root);
    fs.writeFileSync(journalFile(), '{}');
    expect(() => adoptWorkspace(workspace, 'work-a', 1, 'host-b', root)).toThrow('Diário');
    fs.unlinkSync(journalFile());
    expect(acquireWorkspace(workspace, 'work-b', 1, 'host-b', root)).toBeNull();
  });
  it.skipIf(process.platform === 'win32')('um processo vivo retém a pasta até confirmar o grupo inteiro', async () => {
    const a = acquireWorkspace(workspace, 'work-a', 1, 'host-a', root)!;
    const proc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    children.push(proc);
    await once(proc, 'spawn');
    groups.push(proc.pid!);
    const identity = {
      pid: proc.pid!,
      groupId: proc.pid!,
      birth: processBirth(proc.pid!),
      platform: process.platform,
      generation: 'fixture',
    };
    a.recordProcess(identity);
    expect(a.release()).toBe(false);
    expect(() => a.recordProcess(identity)).toThrow('anterior');
    const exited = once(proc, 'exit');
    process.kill(-proc.pid!, 'SIGKILL');
    await exited;
    expect(processGroupState(identity)).toBe('dead');
    expect(a.release()).toBe(true);
  });
  it('não adota reserva cujo controlador está vivo e não deixa a raiz ser um link', () => {
    acquireWorkspace(workspace, 'work-a', 1, 'host-a', root);
    expect(adoptWorkspace(workspace, 'work-a', 1, 'host-b', root)).toBeNull();
    const aliasRoot = path.join(dir, 'alias-root');
    fs.symlinkSync(root, aliasRoot, 'dir');
    expect(() => acquireWorkspace(workspace, 'work-b', 1, 'host-b', aliasRoot)).toThrow('Raiz');
  });
});

function bundle() {
  const outfile = path.join(dir, 'workspace-lock.cjs');
  buildSync({
    stdin: {
      contents: `export * from ${JSON.stringify(path.resolve(__dirname, '../src/extension/workspaceLock.ts'))}; export {processBirth} from ${JSON.stringify(path.resolve(__dirname, '../src/extension/processIdentity.ts'))};`,
      resolveDir: path.resolve(__dirname, '..'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
  });
  return outfile;
}
function child(bundleFile: string, writer = false): Promise<{ process: ChildProcess; result: string }> {
  const script = `const {spawn}=require('node:child_process');
    const api=require(process.argv[1]);const lease=api.acquireWorkspace(process.argv[2],'work-a',1,'child-host',process.argv[3]);
    if(!lease){process.stdout.write('LOST\\n');process.exit(0)}
    if(process.argv[4]==='writer'){
      const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
      p.once('spawn',()=>{const birth=api.processBirth(p.pid);
        lease.recordProcess({pid:p.pid,groupId:p.pid,birth,platform:process.platform,generation:'fixture'});
        process.stdout.write('WRITER:'+p.pid+'\\n')});
    }else process.stdout.write('WON\\n');setInterval(()=>{},1000);`;
  const proc = spawn(process.execPath, ['-e', script, bundleFile, workspace, root, writer ? 'writer' : 'none'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(proc);
  return new Promise((resolve, reject) => {
    let output = '';
    let error = '';
    proc.stderr!.on('data', (data) => {
      error += String(data);
    });
    proc.stdout!.on('data', (data) => {
      output += String(data);
      if (output.includes('\n')) resolve({ process: proc, result: output.trim() });
    });
    proc.once('error', reject);
    proc.once('exit', (code) => {
      if (!output.includes('\n')) reject(new Error(error || `Sem resultado: ${code}`));
    });
  });
}

describe('disputa entre processos reais', () => {
  it('só um controlador adquire e a adoção após queda não libera antes da reconciliação', async () => {
    const file = bundle();
    const results = await Promise.all([child(file), child(file)]);
    expect(results.map((r) => r.result).sort()).toEqual(['LOST', 'WON']);
    const winner = results.find((r) => r.result === 'WON')!.process;
    const exited = once(winner, 'exit');
    winner.kill('SIGKILL');
    await exited;
    const adopted = adoptWorkspace(workspace, 'work-a', 1, 'new-host', root)!;
    expect(adopted).not.toBeNull();
    expect(acquireWorkspace(workspace, 'work-b', 1, 'new-host', root)).toBeNull();
    expect(adopted.release()).toBe(true);
    expect(acquireWorkspace(workspace, 'work-b', 1, 'new-host', root)!.release()).toBe(true);
  });
  it.skipIf(process.platform === 'win32')('queda do host com escritor vivo conserva a reserva até matar o descendente', async () => {
    const result = await child(bundle(), true);
    const pid = Number(result.result.slice('WRITER:'.length));
    groups.push(pid);
    const exited = once(result.process, 'exit');
    result.process.kill('SIGKILL');
    await exited;
    const adopted = adoptWorkspace(workspace, 'work-a', 1, 'new-host', root)!;
    expect(adopted.release()).toBe(false);
    process.kill(-pid, 'SIGKILL');
    for (let n = 0; n < 100 && processGroupState(adopted.process!) !== 'dead'; n++) await new Promise((r) => setTimeout(r, 10));
    expect(adopted.release()).toBe(true);
  });
});
