import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExecutionAdmission } from '../../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../../src/extension/ai/capabilityEvidence';
import { spawnHeadless } from '../../src/extension/spawn';
import { verifyExecutor } from '../../src/extension/ai/capabilityVerifier';

describe('verificador de isolamento com a CLI real do Claude', () => {
  it('grava recibos assinados no vínculo de isolamento e a admissão os lê', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verifier-real-'));
    try {
      const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
      const admission = new ExecutionAdmission({
        pathEnv: () => process.env.PATH,
        homeDir: os.homedir(),
        evidence: store,
        environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      });
      const result = await verifyExecutor({
        executor: 'claude',
        profileId: 'claude',
        admission,
        store,
        pathEnv: process.env.PATH,
        spawn: (c, cwd, out) => spawnHeadless(c, cwd, out, process.env.PATH),
      });
      console.log(JSON.stringify(result.evidence.map((e) => ({ c: e.capability, checks: e.checks.map((c) => `${c.id}:${c.outcome}`) }))));
      expect(result.verified).toBe(true);
      expect(store.load(result.binding)).toHaveLength(5);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
