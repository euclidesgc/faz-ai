// "Verificar capacidades" (épica "ferramenta por modo", história 13) pelo host de verdade: a mensagem
// `settings.aiProfiles.verify` chega pela HostBridge ao verificador do `BoardHost`, que recusa com o motivo o
// perfil inexistente, o que não tem sonda, o desligado e o pendente de revisão, antes de rodar qualquer
// processo. É o caminho que ficou no lugar do comando da paleta para a cópia do Claude Code.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBoardHost, type BoardHost } from '../src/extension/host/boardHost';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
import type { HostToWebview } from '../src/shared/messages';

let root: string;
let host: BoardHost | undefined;
let bridge: HostBridge | undefined;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fz-verify-')));
  for (const d of ['home', 'projeto', 'dados']) fs.mkdirSync(path.join(root, d), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: path.join(root, 'projeto') });
  // nada do teste toca a home de verdade (os agentes de fábrica nascem na pasta global da ferramenta)
  vi.stubEnv('HOME', path.join(root, 'home'));
  vi.stubEnv('USERPROFILE', path.join(root, 'home'));
  vi.stubEnv('SHELL', '/bin/sh');
});

afterEach(async () => {
  bridge?.dispose();
  await host?.dispose();
  host = undefined;
  bridge = undefined;
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

it('o verificador do host recusa pela mensagem o perfil inexistente, sem sonda, desligado ou pendente de revisão', async () => {
  host = await createBoardHost({
    storageDir: path.join(root, 'dados'),
    wasmDir: path.resolve(__dirname, '../node_modules/sql.js/dist'),
    folderPath: path.join(root, 'projeto'),
    folderName: 'projeto',
    bridgePath: path.join(root, 'bridge.js'),
    log: () => {},
  });
  const sent: HostToWebview[] = [];
  const settings = { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never;
  bridge = new HostBridge((m) => sent.push(m), host.router, settings, settings, { attachmentsBaseUri: () => '' } as unknown as HostEnv);
  // a cópia do Claude Code nasce desligada e pendente de revisão
  const before = host.router.snapshot().board.aiProfiles.map((p) => p.id);
  host.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
  const copy = host.router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!;
  const refusal = async (id: string) => {
    const requestId = `verify-${id}`;
    await bridge!.handle({ type: 'settings.aiProfiles.verify', id, requestId });
    const done = sent.find((m) => m.type === 'done' && m.requestId === requestId) as Extract<HostToWebview, { type: 'done' }>;
    expect(done.ok, id).toBe(false);
    return done.error;
  };
  expect(await refusal('nao-existe')).toBe('Perfil indisponível neste board: nao-existe.');
  expect(await refusal('cursor')).toBe(
    'Cursor: a verificação de capacidades só existe para a CLI do Claude, o Gemini pela CLI e os agentes ACP.',
  );
  // o agente ACP pronto vem desligado, e a cópia, pendente de revisão: o cofre do perfil nem é aberto
  expect(await refusal('gemini')).toBe('Perfil desativado ou pendente de revisão.');
  expect(await refusal(copy.id)).toBe('Perfil desativado ou pendente de revisão.');
  // nenhuma recusa vira aviso de resultado: só o erro da mensagem
  expect(sent.filter((m) => m.type === 'notice')).toEqual([]);
}, 60_000);
