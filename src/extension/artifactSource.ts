import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARTIFACT_LIMITS, isSafeRelPath, kindOfSelectable, toolCategories, type AgentMeta, type ArtifactDraft } from '../shared/artifacts';
import { aiToolInfo, type AiTool, type HarnessItem } from '../shared/harness';
import { selectionKey, type SelectableKind } from '../shared/harnessSelection';
import { parseAgentFile } from './agentFiles';
import { FLOW_SKILLS } from './flowSkill';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { skillTemplate } from './harness';
import { listSkillFiles, mcpSummary } from './harnessScan';
import { byPath } from './samePath';

/**
 * Leitura de um artefato na origem (pasta da ferramenta, do projeto ou importada) para a cópia no
 * board (#615). Só leitura de disco, sem banco: devolve o rascunho neutro com os limites aplicados, e
 * nunca lança. O que não se lê (ausente, ilegível, JSON inválido, grande demais) vira `missing`, para a
 * marcação da pessoa não se perder.
 *
 * Formatos conferidos na documentação oficial em 2026-10-16: `.mcp.json` e `~/.claude.json`
 * (code.claude.com/docs/en/mcp: `mcpServers`; o escopo local em `projects[<pasta>].mcpServers` vale mais
 * que o do projeto, que vale mais que o do usuário), `.cursor/mcp.json` (cursor.com/docs/context/mcp) e
 * os arquivos de agente (code.claude.com/docs/en/sub-agents, cursor.com/docs/context/subagents).
 */

export interface SourceDirs {
  projectDir: string;
  homeDir: string;
}

/** location → caminho absoluto: relativo ao projeto, `~/…` (home) ou absoluto (pasta importada). */
export function resolveLocation(location: string, dirs: SourceDirs): string {
  if (location === '~') return dirs.homeDir;
  if (location.startsWith('~/')) return path.join(dirs.homeDir, location.slice(2));
  if (path.isAbsolute(location)) return location;
  return path.join(dirs.projectDir, location);
}

type Draft = ArtifactDraft;
type DraftFile = Draft['files'][number];

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const base = (kind: Draft['kind'], name: string, origin: string, tool: AiTool | ''): Draft => ({
  kind,
  name,
  description: '',
  body: '',
  meta: {},
  origin,
  originTool: tool,
  missing: false,
  skipped: [],
  files: [],
});

const missing = (d: Draft, skipped: Draft['skipped'] = []): Draft => ({ ...d, missing: true, skipped });

/** O arquivo principal (regra, SKILL.md, agente) como texto; grande demais ou ilegível vira o motivo. */
function readMain(file: string): { text: string } | { reason: 'size' | 'read' } {
  try {
    if (fs.statSync(file).size > ARTIFACT_LIMITS.fileBytes) return { reason: 'size' };
    return { text: fs.readFileSync(file, 'utf8') };
  } catch {
    return { reason: 'read' };
  }
}

/** Texto quando o conteúdo sobrevive à volta em UTF-8 e não tem `\0`; senão base64 (binário). */
function encode(buf: Buffer): Pick<DraftFile, 'content' | 'encoding'> {
  const text = buf.toString('utf8');
  return !text.includes('\0') && Buffer.from(text, 'utf8').equals(buf)
    ? { content: text, encoding: 'utf8' }
    : { content: buf.toString('base64'), encoding: 'base64' };
}

/**
 * Os arquivos de apoio de uma skill, na ordem alfabética do caminho (o resultado fica previsível), com
 * os limites: acima de 512 KB, além do 100º arquivo ou além de 5 MB no total (contando o SKILL.md)
 * fica de fora, com o motivo; os demais entram.
 */
function supportFiles(dir: string, used: number): Pick<Draft, 'files' | 'skipped'> {
  const files: DraftFile[] = [];
  const skipped: Draft['skipped'] = [];
  let total = used;
  for (const rel of listSkillFiles(dir).sort()) {
    if (!isSafeRelPath(rel)) {
      skipped.push({ path: rel, reason: 'read' });
      continue;
    }
    if (files.length >= ARTIFACT_LIMITS.files) {
      skipped.push({ path: rel, reason: 'count' });
      continue;
    }
    const file = path.join(dir, ...rel.split('/'));
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      skipped.push({ path: rel, reason: 'read' });
      continue;
    }
    if (size > ARTIFACT_LIMITS.fileBytes) {
      skipped.push({ path: rel, reason: 'size' });
      continue;
    }
    if (total + size > ARTIFACT_LIMITS.totalBytes) {
      skipped.push({ path: rel, reason: 'total' });
      continue;
    }
    try {
      const buf = fs.readFileSync(file);
      files.push({ path: rel, ...encode(buf), size: buf.length });
      total += buf.length;
    } catch {
      skipped.push({ path: rel, reason: 'read' });
    }
  }
  return { files, skipped };
}

function readRule(location: string, dirs: SourceDirs, tool: AiTool | ''): Draft {
  const d = base('rule', location, location, tool);
  const file = resolveLocation(location, dirs);
  const main = readMain(file);
  if ('reason' in main) return missing(d, main.reason === 'size' ? [{ path: path.basename(file), reason: 'size' }] : []);
  return { ...d, body: main.text };
}

function readSkill(location: string, dirs: SourceDirs, tool: AiTool | '', useBundledFlow = true): Draft {
  // a location da skill é o SKILL.md; a pasta também vale
  const at = resolveLocation(location, dirs);
  const file = path.basename(at) === 'SKILL.md' ? at : path.join(at, 'SKILL.md');
  const dir = path.dirname(file);
  const name = path.basename(dir);
  const d = base('skill', name, location, tool);
  // a skill do fluxo é da extensão: o board guarda a versão dela, não a que está no disco
  const flow = FLOW_SKILLS.find((k) => k.name === name);
  if (flow && useBundledFlow)
    return { ...d, description: flow.description, body: skillTemplate(flow.name, flow.description, flow.body), meta: { generated: true } };
  const main = readMain(file);
  if ('reason' in main) return missing(d, main.reason === 'size' ? [{ path: 'SKILL.md', reason: 'size' }] : []);
  const description = frontmatterValue(frontmatterOf(main.text), 'description') ?? '';
  return { ...d, description, body: main.text, ...supportFiles(dir, Buffer.byteLength(main.text, 'utf8')) };
}

/** A ferramenta dona da pasta do agente: o formato do arquivo é o dela, não o do board em uso. */
function agentTool(location: string, tool: AiTool | ''): AiTool | '' {
  const p = `/${location.replace(/\\/g, '/')}`;
  if (p.includes('/.cursor/')) return 'cursor';
  if (p.includes('/.kimi-code/')) return 'kimi';
  if (p.includes('/.claude/')) return 'claude';
  return tool;
}

function readAgent(location: string, dirs: SourceDirs, tool: AiTool | ''): Draft {
  const file = resolveLocation(location, dirs);
  const name = path.basename(file).replace(/\.md$/, '');
  const d = base('agent', name, location, tool);
  const main = readMain(file);
  if ('reason' in main) return missing(d, main.reason === 'size' ? [{ path: path.basename(file), reason: 'size' }] : []);
  const owner = agentTool(location, tool);
  const a = parseAgentFile(aiToolInfo(owner || 'claude').agents, { name, scope: 'project', path: file, location }, main.text);
  const meta: AgentMeta = {
    skills: a.skills,
    mcpServers: a.mcp,
    model: a.modelValue,
    tools: { categories: toolCategories(owner, a.tools), native: { tool: owner, allow: a.tools, deny: a.deniedTools } },
    ...(a.seed ? { seed: true } : {}),
    ...(a.readonly ? { readonly: true } : {}),
    ...(a.background ? { background: true } : {}),
  };
  return { ...d, description: a.description, body: a.body, meta };
}

/** JSON de configuração; os das ferramentas aceitam comentários de linha (como lê a varredura). */
function readJson(file: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isClaudeJson = (file: string): boolean => path.basename(file) === '.claude.json';

/**
 * A definição do servidor no arquivo. No `~/.claude.json` vale primeiro a desta pasta de projeto
 * (`projects[<pasta>].mcpServers`), como em `claudeServers` (execution.ts) e no próprio Claude Code.
 */
function serverIn(json: Record<string, unknown>, file: string, name: string, dirs: SourceDirs): Record<string, unknown> | null {
  const local = isClaudeJson(file) ? obj(obj(byPath(obj(json.projects), dirs.projectDir)).mcpServers)[name] : undefined;
  const def = local ?? obj(json.mcpServers)[name];
  return def && typeof def === 'object' && !Array.isArray(def) ? (def as Record<string, unknown>) : null;
}

function readMcp(location: string, dirs: SourceDirs, tool: AiTool | ''): Draft {
  const at = location.lastIndexOf('#');
  const name = at < 0 ? '' : location.slice(at + 1);
  const d = base('mcp', name, location, tool);
  if (!name) return missing(d);
  const file = resolveLocation(location.slice(0, at), dirs);
  const json = readJson(file);
  const server = json && serverIn(json, file, name, dirs);
  if (!server) return missing(d);
  return {
    ...d,
    description: typeof server.description === 'string' && server.description.trim() ? server.description.trim() : mcpSummary(server),
    meta: { server },
  };
}

/** Lê o artefato da origem; nunca lança: origem ausente, ilegível ou com JSON inválido vira `missing: true`. */
export function readSource(
  sel: { kind: SelectableKind; location: string },
  dirs: SourceDirs,
  tool: AiTool | '',
  useBundledFlow = true,
): ArtifactDraft {
  const kind = kindOfSelectable(sel.kind);
  try {
    switch (kind) {
      case 'rule':
        return readRule(sel.location, dirs, tool);
      case 'skill':
        return readSkill(sel.location, dirs, tool, useBundledFlow);
      case 'agent':
        return readAgent(sel.location, dirs, tool);
      case 'mcp':
        return readMcp(sel.location, dirs, tool);
    }
  } catch {
    // erro inesperado (permissão, caminho estranho): a marcação fica, como ausente
  }
  return missing(base(kind, sel.location, sel.location, tool));
}

/** A ferramenta dona do arquivo de servidores MCP, pelo caminho. */
function mcpTool(file: string): AiTool | '' {
  const p = `/${file.replace(/\\/g, '/')}`;
  if (p.includes('/.cursor/')) return 'cursor';
  if (p.includes('/.kimi-code/')) return 'kimi';
  if (p.endsWith('/.mcp.json') || p.endsWith('/.claude.json')) return 'claude';
  return '';
}

/**
 * Definição de um servidor por nome no inventário da ferramenta, para os servidores citados por um
 * agente copiado (P4). Com o mesmo nome em mais de um lugar, vale a precedência do Claude Code: o da
 * pasta no `~/.claude.json`, o do projeto, o do usuário e, por fim, plugins e pastas importadas. Null
 * quando nenhum lugar tem uma definição legível: aí não há o que copiar.
 */
export function readMcpByName(name: string, inventory: HarnessItem[], dirs: SourceDirs): ArtifactDraft | null {
  const rank = (i: HarnessItem): number => {
    if (i.scope === 'project') return 1;
    if (i.scope === 'user') return 2;
    return 3;
  };
  const drafts = inventory
    .filter((i) => i.kind === 'mcp' && i.name === name && i.layout === 'entry')
    .map((i) => {
      const location = selectionKey(i);
      const d = readSource({ kind: 'mcp', location }, dirs, mcpTool(i.path));
      const local = isClaudeJson(i.path) && !!obj(obj(byPath(obj(readJson(i.path)?.projects), dirs.projectDir)).mcpServers)[name];
      return { d, rank: local ? 0 : rank(i) };
    })
    .filter((x) => !x.d.missing)
    .sort((a, b) => a.rank - b.rank);
  return drafts[0]?.d ?? null;
}
