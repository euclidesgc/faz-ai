import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `baseline/` guarda os arquivos como a IA os recebeu; o aceite compara o que ela entregou com eles.
const aqui = dirname(fileURLToPath(import.meta.url));
const projeto = join(aqui, '..');
const lerAtual = (arquivo) => readFileSync(join(projeto, arquivo), 'utf8');
const lerBase = (arquivo) => readFileSync(join(aqui, 'baseline', arquivo), 'utf8');

const VERSAO = JSON.parse(lerAtual('package.json')).version;
const TITULOS = {
  'CHANGELOG.md': { permitidos: ['Adicionado', 'Alterado', 'Removido', 'Corrigido'], adicionado: 'Adicionado' },
  'CHANGELOG_EN.md': { permitidos: ['Added', 'Changed', 'Removed', 'Fixed'], adicionado: 'Added' },
};
// Nada de implementação nos textos para quem usa o produto.
const IMPLEMENTACAO = /exportCsv|src\/|\.js\b|`|\bfunç(ão|ões)\b|\bfunction\b/i;

/** As linhas não vazias que o arquivo atual tem a mais; as do original precisam continuar, na mesma ordem. */
function linhasNovas(arquivo) {
  const base = lerBase(arquivo).split('\n');
  const atual = lerAtual(arquivo).split('\n');
  const novas = [];
  let i = 0;
  for (const linha of atual) {
    if (i < base.length && linha === base[i]) i++;
    else novas.push(linha);
  }
  assert.equal(i, base.length, `${arquivo}: as linhas que já existiam precisam continuar, na mesma ordem`);
  return novas.filter((l) => l.trim() !== '');
}

for (const [arquivo, { permitidos, adicionado }] of Object.entries(TITULOS)) {
  test(`${arquivo}: só títulos permitidos e a seção do topo é a versão do package.json`, () => {
    const linhas = lerAtual(arquivo).split('\n');
    const subtitulos = linhas.filter((l) => l.startsWith('### ')).map((l) => l.slice(4).trim());
    for (const t of subtitulos) assert.ok(permitidos.includes(t), `título não permitido: ${t}`);
    const versoes = linhas.filter((l) => l.startsWith('## '));
    assert.equal(versoes[0].slice(3).trim(), VERSAO);
  });

  test(`${arquivo}: um item novo na subseção ${adicionado} do topo, com #42, curto e sem implementação`, () => {
    const novas = linhasNovas(arquivo);
    assert.equal(novas.length, 1, `esperava exatamente uma linha nova, veio: ${JSON.stringify(novas)}`);
    const [item] = novas;
    assert.match(item, /^- /, 'o item é de lista');
    assert.ok(item.includes('#42'), 'cita #42');
    assert.match(item, /csv/i);
    assert.ok(item.length <= 160, `até 160 caracteres, tem ${item.length}`);
    assert.ok(!IMPLEMENTACAO.test(item), 'sem nome de arquivo nem de função');

    // em qual subseção da seção do topo o item caiu
    let secoes = 0;
    let sub = null;
    let achou = null;
    for (const linha of lerAtual(arquivo).split('\n')) {
      if (linha.startsWith('## ')) secoes++;
      else if (linha.startsWith('### ')) sub = linha.slice(4).trim();
      if (linha === item) achou = { secao: secoes, sub };
    }
    assert.deepEqual(achou, { secao: 1, sub: adicionado });
  });
}

for (const [arquivo, titulo] of [
  ['README.md', 'Recursos'],
  ['README_EN.md', 'Features'],
]) {
  test(`${arquivo}: exatamente um item novo em ${titulo}, sobre CSV, curto e sem implementação`, () => {
    const novas = linhasNovas(arquivo);
    assert.equal(novas.length, 1, `esperava exatamente uma linha nova, veio: ${JSON.stringify(novas)}`);
    const [item] = novas;
    assert.match(item, /^- /, 'o item é de lista');
    assert.match(item, /csv/i);
    assert.ok(item.split(/\s+/).length <= 60, 'até 60 palavras');
    assert.ok((item.match(/[.!?](\s|$)/g) ?? []).length <= 2, 'de 1 a 2 frases');
    assert.ok(!IMPLEMENTACAO.test(item), 'sem termos de implementação');

    let secao = null;
    let achou = null;
    for (const linha of lerAtual(arquivo).split('\n')) {
      if (linha.startsWith('## ')) secao = linha.slice(3).trim();
      if (linha === item) achou = secao;
    }
    assert.equal(achou, titulo, `o item fica na seção ${titulo}`);
  });
}

test('os demais arquivos ficam byte a byte iguais', () => {
  for (const arquivo of ['package.json', 'src/export.js', 'docs/export.md']) {
    assert.equal(lerAtual(arquivo), lerBase(arquivo), `${arquivo} não podia mudar`);
  }
});
