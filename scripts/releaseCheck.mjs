// Módulo puro de conferência dos arquivos de vitrine do pacote publicado.
//
// Nenhuma função aqui toca em disco, rede ou zip: recebem texto e devolvem a lista de problemas.
// É o `release.mjs` quem lê o disco e o zip e passa o conteúdo já normalizado para cá.

// Os quatro arquivos de vitrine: o nome no repositório, o tipo, o título de "não lançado" do
// idioma (changelog) e os blocos de aviso que o README precisa ter (readme).
export const SHOWCASE = [
  { file: 'CHANGELOG.md', kind: 'changelog', unreleased: 'Não lançado' },
  { file: 'CHANGELOG_EN.md', kind: 'changelog', unreleased: 'Unreleased' },
  {
    file: 'README.md',
    kind: 'readme',
    blocks: [
      { name: 'aviso de fase alpha', marker: '⚠️ **O Faz AI está em fase alpha.**' },
      { name: 'agradecimento', marker: '**Obrigado a quem está baixando e testando.**' },
    ],
  },
  {
    file: 'README_EN.md',
    kind: 'readme',
    blocks: [
      { name: 'alpha notice', marker: '⚠️ **Faz AI is in alpha.**' },
      { name: 'thank you', marker: '**Thank you to everyone downloading and trying it out.**' },
    ],
  },
];

// Troca só a PRIMEIRA ocorrência de "## <heading>" por "## <version>".
export function renameUnreleased(text, heading, version) {
  const needle = `## ${heading}`;
  const index = text.indexOf(needle);
  if (index === -1) {
    return { text, renamed: false };
  }
  const replaced = text.slice(0, index) + `## ${version}` + text.slice(index + needle.length);
  return { text: replaced, renamed: true };
}

// Título da primeira linha que começa com "## ", ou null quando não há nenhuma.
export function firstSection(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('## ')) {
      return line.slice(3).trim();
    }
  }
  return null;
}

// Problemas de um changelog: primeira seção diferente da versão que está saindo, e qualquer
// título de "não lançado" (em qualquer idioma) sobrando em qualquer lugar do texto.
export function changelogProblems(file, text, version) {
  const problems = [];
  const first = firstSection(text);
  if (first === null) {
    problems.push(`${file}: não tem nenhuma seção, e a primeira deveria ser "${version}"`);
  } else if (first !== version) {
    problems.push(`${file}: a primeira seção é "${first}", e deveria ser "${version}"`);
  }

  const headings = SHOWCASE.filter((entry) => entry.kind === 'changelog').map((entry) => `## ${entry.unreleased}`);
  text.split('\n').forEach((line, index) => {
    if (headings.includes(line.trim())) {
      problems.push(`${file}: sobrou o título "${line.trim()}" na linha ${index + 1}`);
    }
  });

  return problems;
}

// Problemas de um README: bloco de aviso ausente, nomeando o bloco e o arquivo.
export function readmeProblems(file, text, blocks) {
  const problems = [];
  for (const block of blocks) {
    if (!text.includes(block.marker)) {
      problems.push(
        `${file}: falta o bloco "${block.name}" (atualize a tabela SHOWCASE em scripts/releaseCheck.mjs se o texto do bloco mudou de propósito)`,
      );
    }
  }
  return problems;
}

// Junta a conferência dos quatro arquivos de vitrine. `contents` é um objeto
// `{ 'CHANGELOG.md': '...', ... }` já normalizado pelo chamador; arquivo ausente é acusado aqui.
export function packageProblems(contents, version) {
  const problems = [];
  for (const entry of SHOWCASE) {
    const text = contents[entry.file];
    if (text === undefined) {
      problems.push(`${entry.file}: arquivo ausente no pacote`);
      continue;
    }
    if (entry.kind === 'changelog') {
      problems.push(...changelogProblems(entry.file, text, version));
    } else {
      problems.push(...readmeProblems(entry.file, text, entry.blocks));
    }
  }
  return problems;
}
