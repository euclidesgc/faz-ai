import { isAiBase } from '../shared/harness';
import { baseValue } from '../shared/harness';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, HarnessItem, HarnessScope, PluginInstall } from '../shared/harness';
import {
  HARNESS_CATALOG,
  PERMISSION_LIST_LABEL,
  PLUGIN_ROOTS,
  claudeProjectKey,
  managedDir,
  type HarnessSource,
} from '../shared/harnessCatalog';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { skillMode } from './skillMode';
import { listSkillFiles, mcpSummary } from './artifactSource';

export { listSkillFiles, mcpSummary };
import { parseKimiHooks } from '../shared/kimiHooks';

const HEAD_BYTES = 4096;
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 5;

/** Começo do arquivo, o bastante para ler o frontmatter sem carregar o arquivo inteiro. */
function head(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, HEAD_BYTES, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function readConfig(file: string): string | null {
  try {
    return fs.statSync(file).size > MAX_CONFIG_BYTES ? null : fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(file: string): Record<string, unknown> | null {
  const text = readConfig(file);
  if (text === null) return null;
  try {
    // os arquivos de configuração das ferramentas aceitam comentários de linha
    const v: unknown = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isFile = (p: string) => fs.existsSync(p) && fs.statSync(p).isFile();
const isDir = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();
const entries = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const short = (s: string, max = 160) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** `description` do frontmatter YAML de um arquivo markdown. */
function descriptionOf(file: string): string {
  const text = head(file);
  return frontmatterValue(frontmatterOf(text), 'description') ?? '';
}

function walk(dir: string, ext: string, depth = 0): string[] {
  if (depth > MAX_DEPTH) return [];
  return entries(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (n.startsWith('.')) return [];
    if (isDir(p)) return walk(p, ext, depth + 1);
    return n.endsWith(ext) ? [p] : [];
  });
}

/** Pastas que não entram na busca de regras de subpasta: dependências, saídas de build e controle de versão. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', 'bower_components']);
const MAX_NESTED_DEPTH = 4;
const MAX_NESTED_DIRS = 2000;

/** Arquivos com um dos nomes nas subpastas do projeto (sem a raiz), sem entrar em pastas ocultas nem de dependências. */
function nestedFiles(root: string, names: string[]): string[] {
  const found: string[] = [];
  let visited = 0;
  const visit = (dir: string, depth: number) => {
    if (depth > MAX_NESTED_DEPTH || ++visited > MAX_NESTED_DIRS) return;
    for (const n of entries(dir)) {
      if (n.startsWith('.') || SKIP_DIRS.has(n)) continue;
      const p = path.join(dir, n);
      if (!isDir(p)) continue;
      for (const name of names) if (isFile(path.join(p, name))) found.push(path.join(p, name));
      visit(p, depth + 1);
    }
  };
  visit(root, 1);
  return found;
}

/** Até onde o Claude Code segue um `@caminho` que importa outro que importa outro. */
const MAX_IMPORT_HOPS = 4;

/**
 * Os `@caminho` de um arquivo de instruções do Claude Code: fora de blocos e trechos de código, com o
 * caminho relativo à pasta do arquivo, a partir de `~/` ou absoluto, e `\ ` para espaço. Só os que
 * existem, com os importados por eles, sem repetir nem voltar a um arquivo já visto.
 */
export function importsOf(file: string, homeDir: string, depth = 1, seen = new Set([file])): { path: string; depth: number }[] {
  if (depth > MAX_IMPORT_HOPS) return [];
  const text = readConfig(file);
  if (text === null) return [];
  const out: { path: string; depth: number }[] = [];
  const prose = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  for (const m of prose.matchAll(/(?:^|\s)@((?:\\ |[^\s])+)/g)) {
    const raw = m[1]!.replace(/\\ /g, ' ').replace(/[.,;:)]+$/, '');
    const target = raw.startsWith('~/')
      ? path.join(homeDir, raw.slice(2))
      : path.isAbsolute(raw)
        ? raw
        : path.resolve(path.dirname(file), raw);
    if (seen.has(target) || !isFile(target)) continue;
    seen.add(target);
    out.push({ path: target, depth }, ...importsOf(target, homeDir, depth + 1, seen));
  }
  return out;
}

const MAX_SKILL_FILES = 100;

/** Os arquivos de apoio que o inventário mostra: os primeiros 100. */
const skillFiles = (dir: string): string[] => listSkillFiles(dir).slice(0, MAX_SKILL_FILES);

/** O comando de um hook. */
export const hookCommand = (h: Record<string, unknown>): string => (typeof h.command === 'string' ? h.command : '');

/** Hooks de um evento, um por comando, com o filtro do grupo ou da própria entrada. */
function hookEntries(value: unknown): { matcher: string; command: string; type: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const e = obj(raw);
    const matcher = typeof e.matcher === 'string' ? e.matcher : '';
    // Claude Code agrupa por filtro; Cursor põe o comando direto na entrada
    const handlers = Array.isArray(e.hooks) ? e.hooks.map(obj) : [e];
    return handlers.map((h) => ({ matcher, command: hookCommand(h), type: typeof h.type === 'string' ? h.type : 'command' }));
  });
}

interface Ctx {
  projectDir: string;
  homeDir: string;
}

type Found = Omit<HarnessItem, 'location' | 'imports'>;

const MAX_DIGEST_BYTES = 256 * 1024;

function digest(file: string): string | undefined {
  try {
    return fs.statSync(file).size > MAX_DIGEST_BYTES
      ? undefined
      : createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  } catch {
    return undefined;
  }
}

/** O tamanho do arquivo em bytes, quando ele pode ser lido. */
function sizeField(file: string): { size?: number } {
  try {
    return { size: fs.statSync(file).size };
  } catch {
    return {};
  }
}

function scanSource(src: HarnessSource, base: string, ctx: Ctx, source?: number): Found[] {
  const target = path.join(base, src.path.replace('{project}', claudeProjectKey(ctx.projectDir)));
  const scope: HarnessScope = src.builtin ? 'plugin' : src.scope;
  const layout =
    src.layout === 'nested' ? 'file' : src.layout === 'file' || src.layout === 'files' || src.layout === 'skills' ? src.layout : 'entry';
  const item = (name: string, description: string, file: string): Found => ({
    kind: src.kind,
    scope,
    name,
    description,
    path: file,
    layout,
    ...(src.builtin ? { plugin: src.builtin } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(layout === 'files' || layout === 'skills' ? { digest: digest(file) } : {}),
    // o tamanho vale para o arquivo inteiro: uma entrada de um arquivo de configuração não tem tamanho próprio
    ...(layout !== 'entry' ? sizeField(file) : {}),
  });
  const hookItem = (event: string, h: { matcher: string; command: string; type: string }, file: string): Found => ({
    ...item(event, short(`${h.matcher ? `${h.matcher} → ` : ''}${h.command || `(${h.type})`}`), file),
    detail: h.command,
  });
  switch (src.layout) {
    case 'file':
      return isFile(target) ? [item(path.basename(target), src.kind === 'settings' ? '' : descriptionOf(target), target)] : [];
    case 'files':
      return walk(target, src.ext).map((f) => item(path.relative(target, f).slice(0, -src.ext.length), descriptionOf(f), f));
    case 'skills':
      return entries(target)
        .filter((n) => !n.startsWith('.') && isFile(path.join(target, n, 'SKILL.md')))
        .map((n) => ({
          ...item(n, descriptionOf(path.join(target, n, 'SKILL.md')), path.join(target, n, 'SKILL.md')),
          mode: skillMode(path.join(target, n, 'SKILL.md')),
          files: skillFiles(path.join(target, n)),
        }));
    case 'json-keys': {
      const section = obj(readJson(target)?.[src.key]);
      if (src.kind === 'hook')
        return Object.entries(section).flatMap(([event, v]) => hookEntries(v).map((h) => hookItem(event, h, target)));
      return Object.entries(section).map(([name, v]) => item(name, short(mcpSummary(v)), target));
    }
    case 'toml-hooks': {
      let text = '';
      try {
        text = fs.readFileSync(target, 'utf8');
      } catch {
        return [];
      }
      return parseKimiHooks(text).hooks.map((h) => hookItem(h.event, { matcher: h.matcher, command: h.command, type: 'command' }, target));
    }
    case 'claude-json': {
      const json = readJson(target);
      if (!json) return [];
      const local = obj(obj(obj(json.projects)[ctx.projectDir]).mcpServers);
      return [
        ...Object.entries(obj(json.mcpServers)).map(([name, v]) => item(name, mcpSummary(v), target)),
        ...Object.entries(local).map(([name, v]) => item(name, `${mcpSummary(v)} (só nesta pasta de projeto)`, target)),
      ];
    }
    case 'nested':
      return nestedFiles(base, src.names).map((f) => item(path.relative(base, f).split(path.sep).join('/'), descriptionOf(f), f));
    case 'json-permissions': {
      const permissions = obj(readJson(target)?.permissions);
      return src.lists.flatMap((list) =>
        (Array.isArray(permissions[list]) ? (permissions[list] as unknown[]) : [])
          .filter((r): r is string => typeof r === 'string')
          .map((rule) => ({ ...item(rule, PERMISSION_LIST_LABEL[list] ?? list, target), detail: list })),
      );
    }
  }
}

/** Pastas de plugin abaixo de `root`: as que têm um dos arquivos de manifesto. Não entra em pastas ocultas nem dentro de um plugin. */
function pluginDirs(root: string, manifests: string[], depth = 0): { dir: string; manifest: string }[] {
  if (depth > MAX_DEPTH || !isDir(root)) return [];
  const manifest = manifests.map((m) => path.join(root, m)).find(isFile);
  if (manifest) return [{ dir: root, manifest }];
  return entries(root)
    .filter((n) => !n.startsWith('.') && n !== 'node_modules')
    .flatMap((n) => pluginDirs(path.join(root, n), manifests, depth + 1));
}

/** O Claude Code guarda gerações de um plugin lado a lado (`nome`, `nome~g2`…): fica a mais recente. */
function latestGenerations(found: { dir: string; manifest: string }[]): { dir: string; manifest: string }[] {
  const best = new Map<string, { gen: number; value: { dir: string; manifest: string } }>();
  for (const value of found) {
    const m = /^(.*)~g(\d+)$/.exec(path.basename(value.dir));
    const key = path.join(path.dirname(value.dir), m ? m[1]! : path.basename(value.dir));
    const gen = m ? Number(m[2]) : 0;
    if (!best.has(key) || best.get(key)!.gen < gen) best.set(key, { gen, value });
  }
  return [...best.values()].map((b) => b.value);
}

/**
 * As pastas dos plugins que a ferramenta carrega. No Claude Code, com a lista da CLI, são exatamente as
 * instaladas; sem ela, as pastas de plugin abaixo de `~/.claude/plugins`, menos os catálogos dos
 * marketplaces (`marketplaces/`, plugins disponíveis e não instalados) e os dados que eles guardam.
 * No Cursor, as de `~/.cursor/plugins/local`, cada uma desinstalável tirando a pasta.
 */
function installedPluginDirs(
  tool: AiTool,
  ctx: Ctx,
  claude: PluginInstall[] | null | undefined,
): { dir: string; manifest: string; install?: PluginInstall }[] {
  if (tool === 'claude' && claude) {
    const manifests = PLUGIN_ROOTS.claude[0]!.manifests;
    // o manifesto é opcional: sem ele o item aponta para a pasta
    return claude.map((install) => ({
      dir: install.dir,
      manifest: manifests.map((m) => path.join(install.dir, m)).find(isFile) ?? install.dir,
      install,
    }));
  }
  return (baseValue(PLUGIN_ROOTS, tool) ?? []).flatMap((root) => {
    const base = path.join(ctx.homeDir, root.path);
    const skip = tool === 'claude' ? ['marketplaces', 'data'] : [];
    const found = entries(base)
      .filter((n) => !n.startsWith('.') && !skip.includes(n))
      .flatMap((n) => pluginDirs(path.join(base, n), root.manifests, 1));
    return latestGenerations(found).map((f) =>
      tool === 'cursor' ? { ...f, install: { id: path.relative(base, f.dir), scopes: ['local'], enabled: true, dir: f.dir } } : f,
    );
  });
}

function scanPlugins(tool: AiTool, ctx: Ctx, claude: PluginInstall[] | null | undefined): Found[] {
  const out: Found[] = [];
  for (const { dir, manifest, install } of installedPluginDirs(tool, ctx, claude)) {
    const meta = (manifest !== dir && readJson(manifest)) || {};
    // sem manifesto, o nome vem do id do Claude Code (`nome@marketplace`) ou da pasta
    const fallback = install && tool === 'claude' ? install.id.replace(/@.*$/, '') : path.basename(dir).replace(/~g\d+$/, '');
    const plugin = typeof meta.name === 'string' && meta.name ? meta.name : fallback;
    out.push({
      kind: 'plugin',
      scope: 'plugin',
      name: plugin,
      description: typeof meta.description === 'string' ? short(meta.description) : '',
      path: manifest,
      plugin,
      layout: 'entry',
      ...(install ? { install } : {}),
    });
    const parts: HarnessSource[] = [
      { kind: 'skill', scope: 'user', layout: 'skills', path: 'skills' },
      { kind: 'agent', scope: 'user', layout: 'files', path: 'agents', ext: '.md' },
      { kind: 'command', scope: 'user', layout: 'files', path: 'commands', ext: '.md' },
      { kind: 'hook', scope: 'user', layout: 'json-keys', path: 'hooks/hooks.json', key: 'hooks' },
      { kind: 'mcp', scope: 'user', layout: 'json-keys', path: '.mcp.json', key: 'mcpServers' },
      { kind: 'mcp', scope: 'user', layout: 'json-keys', path: 'mcp.json', key: 'mcpServers' },
    ];
    for (const src of parts) out.push(...scanSource(src, dir, ctx).map((i): Found => ({ ...i, scope: 'plugin', plugin })));
  }
  return out;
}

/**
 * Os artefatos de uma pasta importada, no formato que a ferramenta reconhece num projeto (as fontes de
 * projeto do catálogo: regras, skills, agentes, comandos, hooks, servidores MCP, configurações), mais a
 * própria pasta como pasta de skills (uma coleção de skills costuma ser só isso). A ferramenta não os
 * carrega: ficam com o escopo `imported`, e só entram nas execuções quando enviados ao board.
 */
function scanImported(tool: AiTool, dir: string, ctx: Ctx): Found[] {
  if (!isDir(dir)) return [];
  const found: Found[] = [];
  (baseValue(HARNESS_CATALOG, tool) ?? []).forEach((src, source) => {
    // as regras de subpasta e a memória são do projeto; o ~/.claude.json é do Claude Code
    if (src.scope !== 'project' || src.layout === 'nested' || src.path.includes('{project}') || src.base) return;
    found.push(...scanSource(src, dir, ctx, source));
  });
  found.push(...scanSource({ kind: 'skill', scope: 'project', layout: 'skills', path: '', group: 'skill' }, dir, ctx));
  return found.map((i) => ({ ...i, scope: 'imported' as const }));
}

/** Tudo que a ferramenta carrega: do projeto, da pasta do usuário e dos plugins instalados; mais o que há nas pastas importadas. */
export function scanInventory(
  tool: AiTool,
  projectDir: string,
  homeDir: string,
  /** pasta da política da organização; o padrão é a do sistema em que o board roda */
  managed = managedDir(process.platform),
  /** plugins que o Claude Code diz ter instalados; sem a lista, valem as pastas de plugin */
  claudePlugins?: PluginInstall[] | null,
  /** pastas importadas pela pessoa para esta ferramenta */
  imports: string[] = [],
): HarnessItem[] {
  if (!isAiBase(tool)) return [];
  const ctx: Ctx = { projectDir, homeDir };
  const found: Found[] = [];
  (baseValue(HARNESS_CATALOG, tool) ?? []).forEach((src, source) => {
    const base = src.base === 'managed' ? managed : src.scope === 'project' ? projectDir : homeDir;
    // a memória fica numa pasta com o nome do projeto: sem projeto, não há o que procurar
    if (base && (projectDir || !src.path.includes('{project}'))) found.push(...scanSource(src, base, ctx, source));
  });
  if (homeDir) found.push(...scanPlugins(tool, ctx, claudePlugins));
  for (const dir of imports) found.push(...scanImported(tool, dir, ctx));
  const inside = (base: string, file: string) => !!base && file.startsWith(base + path.sep);
  const rel = (base: string, file: string) => path.relative(base, file).split(path.sep).join('/');
  const location = (file: string) => {
    // o projeto costuma ficar dentro da home: vale a pasta mais próxima do arquivo
    const inProject = inside(projectDir, file) && !(inside(homeDir, file) && homeDir.length > projectDir.length);
    if (inProject) return rel(projectDir, file);
    return inside(homeDir, file) ? `~/${rel(homeDir, file)}` : file;
  };
  const seen = new Set<string>();
  return found
    .filter((i) => {
      // o mesmo arquivo pode ser alcançado por dois caminhos do catálogo
      const key = `${i.kind}|${i.path}|${i.name}|${i.detail ?? ''}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .map((i): HarnessItem => {
      // o Claude Code expande os `@caminho` das instruções: a tela mostra o que cada arquivo puxa
      const imports =
        tool === 'claude' && i.kind === 'instructions' && i.scope !== 'plugin' && i.path.endsWith('.md') ? importsOf(i.path, homeDir) : [];
      return {
        ...i,
        // um artefato importado é identificado pelo caminho absoluto, esteja a pasta onde estiver (dentro
        // da home ou do projeto): é por esse prefixo que tirar a pasta tira os artefatos dela do board
        location: i.scope === 'imported' ? i.path : location(i.path),
        ...(imports.length ? { imports: imports.map((x) => ({ ...x, location: location(x.path) })) } : {}),
      };
    });
}
