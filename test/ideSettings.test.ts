import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fake, fakeConfig, workspace } from './fakes/vscode';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { WebviewToHost } from '../src/shared/messages';
import { ConfigurationTarget, GIT_SETTINGS_MIGRATED, IdeSettings, type IdeSettingsApi } from '../src/extension/settings/ideSettings';
import { DEFAULT_GIT } from '../src/shared/git';
import { DEFAULT_RUNNER } from '../src/shared/runner';

const KEY = 'fazai.appearance.language';
const THEME_KEY = 'fazai.appearance.theme';
const FONT_KEY = 'fazai.appearance.font';
const FONT_SIZE_KEY = 'fazai.appearance.fontSize';

const GIT_MODE_KEY = 'fazai.git.mode';
const GIT_BRANCH_PATTERN_KEY = 'fazai.git.branchPattern';
const GIT_WORKTREE_DIR_KEY = 'fazai.git.worktreeDir';
const GIT_PARALLEL_KEY = 'fazai.git.parallel';
const GIT_PARALLEL_STORIES_KEY = 'fazai.git.parallelStories';
const GIT_AUTO_MERGE_KEY = 'fazai.git.autoMerge';
const GIT_MERGE_METHOD_KEY = 'fazai.git.mergeMethod';
const GIT_WATCH_MERGES_KEY = 'fazai.git.watchMerges';
const GIT_WATCH_MERGE_MINUTES_KEY = 'fazai.git.watchMergeMinutes';

beforeEach(() => {
  fakeConfig.reset();
  fakeConfig.values.default[KEY] = 'auto';
  fakeConfig.values.default[THEME_KEY] = 'system';
  fakeConfig.values.default[FONT_KEY] = 'sans';
  fakeConfig.values.default[FONT_SIZE_KEY] = 14;
  fakeConfig.values.default[GIT_MODE_KEY] = DEFAULT_GIT.mode;
  fakeConfig.values.default[GIT_BRANCH_PATTERN_KEY] = DEFAULT_GIT.branchPattern;
  fakeConfig.values.default[GIT_WORKTREE_DIR_KEY] = DEFAULT_GIT.worktreeDir;
  fakeConfig.values.default[GIT_PARALLEL_KEY] = DEFAULT_RUNNER.parallel;
  fakeConfig.values.default[GIT_PARALLEL_STORIES_KEY] = DEFAULT_RUNNER.parallelStories;
  fakeConfig.values.default[GIT_AUTO_MERGE_KEY] = DEFAULT_GIT.autoMerge;
  fakeConfig.values.default[GIT_MERGE_METHOD_KEY] = DEFAULT_GIT.mergeMethod;
  fakeConfig.values.default[GIT_WATCH_MERGES_KEY] = DEFAULT_GIT.watchMerges;
  fakeConfig.values.default[GIT_WATCH_MERGE_MINUTES_KEY] = DEFAULT_GIT.watchMergeMinutes;
});

describe('IdeSettings: ler', () => {
  it('devolve o valor do Workspace quando Usuário e Workspace divergem', () => {
    fakeConfig.values.global[KEY] = 'en';
    fakeConfig.values.workspace[KEY] = 'pt-BR';
    expect(new IdeSettings(workspace).read('appearance.language')).toBe('pt-BR');
  });

  it('sem valor em nenhum escopo devolve o default', () => {
    expect(new IdeSettings(workspace).read('appearance.language')).toBe('auto');
  });

  it('tema: devolve o valor do Workspace quando Usuário e Workspace divergem', () => {
    fakeConfig.values.global[THEME_KEY] = 'dark';
    fakeConfig.values.workspace[THEME_KEY] = 'light';
    expect(new IdeSettings(workspace).read('appearance.theme')).toBe('light');
  });

  it('tema: sem valor em nenhum escopo devolve o default', () => {
    expect(new IdeSettings(workspace).read('appearance.theme')).toBe('system');
  });

  it('fonte: devolve o valor do Workspace quando Usuário e Workspace divergem', () => {
    fakeConfig.values.global[FONT_KEY] = 'serif';
    fakeConfig.values.workspace[FONT_KEY] = 'mono';
    expect(new IdeSettings(workspace).read('appearance.font')).toBe('mono');
  });

  it('fonte: sem valor em nenhum escopo devolve o default', () => {
    expect(new IdeSettings(workspace).read('appearance.font')).toBe('sans');
  });

  it('tamanho da fonte: devolve o valor do Workspace quando Usuário e Workspace divergem', () => {
    fakeConfig.values.global[FONT_SIZE_KEY] = 16;
    fakeConfig.values.workspace[FONT_SIZE_KEY] = 18;
    expect(new IdeSettings(workspace).read('appearance.fontSize')).toBe(18);
  });

  it('tamanho da fonte: sem valor em nenhum escopo devolve o default', () => {
    expect(new IdeSettings(workspace).read('appearance.fontSize')).toBe(14);
  });
});

describe('IdeSettings: gravar', () => {
  it('sem alvo grava no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.language', 'en');
    expect(fakeConfig.updates).toEqual([{ key: KEY, value: 'en', target: ConfigurationTarget.Global }]);
    expect(fakeConfig.values.global[KEY]).toBe('en');
    expect(fakeConfig.values.workspace[KEY]).toBeUndefined();
  });

  it('com ConfigurationTarget.Workspace grava no Workspace e não no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.language', 'en', ConfigurationTarget.Workspace);
    expect(fakeConfig.updates[0]?.target).toBe(ConfigurationTarget.Workspace);
    expect(fakeConfig.values.workspace[KEY]).toBe('en');
    expect(fakeConfig.values.global[KEY]).toBeUndefined();
  });

  it('erro do update vai para o log, sem lançar', async () => {
    const lines: string[] = [];
    const api: IdeSettingsApi = {
      getConfiguration: () => ({
        get: () => undefined,
        inspect: () => undefined,
        update: () => Promise.reject(new Error('somente leitura')),
      }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
    };
    await expect(new IdeSettings(api, undefined, (l) => lines.push(l)).write('appearance.language', 'en')).resolves.toBeUndefined();
    expect(lines).toEqual(['Faz AI: não foi possível gravar fazai.appearance.language no Settings: Error: somente leitura']);
  });

  it('tema: sem alvo grava no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.theme', 'dark');
    expect(fakeConfig.updates).toEqual([{ key: THEME_KEY, value: 'dark', target: ConfigurationTarget.Global }]);
    expect(fakeConfig.values.global[THEME_KEY]).toBe('dark');
    expect(fakeConfig.values.workspace[THEME_KEY]).toBeUndefined();
  });

  it('tema: com ConfigurationTarget.Workspace grava no Workspace e não no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.theme', 'dark', ConfigurationTarget.Workspace);
    expect(fakeConfig.updates[0]?.target).toBe(ConfigurationTarget.Workspace);
    expect(fakeConfig.values.workspace[THEME_KEY]).toBe('dark');
    expect(fakeConfig.values.global[THEME_KEY]).toBeUndefined();
  });

  it('fonte: sem alvo grava no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.font', 'mono');
    expect(fakeConfig.updates).toEqual([{ key: FONT_KEY, value: 'mono', target: ConfigurationTarget.Global }]);
    expect(fakeConfig.values.global[FONT_KEY]).toBe('mono');
    expect(fakeConfig.values.workspace[FONT_KEY]).toBeUndefined();
  });

  it('fonte: com ConfigurationTarget.Workspace grava no Workspace e não no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.font', 'mono', ConfigurationTarget.Workspace);
    expect(fakeConfig.updates[0]?.target).toBe(ConfigurationTarget.Workspace);
    expect(fakeConfig.values.workspace[FONT_KEY]).toBe('mono');
    expect(fakeConfig.values.global[FONT_KEY]).toBeUndefined();
  });

  it('tamanho da fonte: sem alvo grava no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.fontSize', 18);
    expect(fakeConfig.updates).toEqual([{ key: FONT_SIZE_KEY, value: 18, target: ConfigurationTarget.Global }]);
    expect(fakeConfig.values.global[FONT_SIZE_KEY]).toBe(18);
    expect(fakeConfig.values.workspace[FONT_SIZE_KEY]).toBeUndefined();
  });

  it('tamanho da fonte: com ConfigurationTarget.Workspace grava no Workspace e não no Usuário', async () => {
    await new IdeSettings(workspace).write('appearance.fontSize', 18, ConfigurationTarget.Workspace);
    expect(fakeConfig.updates[0]?.target).toBe(ConfigurationTarget.Workspace);
    expect(fakeConfig.values.workspace[FONT_SIZE_KEY]).toBe(18);
    expect(fakeConfig.values.global[FONT_SIZE_KEY]).toBeUndefined();
  });
});

describe('IdeSettings: observar', () => {
  it('mudança numa chave fazai.* chama o callback com a chave curta', () => {
    const calls: string[][] = [];
    new IdeSettings(workspace).watch((keys) => calls.push(keys));
    fakeConfig.set('global', KEY, 'en');
    expect(calls).toEqual([['appearance.language']]);
  });

  it('mudança fora de fazai.* não chama o callback', () => {
    const calls: string[][] = [];
    new IdeSettings(workspace).watch((keys) => calls.push(keys));
    fakeConfig.set('global', 'editor.fontSize', 12);
    expect(calls).toEqual([]);
  });

  it('mudança em fazai.appearance.theme chama o callback só com essa chave', () => {
    const calls: string[][] = [];
    new IdeSettings(workspace).watch((keys) => calls.push(keys));
    fakeConfig.set('global', THEME_KEY, 'dark');
    expect(calls).toEqual([['appearance.theme']]);
  });

  it('mudança em fazai.appearance.font chama o callback só com essa chave', () => {
    const calls: string[][] = [];
    new IdeSettings(workspace).watch((keys) => calls.push(keys));
    fakeConfig.set('global', FONT_KEY, 'mono');
    expect(calls).toEqual([['appearance.font']]);
  });

  it('mudança em fazai.appearance.fontSize chama o callback só com essa chave', () => {
    const calls: string[][] = [];
    new IdeSettings(workspace).watch((keys) => calls.push(keys));
    fakeConfig.set('global', FONT_SIZE_KEY, 18);
    expect(calls).toEqual([['appearance.fontSize']]);
  });
});

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
    onDidChange: (fn: () => void) => router.onDidChange(fn),
    getMeta: (key: string) => router.getMeta(key),
    setMeta: (key: string, value: string) => router.setMeta(key, value),
    handle: (msg: WebviewToHost) => {
      if (msg.type === 'settings.board.update') updates.push(msg.patch);
      return router.handle(msg);
    },
  };
}

/** Espera a migração e a reconciliação do `bind` (gravações do `update` pousam num microtask). */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('IdeSettings: bind', () => {
  it('Settings → SQLite: editar o Settings grava no board uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', KEY, 'en');
    expect(link.updates).toEqual([{ appearance: { language: 'en' } }]);
    expect(link.router.snapshot().board.appearance.language).toBe('en');
  });

  it('SQLite → Settings: gravar pelo MCP escreve no Usuário uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(fakeConfig.updates).toEqual([{ key: KEY, value: 'pt-BR', target: ConfigurationTarget.Global }]);
  });

  it('tema: Settings → SQLite: editar o Settings grava no board uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', THEME_KEY, 'dark');
    expect(link.updates).toEqual([{ appearance: { theme: 'dark' } }]);
    expect(link.router.snapshot().board.appearance.theme).toBe('dark');
  });

  it('tema: SQLite → Settings: gravar pelo MCP escreve no Usuário uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { theme: 'dark' } } });
    expect(fakeConfig.updates).toEqual([{ key: THEME_KEY, value: 'dark', target: ConfigurationTarget.Global }]);
  });

  it('fonte: Settings → SQLite: editar o Settings grava no board uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', FONT_KEY, 'mono');
    expect(link.updates).toEqual([{ appearance: { font: 'mono' } }]);
    expect(link.router.snapshot().board.appearance.font).toBe('mono');
  });

  it('fonte: SQLite → Settings: gravar pelo MCP escreve no Usuário uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { font: 'mono' } } });
    expect(fakeConfig.updates).toEqual([{ key: FONT_KEY, value: 'mono', target: ConfigurationTarget.Global }]);
  });

  it('tamanho da fonte: Settings → SQLite: editar o Settings grava no board uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', FONT_SIZE_KEY, 18);
    expect(link.updates).toEqual([{ appearance: { fontSize: 18 } }]);
    expect(link.router.snapshot().board.appearance.fontSize).toBe(18);
  });

  it('tamanho da fonte: SQLite → Settings: gravar pelo MCP escreve no Usuário uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { fontSize: 18 } } });
    expect(fakeConfig.updates).toEqual([{ key: FONT_SIZE_KEY, value: 18, target: ConfigurationTarget.Global }]);
  });

  it('mudar o tema não dispara gravação para idioma, fonte ou tamanho', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', THEME_KEY, 'dark');
    expect(link.updates).toEqual([{ appearance: { theme: 'dark' } }]);
    expect(link.router.snapshot().board.appearance.language).toBe('auto');
    expect(link.router.snapshot().board.appearance.font).toBe('sans');
    expect(link.router.snapshot().board.appearance.fontSize).toBe(14);
  });
});

describe('IdeSettings: bind na abertura', () => {
  it('Settings explícito manda: o board recebe o valor e o Settings não é tocado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[KEY] = 'en';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.appearance.language).toBe('en');
    expect(link.updates).toEqual([{ appearance: { language: 'en' } }]);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('Settings vazio e board com valor: o Settings recebe o valor do board, uma gravação', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.global[KEY]).toBe('pt-BR');
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toEqual([]);
  });

  it('iguais: nenhuma gravação nos dois lados', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);
  });

  it('tema: Settings explícito manda: o board recebe o valor e o Settings não é tocado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[THEME_KEY] = 'dark';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.appearance.theme).toBe('dark');
    expect(link.updates).toEqual([{ appearance: { theme: 'dark' } }]);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('tema: Settings vazio e board com valor: o Settings recebe o valor do board, uma gravação', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { theme: 'dark' } } });
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.global[THEME_KEY]).toBe('dark');
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toEqual([]);
  });

  it('tema: iguais: nenhuma gravação nos dois lados', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);
  });

  it('fonte: Settings explícito manda: o board recebe o valor e o Settings não é tocado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[FONT_KEY] = 'mono';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.appearance.font).toBe('mono');
    expect(link.updates).toEqual([{ appearance: { font: 'mono' } }]);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('fonte: Settings vazio e board com valor: o Settings recebe o valor do board, uma gravação', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { font: 'mono' } } });
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.global[FONT_KEY]).toBe('mono');
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toEqual([]);
  });

  it('fonte: iguais: nenhuma gravação nos dois lados', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);
  });

  it('tamanho da fonte: Settings explícito manda: o board recebe o valor e o Settings não é tocado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[FONT_SIZE_KEY] = 18;
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.appearance.fontSize).toBe(18);
    expect(link.updates).toEqual([{ appearance: { fontSize: 18 } }]);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('tamanho da fonte: Settings vazio e board com valor: o Settings recebe o valor do board, uma gravação', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { fontSize: 18 } } });
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.global[FONT_SIZE_KEY]).toBe(18);
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toEqual([]);
  });

  it('tamanho da fonte: iguais: nenhuma gravação nos dois lados', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);
  });

  it('RF7: dois boards em sequência — o primeiro grava no Settings, o segundo adota o valor do Settings', async () => {
    const linkA = await makeLink();
    linkA.router.handle({ type: 'settings.board.update', patch: { appearance: { theme: 'dark' } } });
    new IdeSettings(workspace).bind(linkA);
    await settled();
    expect(fakeConfig.values.global[THEME_KEY]).toBe('dark');
    expect(linkA.updates).toEqual([]);

    const linkB = await makeLink();
    linkB.router.handle({ type: 'settings.board.update', patch: { appearance: { theme: 'light' } } });
    new IdeSettings(workspace).bind(linkB);
    await settled();
    expect(linkB.router.snapshot().board.appearance.theme).toBe('dark');
    expect(linkB.updates).toEqual([{ appearance: { theme: 'dark' } }]);
  });
});

describe('IdeSettings: valor inválido', () => {
  it('idioma fora do enum não muda o board e vai para o log', async () => {
    const link = await makeLink();
    const lines: string[] = [];
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    await settled();
    fakeConfig.set('global', KEY, 'fr');
    expect(link.updates).toEqual([]);
    expect(link.router.snapshot().board.appearance.language).toBe('auto');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('fr');
  });

  it('tema fora do enum não muda o board e vai para o log', async () => {
    const link = await makeLink();
    const lines: string[] = [];
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    await settled();
    fakeConfig.set('global', THEME_KEY, 'blue');
    expect(link.updates).toEqual([]);
    expect(link.router.snapshot().board.appearance.theme).toBe('system');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('blue');
  });

  it('fonte fora do enum não muda o board e vai para o log', async () => {
    const link = await makeLink();
    const lines: string[] = [];
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    await settled();
    fakeConfig.set('global', FONT_KEY, 'comic-sans');
    expect(link.updates).toEqual([]);
    expect(link.router.snapshot().board.appearance.font).toBe('sans');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('comic-sans');
  });

  it.each([30, 5, '14'])('tamanho da fonte fora da faixa (%s) não muda o board e vai para o log', async (value) => {
    const link = await makeLink();
    const lines: string[] = [];
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    await settled();
    fakeConfig.set('global', FONT_SIZE_KEY, value);
    expect(link.updates).toEqual([]);
    expect(link.router.snapshot().board.appearance.fontSize).toBe(14);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(JSON.stringify(value));
  });
});

describe('IdeSettings: proteção contra laço', () => {
  it('Settings → SQLite: o onDidChange do board não vira uma gravação no Settings', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.set('global', KEY, 'en');
    expect(link.updates).toHaveLength(1);
    expect(fakeConfig.updates).toHaveLength(0);
  });

  it('SQLite → Settings: o onDidChangeConfiguration do write não vira um settings.board.update', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toHaveLength(0);
  });
});

describe('IdeSettings: dispose', () => {
  it('depois do dispose, nem o Settings nem o board propagam', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link).dispose();
    await settled();
    fakeConfig.set('global', KEY, 'en');
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(link.updates).toEqual([]);
    expect(fakeConfig.updates).toEqual([]);
  });
});

describe('IdeSettings: Git/paralelo — leitura com sobrescrita', () => {
  it('mode: Workspace sobrepõe o Usuário; sem valores, default', () => {
    fakeConfig.values.global[GIT_MODE_KEY] = 'branch';
    fakeConfig.values.workspace[GIT_MODE_KEY] = 'worktree';
    expect(new IdeSettings(workspace).read('git.mode')).toBe('worktree');
    fakeConfig.reset();
    fakeConfig.values.default[GIT_MODE_KEY] = DEFAULT_GIT.mode;
    expect(new IdeSettings(workspace).read('git.mode')).toBe('worktree');
  });

  it('parallelStories: Workspace sobrepõe o Usuário; sem valores, default', () => {
    fakeConfig.values.global[GIT_PARALLEL_STORIES_KEY] = 4;
    fakeConfig.values.workspace[GIT_PARALLEL_STORIES_KEY] = 6;
    expect(new IdeSettings(workspace).read('git.parallelStories')).toBe(6);
    fakeConfig.reset();
    fakeConfig.values.default[GIT_PARALLEL_STORIES_KEY] = DEFAULT_RUNNER.parallelStories;
    expect(new IdeSettings(workspace).read('git.parallelStories')).toBe(DEFAULT_RUNNER.parallelStories);
  });

  it('autoMerge: Workspace sobrepõe o Usuário; sem valores, default', () => {
    fakeConfig.values.global[GIT_AUTO_MERGE_KEY] = false;
    fakeConfig.values.workspace[GIT_AUTO_MERGE_KEY] = true;
    expect(new IdeSettings(workspace).read('git.autoMerge')).toBe(true);
    fakeConfig.reset();
    fakeConfig.values.default[GIT_AUTO_MERGE_KEY] = DEFAULT_GIT.autoMerge;
    expect(new IdeSettings(workspace).read('git.autoMerge')).toBe(DEFAULT_GIT.autoMerge);
  });
});

describe('IdeSettings: migração única do Git/paralelo', () => {
  it('(a) só o board tem valor: o board vira o padrão do Usuário e a marca é gravada', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.global[GIT_MODE_KEY]).toBe('branch');
    expect(fakeConfig.values.workspace[GIT_MODE_KEY]).toBeUndefined();
    expect(link.getMeta(GIT_SETTINGS_MIGRATED)).toBe('1');
  });

  it('(b) só o Usuário tem valor: o SQLite recebe o valor do Usuário e nenhum update é chamado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[GIT_MODE_KEY] = 'branch';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.git.mode).toBe('branch');
    expect(fakeConfig.updates).toEqual([]);
  });

  it('(c) os dois, diferentes: o projeto (Workspace) preserva o valor do board; Usuário e SQLite continuam como estavam', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    fakeConfig.values.global[GIT_MODE_KEY] = 'branch';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.values.workspace[GIT_MODE_KEY]).toBe('off');
    expect(fakeConfig.values.global[GIT_MODE_KEY]).toBe('branch');
    expect(link.router.snapshot().board.git.mode).toBe('off');
    // a reconciliação não lê o Usuário antes de a gravação do Workspace pousar: o SQLite nunca vira `branch`
    expect(link.updates).not.toContainEqual({ git: { mode: 'branch' } });
    expect(link.updates).toEqual([]);
  });

  it('multi-root: a mesma migração grava no WorkspaceFolder, não no Workspace', async () => {
    fake.folders = ['/tmp/a', '/tmp/b'];
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    fakeConfig.values.global[GIT_MODE_KEY] = 'branch';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toContainEqual({ key: GIT_MODE_KEY, value: 'off', target: ConfigurationTarget.WorkspaceFolder });
    expect(fakeConfig.values.folder[GIT_MODE_KEY]).toBe('off');
    expect(fakeConfig.values.workspace[GIT_MODE_KEY]).toBeUndefined();
  });

  it('não repete: segundo bind com a marca presente não gera gravação além da reconciliação', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.getMeta(GIT_SETTINGS_MIGRATED)).toBe('1');
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);

    fakeConfig.values.global[GIT_MODE_KEY] = 'branch';
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([{ git: { mode: 'branch' } }]);
  });
});

describe('IdeSettings: RF13 — escopo da gravação SQLite → Settings', () => {
  it('com Workspace explícito, a gravação vai para o Workspace', async () => {
    const link = await makeLink();
    fakeConfig.values.workspace[GIT_MODE_KEY] = 'worktree';
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.updates.length = 0;
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    expect(fakeConfig.updates).toEqual([{ key: GIT_MODE_KEY, value: 'off', target: ConfigurationTarget.Workspace }]);
  });

  it('sem valor explícito, a gravação vai para o Usuário (Global)', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    await settled();
    fakeConfig.updates.length = 0;
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    expect(fakeConfig.updates).toEqual([{ key: GIT_MODE_KEY, value: 'off', target: ConfigurationTarget.Global }]);
  });

  it('eco: a gravação no Settings não volta como um novo settings.board.update', async () => {
    const link = await makeLink();
    fakeConfig.values.workspace[GIT_MODE_KEY] = 'worktree';
    new IdeSettings(workspace).bind(link);
    await settled();
    link.updates.length = 0;
    link.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    expect(link.updates).toEqual([]);
  });
});

describe('IdeSettings: Git/paralelo — validação', () => {
  it('branchPattern sem {numero}: o SQLite mantém o padrão e o log registra o valor inválido', async () => {
    const link = await makeLink();
    const lines: string[] = [];
    fakeConfig.values.global[GIT_BRANCH_PATTERN_KEY] = 'sem-numero';
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    await settled();
    expect(link.router.snapshot().board.git.branchPattern).toBe(DEFAULT_GIT.branchPattern);
    expect(lines.some((l) => l.includes('sem-numero'))).toBe(true);
  });
});

describe('IdeSettings: paralelo no runner_json', () => {
  it('parallel e parallelStories do Git chegam ao runner do board', async () => {
    const link = await makeLink();
    fakeConfig.values.global[GIT_PARALLEL_KEY] = true;
    fakeConfig.values.global[GIT_PARALLEL_STORIES_KEY] = 3;
    new IdeSettings(workspace).bind(link);
    await settled();
    expect(link.router.snapshot().board.runner.parallel).toBe(true);
    expect(link.router.snapshot().board.runner.parallelStories).toBe(3);
  });
});
