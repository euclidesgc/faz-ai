import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CapabilityEvidenceStore, canonical } from '../src/extension/ai/capabilityEvidence';
import type { CapabilityEvidence } from '../src/shared/executionAdmission';
let dir: string;
let store: CapabilityEvidenceStore;
const binding = 'b'.repeat(64);
const row: CapabilityEvidence = {
  version: 1,
  source: 'host-probe',
  capability: 'conversation',
  binding,
  checkedAt: 1,
  expiresAt: 1000,
  checks: [{ id: 'fresh-conversation', outcome: 'passed', receipt: 'a'.repeat(64) }],
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-evidence-'));
  store = new CapabilityEvidenceStore(path.join(dir, 'store'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
describe('evidências locais do host', () => {
  it('leitura ausente não cria arquivo e persistência preserva recibos e modo privado', () => {
    expect(store.load(binding)).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'store'))).toBe(false);
    store.record(row);
    expect(store.load(binding)).toEqual([row]);
    if (process.platform !== 'win32')
      for (const file of fs.readdirSync(path.join(dir, 'store')))
        expect(fs.statSync(path.join(dir, 'store', file)).mode & 0o777).toBe(0o600);
    expect(store.load('c'.repeat(64))).toEqual([]);
  });
  it('alteração manual de recibo ou declaração de verificação é recusada', () => {
    store.record(row);
    const file = path.join(
      dir,
      'store',
      fs.readdirSync(path.join(dir, 'store')).find((f) => f.endsWith('.json'))!,
    );
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    value.evidence.checkedAt = 10;
    value.evidence.state = 'verified';
    fs.writeFileSync(file, JSON.stringify(value));
    expect(() => store.load(binding)).toThrow('alterada');
  });
  it('uma falha nova não sobrescreve nem desaparece por gravação concorrente do sucesso anterior', () => {
    store.record({ ...row, checkedAt: 10, checks: [{ ...row.checks[0]!, outcome: 'failed' }] });
    store.record(row);
    expect(store.load(binding)).toHaveLength(2);
    expect(store.load(binding).some((r) => r.checks[0]!.outcome === 'failed')).toBe(true);
  });
  it('evidência copiada para outra chave local não herda verificação', () => {
    store.record(row);
    const second = new CapabilityEvidenceStore(path.join(dir, 'other'));
    second.record(row);
    const source = path.join(
      dir,
      'store',
      fs.readdirSync(path.join(dir, 'store')).find((f) => f.endsWith('.json'))!,
    );
    fs.copyFileSync(source, path.join(dir, 'other', path.basename(source)));
    expect(() => second.load(binding)).toThrow('alterada');
  });
  it('chave inválida e vínculos inseguros são recusados sem regenerar confiança', () => {
    store.record(row);
    fs.writeFileSync(path.join(dir, 'store/local.key'), 'inválida');
    expect(() => store.load(binding)).toThrow('Chave local');
    expect(() => store.load('../segredo')).toThrow('Vínculo');
    expect(() => store.record({ ...row, binding: '../arquivo' })).toThrow('Vínculo');
  });
  it('a assinatura independe da ordem das chaves', () => {
    expect(canonical({ b: ['a', 2], a: true })).toBe(canonical({ a: true, b: ['a', 2] }));
  });
});
