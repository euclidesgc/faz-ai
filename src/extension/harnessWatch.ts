import { baseValue } from '../shared/harness';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AI_BASES } from '../shared/harness';
import { HARNESS_CATALOG, PLUGIN_ROOTS, claudeProjectKey, type HarnessSource } from '../shared/harnessCatalog';
import { CLAUDE_PLUGIN_STATE } from './plugins';

/** Um caminho que a varredura do harness lê. Não depende da API do VSCode. */
export interface WatchTarget {
  /** caminho absoluto de uma pasta ou de um arquivo */
  path: string;
  /** a pasta com as subpastas (as pastas de arquivos e de skills do catálogo); falso para um arquivo */
  recursive: boolean;
}

export interface Disposable {
  dispose(): void;
}

/** Liga um watcher num caminho; `onEvent` é chamado a cada mudança nele. */
export type WatchFn = (target: WatchTarget, onEvent: () => void) => Disposable;

const ALL_SOURCES = AI_BASES.flatMap((t) => baseValue(HARNESS_CATALOG, t.id) ?? []);

/** O caminho de uma fonte do catálogo: as pastas são lidas com as subpastas, os arquivos sozinhos. */
function sourceTarget(src: HarnessSource, base: string, projectDir: string): WatchTarget[] {
  // as regras de subpasta pediriam observar o projeto inteiro
  if (src.layout === 'nested') return [];
  if (src.path.includes('{project}') && !projectDir) return [];
  const p = path.join(base, src.path.replace('{project}', claudeProjectKey(projectDir)));
  return [{ path: p, recursive: src.layout === 'files' || src.layout === 'skills' }];
}

/**
 * Os links do primeiro nível de cada pasta observada (a skill instalada como link para um repositório).
 * O watcher de uma pasta não segue links; o de um caminho que é ele mesmo um link, sim.
 */
function links(targets: WatchTarget[]): WatchTarget[] {
  return targets.flatMap((t) => {
    if (!t.recursive) return [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(t.path, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((e): WatchTarget[] => {
      if (!e.isSymbolicLink()) return [];
      const p = path.join(t.path, e.name);
      try {
        return [{ path: p, recursive: fs.statSync(p).isDirectory() }];
      } catch {
        // link quebrado: não há o que observar do outro lado
        return [];
      }
    });
  });
}

/** Sem repetir caminho: a mesma pasta aparece em fontes de mais de uma ferramenta. */
function unique(targets: WatchTarget[]): WatchTarget[] {
  const byPath = new Map<string, WatchTarget>();
  for (const t of targets) byPath.set(t.path, { path: t.path, recursive: t.recursive || !!byPath.get(t.path)?.recursive });
  return [...byPath.values()];
}

/**
 * O que a varredura do harness lê na pasta do usuário: as fontes de usuário do catálogo das duas
 * ferramentas (a varredura lê as duas), com a pasta `memory` deste projeto em `~/.claude/projects` (o
 * resto dela recebe as transcrições das sessões o tempo todo), os plugins locais do Cursor e, dos
 * plugins do Claude Code, só o que muda a lista de instalados. Nunca a home inteira. A política da
 * organização fica numa pasta do sistema, fora da home, e é relida com o resto quando algo muda.
 */
export function userWatchTargets(homeDir: string, projectDir: string): WatchTarget[] {
  if (!homeDir) return [];
  const own = ALL_SOURCES.filter((s) => s.scope === 'user' && s.base !== 'managed').flatMap((s) => sourceTarget(s, homeDir, projectDir));
  const plugins = [
    ...CLAUDE_PLUGIN_STATE.map((f) => ({ path: path.join(homeDir, f), recursive: false })),
    ...PLUGIN_ROOTS.cursor.map((r) => ({ path: path.join(homeDir, r.path), recursive: true })),
  ];
  const targets = unique([...own, ...plugins]);
  return unique([...targets, ...links(targets)]);
}

/**
 * O mesmo na pasta do projeto, para o modo navegador (no editor, o watcher da pasta aberta cobre): as
 * fontes de projeto do catálogo e as pastas das skills desligadas. Só as pastas que a varredura lê, e
 * não a `.claude` inteira, onde ficam também as worktrees, com as dependências e os builds delas.
 */
export function projectWatchTargets(projectDir: string): WatchTarget[] {
  if (!projectDir) return [];
  const own = ALL_SOURCES.filter((s) => s.scope === 'project').flatMap((s) => sourceTarget(s, projectDir, projectDir));
  const disabled = AI_BASES.map((t) => ({ path: path.join(projectDir, `${t.skills}-disabled`), recursive: true }));
  const targets = unique([...own, ...disabled]);
  return unique([...targets, ...links(targets)]);
}

/** Atraso que junta os eventos de uma mudança numa releitura só. */
export const HARNESS_WATCH_DELAY = 300;

/**
 * Observa os caminhos do harness e relê o board uma vez por rajada: um salvamento, um git checkout ou
 * uma skill instalada geram vários eventos, e a releitura espera `delay` sem nenhum novo. A cada
 * releitura a lista de caminhos é refeita, para observar o que passou a existir (um link de skill novo)
 * e soltar o que saiu.
 */
export class HarnessWatcher implements Disposable {
  private readonly watchers = new Map<string, Disposable>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly targets: () => WatchTarget[],
    private readonly watch: WatchFn,
    private readonly onChange: () => void,
    private readonly delay = HARNESS_WATCH_DELAY,
  ) {
    this.sync();
  }

  /** Uma mudança vista por um dos watchers, ou por um de fora (o da pasta do projeto, no editor). */
  readonly notify = (): void => {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.sync();
      this.onChange();
    }, this.delay);
  };

  private sync(): void {
    const next = new Map(this.targets().map((t) => [`${t.recursive ? '**' : '*'} ${t.path}`, t]));
    for (const [key, watcher] of this.watchers) {
      if (next.has(key)) continue;
      watcher.dispose();
      this.watchers.delete(key);
    }
    for (const [key, target] of next) {
      if (this.watchers.has(key)) continue;
      try {
        this.watchers.set(key, this.watch(target, this.notify));
      } catch {
        // um caminho que o sistema não deixa observar não impede os outros
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
  }
}

/**
 * Os watchers do Node, para o modo navegador, com os cuidados da documentação do `fs.watch`: ele
 * observa o inode, e não o caminho (o arquivo salvo por troca, ou a pasta apagada e recriada, deixa de
 * avisar), e não aceita um caminho que ainda não existe. Nos dois casos o caminho é religado: na hora,
 * quando existe, ou quando aparecer, conferido a cada `pollMs`, como faz o watcher do VS Code.
 */
export function nodeWatch(pollMs = 5000): WatchFn {
  return (target, onEvent) => {
    let watcher: fs.FSWatcher | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let ino: number | undefined;
    const stat = () => {
      try {
        return fs.statSync(target.path);
      } catch {
        return undefined;
      }
    };
    const stop = () => {
      watcher?.close();
      watcher = undefined;
      clearInterval(poll);
      poll = undefined;
    };
    const waitForPath = () => {
      poll = setInterval(() => {
        if (!stat()) return;
        arm();
        onEvent();
      }, pollMs);
      poll.unref();
    };
    const changed = () => {
      // o caminho passou a ser outro arquivo, ou sumiu: o watcher de agora já não vê o que acontece nele
      if (stat()?.ino !== ino) arm();
      onEvent();
    };
    const arm = () => {
      stop();
      const st = stat();
      ino = st?.ino;
      if (!st) return waitForPath();
      try {
        const current = fs.watch(target.path, { recursive: target.recursive && st.isDirectory(), persistent: false }, changed);
        watcher = current;
        // um watcher com erro não serve mais (no Windows, quando a pasta é apagada): espera o caminho de novo
        current.on('error', () => {
          stop();
          waitForPath();
          onEvent();
        });
        // o watcher só passa a valer na próxima volta do event loop: um arquivo trocado antes disso deixa
        // este preso ao inode antigo, sem nenhum evento
        setImmediate(() => {
          if (watcher === current && stat()?.ino !== ino) changed();
        });
      } catch {
        // o sistema não deu o watcher (limite do inotify, sistema de arquivos de rede): fica a releitura periódica
        watcher = undefined;
      }
    };
    arm();
    return { dispose: stop };
  };
}
