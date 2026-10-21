import * as fs from 'node:fs';
import * as path from 'node:path';
import { FLOW_SKILL_NAME } from '../shared/harnessProject';
import { TOOL_ADAPTERS } from './toolAdapters';

/**
 * As cópias antigas da skill do fluxo (`faz-ai-fluxo`) que versões anteriores instalaram nas pastas das
 * ferramentas, no projeto e no usuário (#851). O fluxo agora vem do board; a cópia em disco só confunde,
 * porque a ferramenta a carrega nas sessões que não são do board. Só leitura: o board avisa no
 * Diagnóstico e nunca apaga o arquivo. Devolve os caminhos que existem, projeto antes do usuário.
 */
export function findFlowSkillCopies(dirs: { projectDir: string; homeDir: string }): string[] {
  const found: string[] = [];
  for (const base of [dirs.projectDir, dirs.homeDir]) {
    if (!base) continue;
    for (const adapter of Object.values(TOOL_ADAPTERS)) {
      if (!adapter) continue;
      const file = path.join(base, ...adapter.skillDir(FLOW_SKILL_NAME).split('/'), 'SKILL.md');
      try {
        if (fs.statSync(file).isFile() && !found.includes(file)) found.push(file);
      } catch {
        // sem a pasta ou sem permissão: não há cópia a avisar
      }
    }
  }
  return found;
}
