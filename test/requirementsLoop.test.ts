// O laço da conferência de requisitos: com o perfil padrão sem login, o host confere a cada 10 s. O rastreio do
// board mostrou que cada conferência avisava "mudou" e o board inteiro era remontado e reenviado às interfaces,
// sem nada mudar. Agora só a lista diferente (ou a primeira conferência) avisa.
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { BoardRequirement } from '../src/shared/requirements';

let dir: string;
let router: MessageRouter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-req-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const signin: BoardRequirement[] = [
  { id: 'profile', profile: 'claude', name: 'Claude Code', problem: 'signin', action: null } as BoardRequirement,
];

it('a conferência repetida com a mesma lista não avisa as interfaces; a lista nova avisa', () => {
  let changes = 0;
  router.onDidChange(() => changes++);
  router.setRequirements(signin);
  expect(changes).toBe(1);
  // o laço de 10 s: a mesma pendência de login, conferência após conferência
  router.setRequirements(signin);
  router.setRequirements([...signin]);
  expect(changes).toBe(1);
  // a pessoa entrou na conta: a pendência some e a tela precisa saber
  router.setRequirements([]);
  expect(changes).toBe(2);
  expect(router.snapshot().requirements).toEqual([]);
});

it('a primeira conferência avisa mesmo com a lista vazia: a tela sai do "conferindo"', () => {
  let changes = 0;
  router.onDidChange(() => changes++);
  router.setRequirements([]);
  expect(changes).toBe(1);
  expect(router.snapshot().requirementsCheckedAt).toBeGreaterThan(0);
});
