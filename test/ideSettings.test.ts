import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fakeConfig, workspace } from './fakes/vscode';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { WebviewToHost } from '../src/shared/messages';
import { IDE_SETTINGS_IMPORTED, LEGACY_KEYS, SECTION, importIdeSettingsOnce } from '../src/extension/settings/ideSettings';

beforeEach(() => fakeConfig.reset());

/** Router real ligado a um SQLite em memória, com as `settings.board.update` contadas em `updates`. */
async function makeLink() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-ide-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  const updates: unknown[] = [];
  return {
    router,
    updates,
    snapshot: () => router.snapshot(),
    getMeta: (key: string) => router.getMeta(key),
    setMeta: (key: string, value: string) => router.setMeta(key, value),
    handle: (msg: WebviewToHost) => {
      if (msg.type === 'settings.board.update') updates.push(msg.patch);
      return router.handle(msg);
    },
  };
}

const config = () => workspace.getConfiguration(SECTION);

describe('importIdeSettingsOnce', () => {
  it('leva ao board um valor válido do Usuário de cada grupo', async () => {
    const link = await makeLink();
    fakeConfig.values.global['fazai.appearance.theme'] = 'dark';
    fakeConfig.values.global['fazai.git.mode'] = 'branch';
    fakeConfig.values.global['fazai.git.gitflow'] = false;
    fakeConfig.values.global['fazai.git.parallelStories'] = 3;
    const imported = importIdeSettingsOnce(config(), link);
    expect(imported.sort()).toEqual(['appearance.theme', 'git.gitflow', 'git.mode', 'git.parallelStories']);
    const board = link.router.snapshot().board;
    expect(board.appearance.theme).toBe('dark');
    expect(board.git.mode).toBe('branch');
    expect(board.git.gitflow).toBe(false);
    expect(board.runner.parallelStories).toBe(3);
    expect(link.getMeta(IDE_SETTINGS_IMPORTED)).toBe('1');
  });

  it('no Git vale pasta > Workspace > Usuário', async () => {
    const link = await makeLink();
    fakeConfig.values.global['fazai.git.featurePrefix'] = 'user/';
    fakeConfig.values.workspace['fazai.git.featurePrefix'] = 'ws/';
    fakeConfig.values.global['fazai.git.bugfixPrefix'] = 'user/';
    fakeConfig.values.workspace['fazai.git.bugfixPrefix'] = 'ws/';
    fakeConfig.values.folder['fazai.git.bugfixPrefix'] = 'pasta/';
    importIdeSettingsOnce(config(), link);
    const git = link.router.snapshot().board.git;
    expect(git.featurePrefix).toBe('ws/');
    expect(git.bugfixPrefix).toBe('pasta/');
  });

  it('a Aparência ignora Workspace e pasta', async () => {
    const link = await makeLink();
    fakeConfig.values.workspace['fazai.appearance.theme'] = 'dark';
    fakeConfig.values.folder['fazai.appearance.font'] = 'mono';
    fakeConfig.values.global['fazai.appearance.fontSize'] = 16;
    const before = link.router.snapshot().board.appearance;
    expect(importIdeSettingsOnce(config(), link)).toEqual(['appearance.fontSize']);
    const after = link.router.snapshot().board.appearance;
    expect(after.theme).toBe(before.theme);
    expect(after.font).toBe(before.font);
    expect(after.fontSize).toBe(16);
  });

  it('valores inválidos são ignorados e vão ao log', async () => {
    const link = await makeLink();
    const log: string[] = [];
    fakeConfig.values.global['fazai.appearance.theme'] = 'neon';
    fakeConfig.values.global['fazai.appearance.fontSize'] = 99;
    fakeConfig.values.global['fazai.git.branchPattern'] = 'sem-numero';
    expect(importIdeSettingsOnce(config(), link, (l) => log.push(l))).toEqual([]);
    expect(link.updates).toEqual([]);
    expect(log).toHaveLength(3);
  });

  it('a segunda chamada não importa nada, mesmo com o Settings mudado', async () => {
    const link = await makeLink();
    fakeConfig.values.global['fazai.appearance.theme'] = 'dark';
    importIdeSettingsOnce(config(), link);
    fakeConfig.values.global['fazai.appearance.theme'] = 'light';
    fakeConfig.values.global['fazai.git.mode'] = 'branch';
    expect(importIdeSettingsOnce(config(), link)).toEqual([]);
    expect(link.router.snapshot().board.appearance.theme).toBe('dark');
  });

  it('sem Settings só grava a marca e nunca escreve no Settings', async () => {
    const link = await makeLink();
    expect(importIdeSettingsOnce(config(), link)).toEqual([]);
    expect(link.updates).toEqual([]);
    expect(link.getMeta(IDE_SETTINGS_IMPORTED)).toBe('1');
    fakeConfig.values.global['fazai.git.mode'] = 'branch';
    importIdeSettingsOnce(config(), link);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('valor igual ao do board não gera gravação', async () => {
    const link = await makeLink();
    fakeConfig.values.global['fazai.git.mode'] = link.router.snapshot().board.git.mode;
    expect(importIdeSettingsOnce(config(), link)).toEqual([]);
    expect(link.updates).toEqual([]);
  });

  it('a recusa do board numa chave não impede as outras', async () => {
    const link = await makeLink();
    const log: string[] = [];
    fakeConfig.values.global['fazai.git.mainBranch'] = 'trunk';
    fakeConfig.values.global['fazai.appearance.theme'] = 'dark';
    const refusing = {
      ...link,
      handle: (msg: WebviewToHost) => {
        if (msg.type === 'settings.board.update' && (msg.patch as { git?: { mainBranch?: string } }).git?.mainBranch)
          throw new Error('A IA está executando #7.');
        return link.handle(msg);
      },
    };
    expect(importIdeSettingsOnce(config(), refusing, (l) => log.push(l))).toEqual(['appearance.theme']);
    expect(log.join('\n')).toContain('A IA está executando #7.');
    expect(link.getMeta(IDE_SETTINGS_IMPORTED)).toBe('1');
  });

  it('erro no inspect de uma chave não impede as outras', async () => {
    const link = await makeLink();
    fakeConfig.values.global['fazai.git.mode'] = 'branch';
    const base = config();
    const flaky = {
      inspect: (key: string) => {
        if (key === 'appearance.theme') throw new Error('falhou');
        return base.inspect(key);
      },
    };
    expect(importIdeSettingsOnce(flaky, link)).toEqual(['git.mode']);
  });

  it('cobre as 19 chaves', () => {
    expect(LEGACY_KEYS).toHaveLength(19);
    expect(LEGACY_KEYS.filter((k) => k.userOnly).map((k) => k.key)).toEqual([
      'appearance.language',
      'appearance.theme',
      'appearance.font',
      'appearance.fontSize',
    ]);
  });
});
