// Provider do Kimi Code (`kimi -p`), conferido contra a CLI 2.1.1 (2026-10-13):
// - o prompt é obrigatório como valor do `-p` (a CLI não o lê da entrada padrão: `-p` sem valor e
//   `-p ""` são recusados). No Windows, se a CLI for um shim `.cmd` do npm, o cmd.exe corta a linha
//   em 8191 caracteres — o risco existe e não há flag alternativa; o instalador nativo não o tem;
// - em `-p` a permissão é sempre "auto" (nada é perguntado) e não há flag para estreitar: o nível do
//   board chega ao modelo pelo PERMISSION_ADVICE, no prompt;
// - não há `--mcp-config`: o servidor do board vai para o `.kimi-code/mcp.json` do projeto,
//   materializado antes da execução (como o Cursor);
// - não há `--agents`: o agente do card vai como orientação no prompt (EXEC_ENFORCEMENT o marca
//   "orientado" para o Kimi). `--agent <nome>` existe, mas aceita só agentes já instalados nas pastas
//   da CLI — um nome do board que não esteja lá derruba a execução;
// - o nível de esforço não tem flag: só o modelo vai por `-m`.
import type { AiProvider } from '../provider';
import { kimiReader } from '../../aiOutput/kimi';
import { textReader } from '../../aiOutput/text';

export const kimiProvider: AiProvider = {
  tool: 'kimi',
  // a CLI 2.1.1 não informa custo nem tokens no stream-json; "tokens" é o que resta de menor promessa
  measure: 'tokens',
  command: ({ prompt, addDirs = [], exec, boardServer, structured }) => ({
    command: 'kimi',
    args: [
      '-p',
      prompt,
      ...(structured ? ['--output-format', 'stream-json'] : []),
      ...addDirs.flatMap((d) => ['--add-dir', d]),
      ...(exec?.model ? ['-m', exec.model.name] : []),
    ],
    format: structured ? 'kimi-stream-json' : 'text',
    // o Kimi Code não recebe servidores pela linha de comando: o do board vai para o
    // .kimi-code/mcp.json do projeto, sem o campo `type` (a CLI documenta a entrada stdio sem ele)
    ...(boardServer ? { projectMcp: { file: '.kimi-code/mcp.json', entry: boardServer, stdioType: false } } : {}),
  }),
  reader: (format) => (format === 'kimi-stream-json' ? kimiReader() : textReader()),
};
