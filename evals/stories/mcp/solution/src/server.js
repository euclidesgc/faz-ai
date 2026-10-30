import { notes } from './data.js';

// Texto que a IA lê ao conectar: diz quando usar cada ferramenta.
export const INSTRUCTIONS =
  'Servidor de notas. Use search_notes antes de add_note, para não duplicar. search_notes devolve 10 resultados por padrão; passe limit (1 a 50) para mudar.';

const DEFAULT_LIMIT = 10;

export const tools = [
  {
    name: 'search_notes',
    description: 'Busca notas pelo texto.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    },
    handler: ({ query, limit }) => {
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
        return { isError: true, content: 'limit inválido' };
      }
      const found = notes.filter((n) => n.text.toLowerCase().includes(String(query).toLowerCase()));
      return found.slice(0, limit ?? DEFAULT_LIMIT);
    },
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
  const result = tool.handler(args);
  // o handler sinaliza erro devolvendo { isError: true, content }
  if (result && result.isError === true) return result;
  return { isError: false, content: result };
}
