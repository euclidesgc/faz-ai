import * as fs from 'node:fs';
import * as path from 'node:path';
import { HARNESS_CATALOG, type HarnessSource } from '../shared/harnessCatalog';
import { baseValue, isAiBase, type AiTool, type HarnessItem } from '../shared/harness';

/**
 * Leitura (nunca escrita) das pastas que a pessoa importa para o board: reconhece, no formato de cada
 * ferramenta, o que há numa pasta de origem. O board não varre as pastas das ferramentas nem grava nelas.
 */

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 5;

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

function readJson(file: string): Record<string, unknown> | null {
  try {
    if (fs.statSync(file).size > MAX_CONFIG_BYTES) return null;
    // os arquivos de configuração das ferramentas aceitam comentários de linha
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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

/**
 * Arquivos de apoio da pasta de uma skill (tudo menos o SKILL.md e arquivos ocultos), relativos a ela e
 * sem limite de quantidade: a cópia para o board precisa saber o que ficou de fora pelos limites.
 */
export function listSkillFiles(dir: string, rel = '', depth = 0): string[] {
  if (depth > 3) return [];
  return entries(rel ? path.join(dir, rel) : dir).flatMap((n) => {
    if (n.startsWith('.') || n === 'node_modules' || (!rel && n === 'SKILL.md')) return [];
    const child = rel ? `${rel}/${n}` : n;
    // Uma referência não deve copiar arquivos que o link aponta fora da skill.
    try {
      if (fs.lstatSync(path.join(dir, child)).isSymbolicLink()) return [];
    } catch {
      return [];
    }
    return isDir(path.join(dir, child)) ? listSkillFiles(dir, child, depth + 1) : [child];
  });
}

/** O que o servidor MCP roda ou onde ele está, sem argumentos, variáveis ou cabeçalhos (podem ter segredos). */
export function mcpSummary(server: unknown): string {
  const s = obj(server);
  if (typeof s.command === 'string') return 'MCP stdio';
  if (typeof s.url === 'string') return 'MCP HTTP';
  return '';
}

type Found = Pick<HarnessItem, 'kind' | 'name' | 'path' | 'layout'>;

const IMPORTABLE = new Set(['instructions', 'skill', 'agent', 'mcp']);

function scanSource(src: HarnessSource, base: string): Found[] {
  const target = path.join(base, src.path);
  const item = (name: string, file: string, layout: Found['layout']): Found => ({ kind: src.kind, name, path: file, layout });
  switch (src.layout) {
    case 'file':
      return isFile(target) ? [item(path.basename(target), target, 'file')] : [];
    case 'files':
      return walk(target, src.ext).map((f) => item(path.relative(target, f).slice(0, -src.ext.length), f, 'files'));
    case 'skills':
      return entries(target)
        .filter((n) => !n.startsWith('.') && isFile(path.join(target, n, 'SKILL.md')))
        .map((n) => item(n, path.join(target, n, 'SKILL.md'), 'skills'));
    case 'json-keys':
      return Object.keys(obj(readJson(target)?.[src.key])).map((name) => item(name, target, 'entry'));
    default:
      return [];
  }
}

/**
 * Os artefatos de uma pasta importada, no formato que a ferramenta reconhece num projeto (regras, skills,
 * agentes e servidores MCP das fontes de projeto do catálogo), mais a própria pasta como pasta de skills
 * (uma coleção de skills costuma ser só isso).
 */
export function scanImportedFolder(tool: AiTool, dir: string): Found[] {
  if (!isAiBase(tool) || !isDir(dir)) return [];
  const found: Found[] = [];
  for (const src of baseValue(HARNESS_CATALOG, tool) ?? []) {
    // as regras de subpasta e a memória são do projeto; o que fica em `base` ou na pasta do usuário não é da pasta importada
    if (src.scope !== 'project' || src.path.includes('{project}') || src.base) continue;
    if (IMPORTABLE.has(src.kind)) found.push(...scanSource(src, dir));
  }
  found.push(...scanSource({ kind: 'skill', scope: 'project', layout: 'skills', path: '' } as HarnessSource, dir));
  const seen = new Set<string>();
  return found.filter((i) => {
    const key = `${i.kind}|${i.path}|${i.name}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}
