import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../src/migrate.js';
import { addNote, addTag } from '../src/notes.js';
import { createStore, load, serialize } from '../src/store.js';

const v1 = () => ({ version: 1, notes: [{ id: '1', title: 'Pão', done: false }] });

test('migrate converte v1 em v2 com tags vazias', () => {
  const v2 = migrate(v1());
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.notes, [{ id: '1', title: 'Pão', done: false, tags: [] }]);
});

test('migrate é idempotente', () => {
  const uma = migrate(v1());
  const duas = migrate(uma);
  assert.deepEqual(duas, uma);
});

test('migrate recusa versão desconhecida', () => {
  assert.throws(() => migrate({ version: 99, notes: [] }), { message: 'Versão não suportada: 99' });
});

test('load migra sozinho dados antigos', () => {
  const store = load(JSON.stringify(v1()));
  assert.equal(store.version, 2);
  assert.deepEqual(store.notes[0].tags, []);
});

test('o formato novo faz ida e volta', () => {
  const store = createStore();
  addNote(store, 'Ler');
  addTag(store, '1', 'Estudo');
  const volta = load(serialize(store));
  assert.equal(volta.version, 2);
  assert.deepEqual(volta.notes[0].tags, ['estudo']);
});

test('addNote já cria a nota com tags vazias', () => {
  const store = createStore();
  assert.deepEqual(addNote(store, 'Nova').tags, []);
});

test('addTag normaliza com trim e minúsculas', () => {
  const store = createStore();
  addNote(store, 'x');
  addTag(store, '1', '  Casa ');
  assert.deepEqual(store.notes[0].tags, ['casa']);
});

test('addTag ignora etiqueta repetida', () => {
  const store = createStore();
  addNote(store, 'x');
  addTag(store, '1', 'casa');
  addTag(store, '1', ' CASA');
  assert.deepEqual(store.notes[0].tags, ['casa']);
});

test('addTag aceita até 5 e recusa a sexta', () => {
  const store = createStore();
  addNote(store, 'x');
  for (const t of ['a', 'b', 'c', 'd', 'e']) addTag(store, '1', t);
  assert.throws(() => addTag(store, '1', 'f'), { message: 'Limite de 5 etiquetas' });
  assert.equal(store.notes[0].tags.length, 5);
});

test('addTag recusa etiqueta vazia', () => {
  const store = createStore();
  addNote(store, 'x');
  assert.throws(() => addTag(store, '1', '   '), Error);
  assert.deepEqual(store.notes[0].tags, []);
});
