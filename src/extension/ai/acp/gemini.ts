// Provider ACP do Gemini CLI (`gemini --acp`, geminicli.com/docs/cli/acp-mode, lido em 2026-10-18).
// PROTÓTIPO: não está no registro de `ai/providers/` nem em `AiTool`, e nada no board o chama ainda.
// Não foi conferido contra a CLI instalada — o que segue é o que a documentação diz e o que falta ver:
//
// - a página documenta os métodos `initialize`, `authenticate`, `newSession`, `loadSession`,
//   `prompt`, `cancel`, `setSessionMode` e `unstable_setSessionModel`;
// - sobre MCP, a página diz que o cliente informa o seu servidor "no `initialize`", enquanto o
//   protocolo põe `mcpServers` no `session/new` (e é lá que o board manda). Conferir com a CLI real
//   qual vale antes de produção;
// - o Gemini CLI foi substituído pelo Antigravity CLI para o nível gratuito e o Google One em
//   2026-06-18: quem não paga o Gemini não tem esta CLI;
// - os ids de modo abaixo (`yolo`) e o formato do título das ferramentas MCP também são a conferir.
import type { AcpProvider } from './provider';

/** `ferramenta (servidor MCP Server)`: o nome de exibição que o Gemini CLI dá às ferramentas MCP. */
const MCP_TITLE = /^(.+?) \((.+?) MCP Server\)/;

export const geminiAcpProvider: AcpProvider = {
  tool: 'gemini',
  label: 'Gemini CLI',
  // o protocolo só promete o custo (opcional) e o rascunho dos tokens: "tokens" é a menor promessa
  measure: 'tokens',
  command: ({ exec }) => ({
    command: 'gemini',
    args: ['--acp', ...(exec?.model ? ['--model', exec.model.name] : [])],
  }),
  // "Sem restrições" dispensa as perguntas; nos outros níveis o board responde a cada uma pela regra
  modeFor: (permission) => (permission === 'full' ? 'yolo' : null),
  mcpToolOf: (call) => {
    const m = call.title ? MCP_TITLE.exec(call.title) : null;
    return m ? { server: m[2]!, tool: m[1]! } : null;
  },
};
