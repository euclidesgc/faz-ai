// Servidor MCP de teste (stdio, sem dependências): expõe a ferramenta
// `codigo_secreto`, que devolve um valor que só quem tem acesso ao servidor consegue saber.
import readline from 'node:readline';

const SEGREDO = 'MCP-OK-7429';

const TOOLS = [
  {
    name: 'codigo_secreto',
    description: 'Devolve o código secreto de teste.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-segredo', version: '1.0.0' },
    });
  } else if (method === 'ping') {
    reply(id, {});
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
  } else if (method === 'tools/call' && params?.name === 'codigo_secreto') {
    reply(id, { content: [{ type: 'text', text: SEGREDO }] });
  } else if (id !== undefined) {
    reply(id, {});
  }
});
