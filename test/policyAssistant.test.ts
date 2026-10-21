import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { parsePolicyAssistance, policyAssistancePrompt } from '../src/extension/policyAssistant';
import { hasSecret, policyChanges, type PolicyAssistInput } from '../src/shared/policyAssistant';
import { catalog, policy, alternative } from './fixtures/executionPolicy';

let dir: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-policy-assist-'));
  db = await openInMemory(path.resolve('node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'policy-assist',
    folderName: 'Políticas',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
  });
  router.handle({ type: 'settings.models.set', catalog });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const base = () =>
  policy({
    id: 'novo',
    enabled: false,
    action: 'offer',
    targets: [alternative],
    conditions: { ...policy().conditions, explicit: 'exclude' },
  });
const input = (over: Partial<PolicyAssistInput> = {}): PolicyAssistInput => ({
  mode: 'create',
  goal: 'trocar na quota',
  draft: null,
  language: 'pt-BR',
  ...over,
});
const reply = (p: unknown, explanation = 'Explica a ordem.') => JSON.stringify({ explanation, policy: p });
const run = (text: string, i: PolicyAssistInput) =>
  parsePolicyAssistance(text, i, router.snapshot(), router.executionPolicyLibrary().snapshot);

describe('assistente de políticas', () => {
  it('aceita rascunho válido, desligado, com id nosso e cenários simulados', () => {
    const r = run(reply({ ...base(), id: 'da-ia', enabled: true }), input());
    expect(r.policy?.enabled).toBe(false);
    expect(r.policy?.id).not.toBe('da-ia');
    expect(r.scenarios.length).toBeGreaterThan(0);
    expect(r.scenarios.every((s) => s.simulation.hypothetical)).toBe(true);
    expect(router.executionPolicyLibrary().snapshot.records).toHaveLength(0);
  });

  it('mantém id e ativação do rascunho aberto', () => {
    const draft = base();
    const r = run(reply({ ...base(), id: 'outro', enabled: true, priority: 5 }), input({ mode: 'fallbacks', draft }));
    expect(r.policy).toMatchObject({ id: 'novo', enabled: false, priority: 5 });
    expect(policyChanges(draft, r.policy!).map((c) => c.path)).toEqual(['priority']);
  });

  it('recusa perfil fora do catálogo, política inválida e formato errado', () => {
    expect(() => run(reply({ ...base(), targets: [{ profileId: 'claude', model: 'inexistente', effort: null }] }), input())).toThrow(
      /catálogo/,
    );
    expect(() => run(reply({ ...base(), priority: -1 }), input())).toThrow(/inválida/);
    expect(() => run('texto solto', input())).toThrow(/formato/);
  });

  it('recusa reduzir isolamento: auto sem base e escolhas explícitas afrouxadas', () => {
    expect(() => run(reply({ ...base(), action: 'auto' }), input())).toThrow(/isolamento/);
    expect(() => run(reply({ ...base(), conditions: { ...base().conditions, explicit: 'include' } }), input())).toThrow(/isolamento/);
  });

  it('recusa proposta que cria prioridade ambígua com política salva', () => {
    router.handle({
      type: 'settings.executionPolicy.save',
      policy: policy({ action: 'offer', targets: [alternative] }),
      expectedRevision: 0,
      reviewed: true,
    });
    const clash = { ...base(), priority: 10, conditions: { ...policy().conditions, explicit: 'exclude' } };
    expect(() => run(reply(clash), input())).toThrow(/ambígua/);
  });

  it('conflitos sem rascunho só explicam', () => {
    expect(run(reply(null), input({ mode: 'conflicts', goal: '' })).policy).toBeNull();
    expect(() => run(reply(base()), input({ mode: 'conflicts', goal: '' }))).toThrow(/só explica/);
  });

  it('segredos não entram nem saem', () => {
    const state = router.snapshot();
    const snapshot = router.executionPolicyLibrary().snapshot;
    expect(() => policyAssistancePrompt(input({ goal: 'use sk-abcdefghijklmnopqrstuv' }), state, snapshot)).toThrow(/segredo/);
    expect(() => run(reply(null, 'token=abc123'), input({ mode: 'conflicts', goal: '' }))).toThrow(/segredo/);
    expect(hasSecret('apenas texto')).toBe(false);
    const prompt = policyAssistancePrompt(input(), state, snapshot);
    expect(prompt).toContain('trocar na quota');
    expect(prompt).not.toMatch(/credentials/i);
  });

  it('exige objetivo para criar e rascunho para fallbacks', () => {
    const state = router.snapshot();
    const snapshot = router.executionPolicyLibrary().snapshot;
    expect(() => policyAssistancePrompt(input({ goal: ' ' }), state, snapshot)).toThrow(/objetivo/);
    expect(() => policyAssistancePrompt(input({ mode: 'fallbacks' }), state, snapshot)).toThrow(/editor/);
  });
});
