import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLOW_SKILLS } from '../src/extension/flowSkill';
import { MCP_INSTRUCTIONS } from '../src/extension/mcp/server';

// RF28 (#622, história #880): nada do que a IA lê cita "Verificar ambiente"/Diagnóstico como
// requisito de servidor MCP registrado na ferramenta, de skill instalada nela ou de permissão no
// arquivo dela. As notas do get_card são literais dentro de funções de format.ts e as descrições do
// get_harness ficam em chamadas de harness.ts: os dois arquivos entram pelo texto-fonte inteiro.
const FORMAT_TS = fs.readFileSync(path.join(__dirname, '../src/extension/mcp/format.ts'), 'utf8');
const HARNESS_TS = fs.readFileSync(path.join(__dirname, '../src/extension/mcp/tools/harness.ts'), 'utf8');

const TEXTS: Array<[string, string]> = [
  ...FLOW_SKILLS.map((k): [string, string] => [`skill do fluxo "${k.name}"`, `${k.description}\n${k.body}`]),
  ['instruções do servidor MCP', MCP_INSTRUCTIONS],
  ['notas do get_card (format.ts)', FORMAT_TS],
  ['descrições do get_harness (harness.ts)', HARNESS_TS],
];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/verificar ambiente/i, '"Verificar ambiente"'],
  [/diagn[óo]stico/i, '"Diagnóstico"'],
  [/registr\w*\s+(o|um)\s+(servidor\s+)?MCP\b/i, 'mandar registrar o servidor MCP na ferramenta'],
  [/instal\w*\s+(a|as|uma)\s+skills?\b/i, 'mandar instalar a skill na ferramenta'],
  [/(dê|dar|conced\w+|liber\w+)\s+(a\s+)?permiss/i, 'mandar dar permissão na ferramenta'],
];

describe('o que a IA lê não cita o Diagnóstico como requisito (RF28)', () => {
  it('skills do fluxo, instruções do MCP, notas do get_card e descrições do get_harness sem a citação', () => {
    const found: string[] = [];
    for (const [where, text] of TEXTS)
      for (const [pattern, label] of FORBIDDEN) if (pattern.test(text)) found.push(`${where}: ${label}`);
    expect(found).toEqual([]);
  });
});
