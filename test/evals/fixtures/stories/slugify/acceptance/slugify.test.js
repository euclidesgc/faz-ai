import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/index.js';

test('minúsculas e hífens', () => assert.equal(slugify('Olá Mundo Novo'), 'ola-mundo-novo'));
test('remove acentos', () => assert.equal(slugify('Ação e Coração'), 'acao-e-coracao'));
test('sequências viram um hífen', () => assert.equal(slugify('a  --  b!!c'), 'a-b-c'));
test('sem hífen nas pontas', () => assert.equal(slugify('  --Título--  '), 'titulo'));
test('mantém dígitos', () => assert.equal(slugify('Versão 2.0'), 'versao-2-0'));
test('vazio e só símbolos', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
});
