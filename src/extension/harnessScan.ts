import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, HarnessItem, HarnessScope } from '../shared/harness';
import { HARNESS_CATALOG, PERMISSION_LIST_LABEL, PLUGIN_ROOTS, type HarnessSource } from '../shared/harnessCatalog';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { skillMode } from './skillMode';

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

/** `description` de um arquivo markdown (frontmatter YAML) ou TOML. */
function descriptionOf(file: string): string {
  const text = head(file);
  if (file.endsWith('.toml')) return /^description\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(text)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
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

const MAX_SKILL_FILES = 100;

/** Arquivos de apoio da pasta de uma skill (tudo menos o SKILL.md e arquivos ocultos), relativos a ela. */
function skillFiles(dir: string, rel = '', depth = 0): string[] {
  if (depth > 3) return [];
  return entries(rel ? path.join(dir, rel) : dir)
    .flatMap((n) => {
      if (n.startsWith('.') || n === 'node_modules' || (!rel && n === 'SKILL.md')) return [];
      const child = rel ? `${rel}/${n}` : n;
      return isDir(path.join(dir, child)) ? skillFiles(dir, child, depth + 1) : [child];
    })
    .slice(0, MAX_SKILL_FILES);
}

/** O comando de um hook, em qualquer dos formatos das ferramentas (command, bash, powershell). */
export const hookCommand = (h: Record<string, unknown>): string =>
  [h.command, h.bash, h.powershell].find((x): x is string => typeof x === 'string') ?? '';

/** Hooks de um evento, um por comando, com o filtro do grupo ou da própria entrada. */
function hookEntries(value: unknown): { matcher: string; command: string; type: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const e = obj(raw);
    const matcher = typeof e.matcher === 'string' ? e.matcher : '';
    // Claude Code e Codex agrupam por filtro; Cursor e Copilot põem o comando direto na entrada
    const handlers = Array.isArray(e.hooks) ? e.hooks.map(obj) : [e];
    return handlers.map((h) => ({ matcher, command: hookCommand(h), type: typeof h.type === 'string' ? h.type : 'command' }));
  });
}

/** O que o servidor MCP roda ou onde ele está, sem argumentos, variáveis ou cabeçalhos (podem ter segredos). */
function mcpSummary(server: unknown): string {
  const s = obj(server);
  if (typeof s.command === 'string') return s.command;
  if (typeof s.url === 'string') return s.url.split('?')[0]!;
  return '';
}

/** Valor de uma chave de texto dentro de um trecho de TOML. */
const tomlString = (block: string, key: string) => new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(block)?.[1] ?? '';

interface Ctx {
  projectDir: string;
  homeDir: string;
}

type Found = Omit<HarnessItem, 'location'>;

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

function scanSource(src: HarnessSource, base: string, ctx: Ctx): Found[] {
  const target = path.join(base, src.path);
  const scope: HarnessScope = src.builtin ? 'plugin' : src.scope;
  const layout = src.layout === 'file' || src.layout === 'files' || src.layout === 'skills' ? src.layout : 'entry';
  const item = (name: string, description: string, file: string): Found => ({
    kind: src.kind,
    scope,
    name,
    description,
    path: file,
    layout,
    ...(src.builtin ? { plugin: src.builtin } : {}),
    ...(layout === 'files' || layout === 'skills' ? { digest: digest(file) } : {}),
  });
  const hookItem = (event: string, h: { matcher: string; command: string; type: string }, file: string): Found => ({
    ...item(event, short(`${h.matcher ? `${h.matcher} → ` : ''}${h.command || `(${h.type})`}`), file),
    detail: h.command,
  });
  switch (src.layout) {
    case 'file':
      return isFile(target) ? [item(path.basename(target), src.kind === 'settings' ? '' : descriptionOf(target), target)] : [];
    case 'files':
      return walk(target, src.ext).map((f) =>
        item(
          path
            .relative(target, f)
            .slice(0, -src.ext.length)
            .replace(/\.agent$/, ''),
          descriptionOf(f),
          f,
        ),
      );
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
    case 'claude-json': {
      const json = readJson(target);
      if (!json) return [];
      const local = obj(obj(obj(json.projects)[ctx.projectDir]).mcpServers);
      return [
        ...Object.entries(obj(json.mcpServers)).map(([name, v]) => item(name, mcpSummary(v), target)),
        ...Object.entries(local).map(([name, v]) => item(name, `${mcpSummary(v)} (só nesta pasta de projeto)`, target)),
      ];
    }
    case 'toml-tables': {
      const text = readConfig(target);
      if (text === null) return [];
      const re = new RegExp(`^\\[${src.table}\\.(?:"([^"]+)"|([\\w-]+))\\]\\s*$`, 'gm');
      return [...text.matchAll(re)].map((m) => {
        const block = text.slice(m.index! + m[0].length).split(/^\[/m)[0]!;
        return item((m[1] ?? m[2])!, tomlString(block, 'command') || tomlString(block, 'url').split('?')[0]!, target);
      });
    }
    case 'toml-array': {
      const text = readConfig(target);
      if (text === null) return [];
      return text
        .split(new RegExp(`^\\[\\[${src.table}\\]\\]\\s*$`, 'm'))
        .slice(1)
        .map((raw) => raw.split(/^\[/m)[0]!)
        .map((block) => ({
          ...item(tomlString(block, 'event') || 'hook', short(tomlString(block, 'command')), target),
          detail: tomlString(block, 'command'),
        }));
    }
    case 'hook-files':
      return walk(target, '.json').flatMap((f) =>
        Object.entries(obj(readJson(f)?.hooks)).flatMap(([event, v]) => hookEntries(v).map((h) => hookItem(event, h, f))),
      );
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

function scanPlugins(tool: AiTool, ctx: Ctx): Found[] {
  const out: Found[] = [];
  for (const root of PLUGIN_ROOTS[tool]) {
    for (const { dir, manifest } of latestGenerations(pluginDirs(path.join(ctx.homeDir, root.path), root.manifests))) {
      const meta = readJson(manifest) ?? {};
      const plugin = typeof meta.name === 'string' && meta.name ? meta.name : path.basename(dir).replace(/~g\d+$/, '');
      out.push({
        kind: 'plugin',
        scope: 'plugin',
        name: plugin,
        description: typeof meta.description === 'string' ? short(meta.description) : '',
        path: manifest,
        plugin,
        layout: 'entry',
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
  }
  return out;
}

/** Tudo que a ferramenta carrega: do projeto, da pasta do usuário e dos plugins instalados. */
export function scanInventory(tool: AiTool, projectDir: string, homeDir: string): HarnessItem[] {
  const ctx: Ctx = { projectDir, homeDir };
  const found: Found[] = [];
  for (const src of HARNESS_CATALOG[tool]) {
    const base = src.scope === 'project' ? projectDir : homeDir;
    if (base) found.push(...scanSource(src, base, ctx));
  }
  if (homeDir) found.push(...scanPlugins(tool, ctx));
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
    .map((i) => ({ ...i, location: location(i.path) }));
}
