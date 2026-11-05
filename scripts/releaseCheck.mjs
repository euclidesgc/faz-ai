// Módulo puro de conferência dos arquivos de vitrine do pacote publicado.
//
// Nenhuma função aqui toca em disco, rede ou zip: recebem texto e devolvem a lista de problemas.
// É o `release.mjs` quem lê o disco e o zip e passa o conteúdo já normalizado para cá.

// Os dois arquivos de vitrine (o README em cada idioma): o nome no repositório e os blocos de aviso
// que cada um precisa ter. O projeto não mantém changelog: o README é a única vitrine.
export const SHOWCASE = [
  {
    file: 'README.md',
    blocks: [
      { name: 'aviso de fase alpha', marker: '⚠️ **O Faz AI está em fase alpha.**' },
      { name: 'agradecimento', marker: '**Obrigado a quem está baixando e testando.**' },
    ],
  },
  {
    file: 'README_EN.md',
    blocks: [
      { name: 'alpha notice', marker: '⚠️ **Faz AI is in alpha.**' },
      { name: 'thank you', marker: '**Thank you to everyone downloading and trying it out.**' },
    ],
  },
];

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

// Junta a conferência dos arquivos de vitrine. `contents` é um objeto
// `{ 'README.md': '...', ... }` já normalizado pelo chamador; arquivo ausente é acusado aqui.
export function packageProblems(contents) {
  const problems = [];
  for (const entry of SHOWCASE) {
    const text = contents[entry.file];
    if (text === undefined) {
      problems.push(`${entry.file}: arquivo ausente no pacote`);
      continue;
    }
    problems.push(...readmeProblems(entry.file, text, entry.blocks));
  }
  return problems;
}
