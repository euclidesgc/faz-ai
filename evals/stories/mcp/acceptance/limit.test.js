import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTIONS, callTool, listTools } from '../src/server.js';

const search = () => listTools().find((t) => t.name === 'search_notes');

test('o inputSchema de search_notes declara limit inteiro com mínimo 1 e máximo 50', () => {
  const limit = search().inputSchema.properties.limit;
  assert.ok(limit, 'esperava a propriedade limit');
  assert.equal(limit.type, 'integer');
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 50);
});

test('limit é opcional: query continua sendo o único obrigatório', () => {
  assert.deepEqual(search().inputSchema.required, ['query']);
});

test('sem limit devolve todos os resultados (até 10)', () => {
  const r = callTool('search_notes', { query: 'a' });
  assert.equal(r.isError, false);
  assert.equal(r.content.length, 4);
});

test('limit trunca o resultado, mantendo a ordem', () => {
  const r = callTool('search_notes', { query: 'pão', limit: 1 });
  assert.equal(r.isError, false);
  assert.deepEqual(
    r.content.map((n) => n.id),
    [1],
  );
});

test('limit maior que o total devolve tudo', () => {
  const r = callTool('search_notes', { query: 'pão', limit: 50 });
  assert.equal(r.content.length, 2);
});

test('limit inválido responde isError com "limit inválido"', () => {
  for (const limit of [0, -1, 51, 1.5, '3', null]) {
    const r = callTool('search_notes', { query: 'pão', limit });
    assert.deepEqual(r, { isError: true, content: 'limit inválido' }, `limit=${JSON.stringify(limit)}`);
  }
});

test('INSTRUCTIONS cita limit e mantém a frase original', () => {
  assert.match(INSTRUCTIONS, /\blimit\b/);
  assert.ok(INSTRUCTIONS.includes('Use search_notes antes de add_note'));
});

test('add_note continua funcionando', () => {
  const r = callTool('add_note', { text: 'Nova nota' });
  assert.equal(r.isError, false);
  assert.equal(r.content.text, 'Nova nota');
});
