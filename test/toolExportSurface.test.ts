import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toolDefinitions } from '../src/extension/mcp/tools';

describe('o export não tem superfície para a IA nem para a CLI (RF01)', () => {
  it('nenhuma ferramenta MCP tem "export" no nome', () => {
    expect(toolDefinitions().filter((t) => /export/i.test(t.name))).toEqual([]);
  });

  it('a ajuda da CLI não cita o comando', () => {
    const help = /const HELP = `([\s\S]*?)`;/.exec(fs.readFileSync(path.resolve(__dirname, '../src/cli/cli.ts'), 'utf8'))?.[1] ?? '';
    expect(help).toContain('Uso: faz-ai');
    expect(help).not.toMatch(/export/i);
  });
});
