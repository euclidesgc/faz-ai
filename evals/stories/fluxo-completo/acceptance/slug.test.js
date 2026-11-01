import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('minúsculas e hífen no lugar do espaço', () => assert.equal(slugify('Olá Mundo'), 'ola-mundo'));
test('remove acentos', () => assert.equal(slugify('Ação e Coração'), 'acao-e-coracao'));
test('só [a-z0-9-]: símbolos viram hífen e dígitos ficam', () => assert.equal(slugify('Versão 2.0 (beta)'), 'versao-2-0-beta'));
test('colapsa hifens repetidos', () => assert.equal(slugify('a  --  b___c'), 'a-b-c'));
test('apara hifens nas pontas', () => assert.equal(slugify('  --Título!--  '), 'titulo'));
test('maxLength corta no tamanho', () => assert.equal(slugify('abcdefghij', 5), 'abcde'));
test('maxLength nunca termina em hífen', () => {
  assert.equal(slugify('ola mundo cruel', 10), 'ola-mundo');
  assert.equal(slugify('abc def', 4), 'abc');
});
test('maxLength maior que o slug devolve o slug inteiro', () => assert.equal(slugify('ola mundo', 50), 'ola-mundo'));
test('texto vazio lança Error', () => {
  assert.throws(() => slugify(''), Error);
  assert.throws(() => slugify('   '), Error);
});
