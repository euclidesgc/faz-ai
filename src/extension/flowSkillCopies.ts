import * as fs from 'node:fs';
import * as path from 'node:path';
import { FLOW_SKILL_NAMES } from './flowSkill';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { TOOL_ADAPTERS } from './toolAdapters';

/** Bytes do começo de cada agente lidos à procura da marca: o cabeçalho é curto, não o corpo inteiro. */
const HEADER_BYTES = 4096;

/**
 * As cópias antigas que versões anteriores gravaram nas pastas das ferramentas, no projeto e no usuário:
 * as skills do fluxo (`FLOW_SKILL_NAMES`, #851, #1115) e os agentes de fábrica, marcados com
 * `faz-ai-seed: true` no cabeçalho (#1115). O fluxo e os agentes agora vêm do board; a cópia em disco só
 * confunde, porque a ferramenta a carrega nas sessões que não são do board. Só leitura: o board avisa no
 * Diagnóstico e nunca apaga o arquivo. Agente sem a marca é da pessoa e fica de fora. Devolve os caminhos
 * que existem, sem repetir, projeto antes do usuário.
 */
export function findFlowSkillCopies(dirs: { projectDir: string; homeDir: string }): string[] {
  const found: string[] = [];
  const add = (file: string): void => {
    if (!found.includes(file)) found.push(file);
  };
  for (const base of [dirs.projectDir, dirs.homeDir]) {
    if (!base) continue;
    for (const adapter of Object.values(TOOL_ADAPTERS)) {
      if (!adapter) continue;
      for (const name of FLOW_SKILL_NAMES) {
        const file = path.join(base, ...adapter.skillDir(name).split('/'), 'SKILL.md');
        if (isFile(file)) add(file);
      }
      for (const file of seedAgentFiles(path.join(base, adapter.root, 'agents'))) add(file);
    }
  }
  return found;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    // sem a pasta ou sem permissão: não há cópia a avisar
    return false;
  }
}

/** Os `*.md` de uma pasta de agentes com `faz-ai-seed: true` no cabeçalho, em ordem de nome. */
function seedAgentFiles(dir: string): string[] {
  let names: string[];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.md'))
      .sort();
  } catch {
    // sem a pasta de agentes ou sem permissão: não há cópia a avisar
    return [];
  }
  return names.map((n) => path.join(dir, n)).filter(hasSeedHeader);
}

function hasSeedHeader(file: string): boolean {
  let head: string;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(HEADER_BYTES);
      head = buf.subarray(0, fs.readSync(fd, buf, 0, HEADER_BYTES, 0)).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // pasta no lugar de arquivo, sem permissão ou sumiu: não é cópia do board
    return false;
  }
  return frontmatterValue(frontmatterOf(head), 'faz-ai-seed') === 'true';
}
