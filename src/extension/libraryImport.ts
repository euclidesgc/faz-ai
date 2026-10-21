import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_AI_BASES, type AiTool } from '../shared/harness';
import type { ArtifactDraft } from '../shared/artifacts';
import { readSource } from './artifactSource';
import { scanInventory } from './harnessScan';
import { selectionKey } from '../shared/harnessSelection';

/** Reconhece coleções neutras e formatos de origem sem vincular a biblioteca a uma ferramenta. */
export function scanLibraryFolder(root: string): ArtifactDraft[] {
  if (!path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new Error('Informe o caminho completo de uma pasta.');
  const found = new Map<string, ArtifactDraft>();
  const add = (kind: 'instructions' | 'skill' | 'agent' | 'mcp', location: string, tool: AiTool) => {
    const file = location.split('#')[0]!;
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return;
    }
    const key = `${kind}:${location}`;
    if (found.has(key)) return;
    const draft = readSource({ kind, location }, { projectDir: root, homeDir: '' }, tool, false);
    if (draft.kind === 'rule') draft.name = path.basename(file);
    if (!draft.missing && draft.name !== 'faz-ai') found.set(key, draft);
  };
  for (const tool of ALL_AI_BASES)
    for (const item of scanInventory(tool, '', '', '', [], [root]))
      if (['instructions', 'skill', 'agent', 'mcp'].includes(item.kind))
        add(item.kind as 'instructions' | 'skill' | 'agent' | 'mcp', selectionKey(item), tool);
  let visited = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || ++visited > 4000) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
      add('skill', path.join(dir, 'SKILL.md'), 'claude');
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'build', 'vendor', '.git', '.cache'].includes(entry.name)) walk(file, depth + 1);
      } else if (entry.isFile()) {
        const parts = path.relative(root, file).split(path.sep);
        if (/\.(md|mdc)$/i.test(entry.name)) {
          if (parts.some((p) => ['agents', 'subagents', 'sub-agents'].includes(p))) add('agent', file, 'claude');
          else if (parts.includes('rules') || /^(AGENTS|CLAUDE|GEMINI)\.md$/i.test(entry.name)) add('instructions', file, 'claude');
        } else if (/^(\.?mcp|mcp-servers)\.json$/i.test(entry.name) && fs.statSync(file).size < 2 * 1024 * 1024) {
          try {
            const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> };
            for (const name of Object.keys(json.mcpServers ?? {})) add('mcp', `${file}#${name}`, 'claude');
          } catch {
            /* Um JSON inválido não impede a descoberta dos demais arquivos. */
          }
        }
      }
    }
  };
  walk(root, 0);
  return [...found.values()];
}
