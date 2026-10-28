// Funções comuns dos adaptadores do "Exportar para a ferramenta" (#623).
import { isSafeRelPath, type AgentMeta } from '../../shared/artifacts';
import { parseModelValue } from '../../shared/models';
import { nativeTools, supportsToolList } from '../../shared/artifactTools';
import type { AiTool } from '../../shared/harness';
import type { FormatLoss, RefuseReason } from '../../shared/toolExport';
import { isSafeSegment } from '../attachments';
import { frontmatterOf, frontmatterValue } from '../frontmatter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExportSource, ListedSource, RenderedFile } from './types';
import type { ExportTarget } from '../../shared/toolExport';

/** Texto livre como string JSON, que é YAML válido: aspas, `:` e quebras de linha não quebram o cabeçalho. */
export const yamlString = (s: string): string => JSON.stringify(s.replace(/\s+/g, ' ').trim());

/** Lista como sequência YAML em linha (`["a","b"]`). */
export const yamlList = (items: readonly string[]): string => JSON.stringify(items);

/** Nome do arquivo da regra: último trecho do caminho, sem `.md`/`.mdc`, `[a-z0-9-]`; `regra` se der vazio. */
export function ruleSlug(name: string): string {
  const last = name.split('/').filter(Boolean).pop() ?? '';
  const slug = last
    .replace(/\.(md|mdc)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'regra';
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/** O texto sem o frontmatter do começo (se houver), e se havia. */
export function stripFrontmatter(content: string): { text: string; had: boolean } {
  const m = FRONTMATTER.exec(content);
  return m ? { text: content.slice(m[0].length).replace(/^\r?\n/, ''), had: true } : { text: content, had: false };
}

/** Garante `name` e `description` no frontmatter do SKILL.md (Cursor e Kimi os exigem); o resto vai byte a byte. */
export function ensureSkillFrontmatter(content: string, name: string, description: string): string {
  const fm = frontmatterOf(content);
  const missing: string[] = [];
  if (!frontmatterValue(fm, 'name')) missing.push(`name: ${yamlString(name)}`);
  if (!frontmatterValue(fm, 'description')) missing.push(`description: ${yamlString(description || name)}`);
  if (!missing.length) return content;
  if (FRONTMATTER.test(content)) return content.replace(/^---\r?\n/, `---\n${missing.join('\n')}\n`);
  return `---\n${missing.join('\n')}\n---\n\n${content}`;
}

/** `<ferramenta>:<id>@<esforço>` em partes. A ferramenta vem antes do primeiro `:`; sem ela, fica ''. */
export function modelParts(value: string): { tool: AiTool | ''; id: string; effort: string | null } {
  const at = value.indexOf(':');
  const tool = at > 0 ? value.slice(0, at) : '';
  const parsed = parseModelValue(at > 0 ? value.slice(at + 1) : value);
  return { tool, id: parsed?.id ?? '', effort: parsed?.effort ?? null };
}

/** Skills: o SKILL.md e os arquivos de apoio, iguais nas três ferramentas, só muda a pasta. */
/** Grava (ou troca) `allowed-tools` no cabeçalho do SKILL.md, separado por espaço como pede o padrão SKILL.md. */
export function withAllowedTools(content: string, names: readonly string[]): string {
  if (!names.length || !FRONTMATTER.test(content)) return content;
  const line = `allowed-tools: ${names.join(' ')}`;
  const end = content.search(/\r?\n---/);
  const head = content.slice(0, end);
  return /^allowed-tools:.*$/m.test(head)
    ? head.replace(/^allowed-tools:.*$/m, line) + content.slice(end)
    : `${head}\n${line}${content.slice(end)}`;
}

/**
 * As tools neutras da skill ou do agente no nome da ferramenta; `null` quando ela não tem o campo. O agente que veio
 * da mesma ferramenta com a lista exata dela e ainda não foi salvo no formulário novo mantém essa lista.
 */
export function exportedTools(s: ExportSource, tool: AiTool): string[] | null {
  const a = s.artifact;
  const meta = a.kind === 'agent' ? agentMetaOf(s) : undefined;
  if (meta && meta.tools.native.tool === tool && meta.tools.native.allow.length) return meta.tools.native.allow;
  return nativeTools(tool, a.tools ?? [], meta?.mcpServers ?? []);
}

/** A ferramenta não tem `allowed-tools`/`tools`: o campo sai da cópia e a prévia avisa. */
export function neutralToolLosses(s: ExportSource, tool: AiTool): FormatLoss[] {
  const tools = s.artifact.tools ?? [];
  if (!tools.length || supportsToolList(tool)) return [];
  const meta = s.artifact.kind === 'agent' ? agentMetaOf(s) : undefined;
  if (meta?.tools.native.tool === tool) return [];
  return [{ code: 'allowed-tools', effect: 'lost', value: tools.join(' ') }];
}

export function renderSkills(
  root: string,
  sources: ExportSource[],
  allowed?: (s: ExportSource) => string[] | null,
): { files: RenderedFile[]; refused: { id: string; reason: RefuseReason }[] } {
  const files: RenderedFile[] = [];
  const refused: { id: string; reason: RefuseReason }[] = [];
  for (const s of sources) {
    const a = s.artifact;
    if (!isSafeSegment(a.name)) refused.push({ id: a.id, reason: 'unsafe-name' });
    else if (!s.files.every((f) => isSafeRelPath(f.path))) refused.push({ id: a.id, reason: 'unsafe-path' });
    else {
      const dir = `${root}/skills/${a.name}`;
      const md = ensureSkillFrontmatter(s.body, a.name, a.description);
      files.push({ rel: `${dir}/SKILL.md`, data: Buffer.from(withAllowedTools(md, allowed?.(s) ?? [])), from: [a.id] });
      for (const f of s.files)
        files.push({ rel: `${dir}/${f.path}`, data: Buffer.from(f.content, f.encoding === 'base64' ? 'base64' : 'utf8'), from: [a.id] });
    }
  }
  return { files, refused };
}

/** Uma regra por arquivo (Claude e Cursor); a segunda com o mesmo arquivo vira `duplicate`. */
export function renderRuleFiles(
  dir: string,
  ext: string,
  sources: ExportSource[],
  content: (s: ExportSource) => string,
): { files: RenderedFile[]; refused: { id: string; reason: RefuseReason }[] } {
  const files: RenderedFile[] = [];
  const refused: { id: string; reason: RefuseReason }[] = [];
  const seen = new Set<string>();
  for (const s of [...sources].sort((a, b) => a.artifact.name.localeCompare(b.artifact.name))) {
    const rel = `${dir}/${ruleSlug(s.artifact.name)}${ext}`;
    if (seen.has(rel)) refused.push({ id: s.artifact.id, reason: 'duplicate' });
    else {
      seen.add(rel);
      files.push({ rel, data: Buffer.from(content(s)), from: [s.artifact.id] });
    }
  }
  return { files, refused };
}

/** Frontmatter YAML a partir de linhas já formatadas, mais o corpo. */
export const withFrontmatter = (lines: string[], body: string): string =>
  `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s*\n/, '')}${body.endsWith('\n') ? '' : '\n'}`;

/** Perdas iguais nas três ferramentas: modo (skill/agente), agente padrão e arquivos que ficaram de fora. */
export function commonLosses(s: ExportSource): FormatLoss[] {
  const a = s.artifact;
  const out: FormatLoss[] = [];
  if (a.kind === 'skill' || a.kind === 'agent') out.push({ code: 'usage', effect: 'lost', value: a.usage });
  if (a.kind === 'agent' && s.isDefaultAgent) out.push({ code: 'default', effect: 'lost' });
  if (a.skipped.length) out.push({ code: 'skipped-files', effect: 'lost', value: a.skipped.map((f) => f.path).join(', ') });
  return out;
}

/** Perdas do cabeçalho de uma regra que veio de outra ferramenta (o formato de destino tem o próprio). */
export function ruleHeaderLoss(s: ExportSource, tool: AiTool): FormatLoss[] {
  return s.artifact.originTool !== tool && stripFrontmatter(s.body).had ? [{ code: 'rule-header', effect: 'lost' }] : [];
}

const EMPTY_AGENT: AgentMeta = {
  skills: [],
  mcpServers: [],
  model: '',
  tools: { categories: [], native: { tool: '', allow: [], deny: [] } },
};
/** O `meta` do agente, com os campos que faltarem preenchidos. */
export const agentMetaOf = (s: ExportSource): AgentMeta => {
  const m = s.artifact.meta as Partial<AgentMeta>;
  return { ...EMPTY_AGENT, ...m, tools: { ...EMPTY_AGENT.tools, ...m.tools, native: { ...EMPTY_AGENT.tools.native, ...m.tools?.native } } };
};

/** Agente: um arquivo `<root>/agents/<nome>.md`; o cabeçalho vem de cada ferramenta. */
export function renderAgents(
  root: string,
  sources: ExportSource[],
  header: (s: ExportSource, meta: AgentMeta) => string[],
): { files: RenderedFile[]; refused: { id: string; reason: RefuseReason }[] } {
  const files: RenderedFile[] = [];
  const refused: { id: string; reason: RefuseReason }[] = [];
  for (const s of sources) {
    const a = s.artifact;
    if (!isSafeSegment(a.name)) refused.push({ id: a.id, reason: 'unsafe-name' });
    else {
      const lines = [`name: ${yamlString(a.name)}`, `description: ${yamlString(a.description || a.name)}`, ...header(s, agentMetaOf(s))];
      files.push({ rel: `${root}/agents/${a.name}.md`, data: Buffer.from(withFrontmatter(lines, s.body)), from: [a.id] });
    }
  }
  return { files, refused };
}

/**
 * A lista de ferramentas do agente: as tools neutras vão traduzidas quando a ferramenta tem o campo (sem ele, avisa
 * `neutralToolLosses`); a lista nativa de outra ferramenta não é traduzida.
 */
export function toolListLosses(s: ExportSource, tool: AiTool, supported: boolean): FormatLoss[] {
  const { native } = agentMetaOf(s).tools;
  const exported = supported ? exportedTools(s, tool) : null;
  if (!exported?.length) {
    if (s.artifact.tools?.length) return neutralToolLosses(s, tool);
    return native.allow.length || native.deny.length ? [{ code: 'tools', effect: 'lost' }] : [];
  }
  // lista fechada sem as ferramentas do servidor do board: não ampliamos a permissão em silêncio
  return !exported.some((t) => t.startsWith('mcp__faz-ai__'))
    ? [{ code: 'board-tools', effect: 'configure', value: 'mcp__faz-ai__*' }]
    : [];
}

/** Perdas de modelo e esforço: o modelo vai só quando é da ferramenta de destino e o formato tem o campo. */
export function modelLosses(meta: AgentMeta, tool: AiTool, hasModel: boolean, hasEffort: boolean): FormatLoss[] {
  if (!meta.model) return [];
  const m = modelParts(meta.model);
  const out: FormatLoss[] = [];
  if (!hasModel || m.tool !== tool) out.push({ code: 'model', effect: 'lost', value: m.id });
  if (m.effort && (!hasEffort || m.tool !== tool)) out.push({ code: 'effort', effect: 'lost', value: m.effort });
  return out;
}

/** `readonly` e `background` (Cursor) não existem nas outras ferramentas. */
export const flagLosses = (meta: AgentMeta): FormatLoss[] => [
  ...(meta.readonly ? [{ code: 'readonly' as const, effect: 'lost' as const }] : []),
  ...(meta.background ? [{ code: 'background' as const, effect: 'lost' as const }] : []),
];

/** `location` de um caminho relativo à base: o do projeto fica relativo, o do usuário vira `~/…`. */
const locationOf = (target: ExportTarget, rel: string): string => (target === 'user' ? `~/${rel}` : rel);

/** O caminho real está dentro da pasta da ferramenta? Um link que sai dela fica de fora. */
function inside(rootDir: string, file: string): boolean {
  try {
    const real = fs.realpathSync(file);
    const root = fs.realpathSync(rootDir);
    return real === root || real.startsWith(root + path.sep);
  } catch {
    return false;
  }
}

/** Nomes (ordenados) dos filhos de `dir`; pasta ausente ou ilegível dá lista vazia. */
function children(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * O que há na pasta de uma ferramenta, só leitura (#851): regras (arquivos com `ruleExt` em `ruleDir`, mais os
 * `extraRules` soltos na base), skills (`<root>/skills/<nome>/SKILL.md`) e agentes (`<root>/agents/*.md`).
 * Link simbólico que sai da pasta da ferramenta é ignorado; erro de leitura deixa o item fora da lista.
 */
export function listToolFolder(
  root: string,
  target: ExportTarget,
  base: string,
  opts: { ruleDir?: string; ruleExt?: string; extraRules?: string[] },
): ListedSource[] {
  const out: ListedSource[] = [];
  const rootDir = path.join(base, root);
  const add = (kind: ListedSource['kind'], rel: string): void => {
    out.push({ kind, location: locationOf(target, rel), scope: target });
  };
  for (const extra of opts.extraRules ?? []) {
    const file = path.join(base, extra);
    try {
      if (fs.statSync(file).isFile()) add('instructions', extra);
    } catch {
      /* ausente */
    }
  }
  if (opts.ruleDir && opts.ruleExt) {
    for (const e of children(path.join(base, opts.ruleDir))) {
      if (e.name.endsWith(opts.ruleExt) && inside(rootDir, path.join(base, opts.ruleDir, e.name)))
        add('instructions', `${opts.ruleDir}/${e.name}`);
    }
  }
  for (const e of children(path.join(rootDir, 'skills'))) {
    const dir = path.join(rootDir, 'skills', e.name);
    if (!(e.isDirectory() || e.isSymbolicLink()) || !inside(rootDir, dir)) continue;
    if (inside(rootDir, path.join(dir, 'SKILL.md'))) add('skill', `${root}/skills/${e.name}/SKILL.md`);
  }
  for (const e of children(path.join(rootDir, 'agents'))) {
    if (e.name.endsWith('.md') && inside(rootDir, path.join(rootDir, 'agents', e.name))) add('agent', `${root}/agents/${e.name}`);
  }
  return out;
}

/** Os caminhos dos arquivos de MCP: o do projeto fica relativo, o do usuário vira `~/…`. */
export const mcpLocations = (target: ExportTarget, project: string[], user: string[]): string[] =>
  (target === 'user' ? user : project).map((rel) => locationOf(target, rel));
