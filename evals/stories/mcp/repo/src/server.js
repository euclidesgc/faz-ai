import { notes } from './data.js';

// Texto que a IA lê ao conectar: diz quando usar cada ferramenta.
export const INSTRUCTIONS = 'Servidor de notas. Use search_notes antes de add_note, para não duplicar.';

export const tools = [
  {
    name: 'search_notes',
    description: 'Busca notas pelo texto.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    handler: ({ query }) => notes.filter((n) => n.text.toLowerCase().includes(String(query).toLowerCase())),
  },
  {
    name: 'add_note',
    description: 'Acrescenta uma nota.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    handler: ({ text }) => {
      const note = { id: notes.length + 1, text };
      notes.push(note);
      return note;
    },
  },
];

export function listTools() {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export function callTool(name, args = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { isError: true, content: `Ferramenta desconhecida: ${name}` };
  return { isError: false, content: tool.handler(args) };
}
