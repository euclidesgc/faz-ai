import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnMeasured } from '../src/extension/aiOutput/measured';
import { spawnHeadless } from '../src/extension/spawn';
import type { AiProfile } from '../src/shared/aiProfiles';

it('provider genérico atravessa o transporte real com Node, preservando argumento e consumo desconhecido', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-profile-transport-'));
  try {
    const profile: AiProfile = {
      id: 'node-local',
      name: 'Node local',
      kind: 'custom',
      base: 'generic',
      enabled: true,
      position: 3,
      config: {
        command: process.execPath,
        args: ['-e process.stdout.write(process.argv[1])', '{prompt}'],
        promptVia: 'arg',
        boardServer: 'none',
      },
    };
    const prompt = 'pedido com espaços\ne ponto-e-vírgula; literal';
    // Exercita somente o transporte com processo controlado; não é admissão de uma CLI de IA.
    const measured = spawnMeasured(profile, { prompt, permission: 'full' }, dir, {
      spawn: (command, cwd, out, control) => spawnHeadless(command, cwd, out, process.env.PATH, control),
      log: () => {},
    });
    const end = await new Promise<{ code: number | null; error?: Error }>((resolve) =>
      measured.proc.onExit((code, error) => resolve({ code, error })),
    );
    expect(end.error).toBeUndefined();
    expect(end.code).toBe(0);
    expect(measured.report()).toMatchObject({ answer: prompt, measure: 'none', consumption: null });
    expect(measured.failure()).toBeNull();
    expect(measured.proc.terminationConfirmed?.()).toBe(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
