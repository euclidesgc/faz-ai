import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskList } from '../src/taskList.js';

const tasks = [
  { id: 'a1', title: 'Comprar pão', done: false },
  { id: 'b2', title: 'Pagar conta', done: true },
];

// Os itens (<li ...>) da lista, sem depender de espaços entre os atributos.
const items = (html) => html.match(/<li\b[^>]*>/g) ?? [];
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const classes = (tag) => (attr(tag, 'class') ?? '').split(/\s+/);

test('a lista é um <ul class="task-list" role="list">', () => {
  const html = renderTaskList(tasks);
  const ul = /<ul\b[^>]*>/.exec(html)?.[0];
  assert.ok(ul, 'esperava um <ul>');
  assert.equal(attr(ul, 'class'), 'task-list');
  assert.equal(attr(ul, 'role'), 'list');
  assert.ok(html.trimEnd().endsWith('</ul>'));
});

test('um <li> por tarefa, com data-id e data-done', () => {
  const lis = items(renderTaskList(tasks));
  assert.equal(lis.length, 2);
  assert.equal(attr(lis[0], 'data-id'), 'a1');
  assert.equal(attr(lis[0], 'data-done'), 'false');
  assert.equal(attr(lis[1], 'data-id'), 'b2');
  assert.equal(attr(lis[1], 'data-done'), 'true');
});

test('o título aparece dentro do item', () => {
  const html = renderTaskList(tasks);
  assert.match(html, /Comprar pão/);
  assert.match(html, /Pagar conta/);
});

test('só a tarefa concluída tem aria-checked="true" e a classe task--done', () => {
  const [aberta, feita] = items(renderTaskList(tasks));
  assert.equal(attr(feita, 'aria-checked'), 'true');
  assert.ok(classes(feita).includes('task--done'));
  assert.ok(classes(feita).includes('task'));
  assert.equal(attr(aberta, 'aria-checked'), undefined);
  assert.ok(classes(aberta).includes('task'));
  assert.ok(!classes(aberta).includes('task--done'));
});

test('escapa o título: <script> e & não passam crus', () => {
  const html = renderTaskList([{ id: 'x', title: '<script>alert(1)</script> & cia', done: false }]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp; cia'));
});

test('lista vazia devolve <p class="empty">Nenhuma tarefa</p>', () => {
  const html = renderTaskList([]);
  const p = /<p\b[^>]*>/.exec(html)?.[0];
  assert.ok(p, 'esperava um <p>');
  assert.equal(attr(p, 'class'), 'empty');
  assert.match(html, /Nenhuma tarefa<\/p>/);
  assert.ok(!html.includes('<ul'));
});

test('não altera o array recebido', () => {
  const copia = JSON.parse(JSON.stringify(tasks));
  renderTaskList(tasks);
  assert.deepEqual(tasks, copia);
});
