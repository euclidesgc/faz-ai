import { afterEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildSync } from 'esbuild';
import { processGroupState, type ProcessIdentity } from '../src/extension/processIdentity';

let dir: string | undefined;
const hosts: ChildProcess[] = [];
let group: number | null = null;
afterEach(() => {
  for (const host of hosts) host.kill('SIGKILL');
  if (group)
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      /* já terminou */
    }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
function controller(bundle: string, mode: string) {
  const child = spawn(
    process.execPath,
    [
      bundle,
      dir!,
      path.resolve(__dirname, '../node_modules/sql.js/dist'),
      path.resolve(__dirname, 'fixtures/orchestrator-cli.mjs'),
      path.resolve(__dirname, '../dist/mcp-bridge.js'),
      mode,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  hosts.push(child);
  const ended = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
    let output = '';
    let error = '';
    child.stderr!.on('data', (chunk) => {
      error += String(chunk);
    });
    child.stdout!.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes('\n'))
        try {
          resolve(JSON.parse(output.split('\n')[0]!));
        } catch (e) {
          reject(e);
        }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!output.includes('\n')) reject(new Error(`Controlador terminou antes da prova: ${code}: ${error}`));
    });
  });
  return { child, ready, ended };
}

it('SIGKILL do controlador, novo processo e segunda reabertura não repetem a CLI nem o comentário', async () => {
  if (process.platform === 'win32') return; // A confirmação da árvore Windows continua não validada.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-orchestrator-crash-'));
  const bundle = path.join(dir, 'controller.cjs');
  buildSync({
    entryPoints: [path.resolve(__dirname, 'fixtures/orchestrator-controller.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'silent',
  });
  const first = controller(bundle, 'run');
  const started = await first.ready;
  const identity = started.process as ProcessIdentity;
  group = identity.groupId;
  expect(processGroupState(identity)).toBe('alive');
  first.child.kill('SIGKILL');
  // A CLI herdou os pipes. Esperamos o exit do host, sem confundir close com fim dos descendentes.
  if (first.child.exitCode === null && first.child.signalCode === null)
    await new Promise<void>((resolve) => first.child.once('exit', () => resolve()));
  expect(processGroupState(identity)).not.toBe('dead');
  const second = controller(bundle, 'recover');
  expect(await second.ready).toMatchObject({ states: ['failed'], reservations: 0, comments: 1 });
  await second.ended;
  expect(processGroupState(identity)).toBe('dead');
  const third = controller(bundle, 'recover');
  expect(await third.ready).toMatchObject({ states: ['failed'], reservations: 0, comments: 1 });
  await third.ended;
  expect(
    fs
      .readFileSync(path.join(dir, 'workspace', 'work.txt'), 'utf8')
      .trim()
      .split('\n'),
  ).toHaveLength(1);
}, 20_000);
