import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fakeConfig, workspace } from './fakes/vscode';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { WebviewToHost } from '../src/shared/messages';
import { ConfigurationTarget, IdeSettings, type IdeSettingsApi } from '../src/extension/settings/ideSettings';

const KEY = 'fazai.appearance.language';

beforeEach(() => {
  fakeConfig.reset();
  fakeConfig.values.default[KEY] = 'auto';
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
    handle: (msg: WebviewToHost) => {
      if (msg.type === 'settings.board.update') updates.push(msg.patch);
      return router.handle(msg);
    },
  };
}

describe('IdeSettings: bind', () => {
  it('Settings → SQLite: editar o Settings grava no board uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    fakeConfig.set('global', KEY, 'en');
    expect(link.updates).toEqual([{ appearance: { language: 'en' } }]);
    expect(link.router.snapshot().board.appearance.language).toBe('en');
  });

  it('SQLite → Settings: gravar pelo MCP escreve no Usuário uma vez', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(fakeConfig.updates).toEqual([{ key: KEY, value: 'pt-BR', target: ConfigurationTarget.Global }]);
  });
});

describe('IdeSettings: bind na abertura', () => {
  it('Settings explícito manda: o board recebe o valor e o Settings não é tocado', async () => {
    const link = await makeLink();
    fakeConfig.values.global[KEY] = 'en';
    new IdeSettings(workspace).bind(link);
    expect(link.router.snapshot().board.appearance.language).toBe('en');
    expect(link.updates).toEqual([{ appearance: { language: 'en' } }]);
    expect(fakeConfig.updates).toEqual([]);
  });

  it('Settings vazio e board com valor: o Settings recebe o valor do board, uma gravação', async () => {
    const link = await makeLink();
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    new IdeSettings(workspace).bind(link);
    expect(fakeConfig.values.global[KEY]).toBe('pt-BR');
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toEqual([]);
  });

  it('iguais: nenhuma gravação nos dois lados', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    expect(fakeConfig.updates).toEqual([]);
    expect(link.updates).toEqual([]);
  });
});

describe('IdeSettings: valor inválido', () => {
  it('idioma fora do enum não muda o board e vai para o log', async () => {
    const link = await makeLink();
    const lines: string[] = [];
    new IdeSettings(workspace, undefined, (l) => lines.push(l)).bind(link);
    fakeConfig.set('global', KEY, 'fr');
    expect(link.updates).toEqual([]);
    expect(link.router.snapshot().board.appearance.language).toBe('auto');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('fr');
  });
});

describe('IdeSettings: proteção contra laço', () => {
  it('Settings → SQLite: o onDidChange do board não vira uma gravação no Settings', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    fakeConfig.set('global', KEY, 'en');
    expect(link.updates).toHaveLength(1);
    expect(fakeConfig.updates).toHaveLength(0);
  });

  it('SQLite → Settings: o onDidChangeConfiguration do write não vira um settings.board.update', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link);
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(fakeConfig.updates).toHaveLength(1);
    expect(link.updates).toHaveLength(0);
  });
});

describe('IdeSettings: dispose', () => {
  it('depois do dispose, nem o Settings nem o board propagam', async () => {
    const link = await makeLink();
    new IdeSettings(workspace).bind(link).dispose();
    fakeConfig.set('global', KEY, 'en');
    link.router.handle({ type: 'settings.board.update', patch: { appearance: { language: 'pt-BR' } } });
    expect(link.updates).toEqual([]);
    expect(fakeConfig.updates).toEqual([]);
  });
});
