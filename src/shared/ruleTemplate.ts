// O modelo da "Nova regra" e as contas do painel ao lado (tópicos recomendados e estimativa de tokens). Puro.

/** Os tópicos que uma regra de projeto deve cobrir; o checklist marca os que existem como título no texto. */
export const RULE_TOPICS: readonly string[] = [
  'Contexto do projeto',
  'Stack e versões',
  'Estrutura de pastas',
  'Convenções de código',
  'Testes',
  'Git e commits',
  'Nunca faça',
  'Definição de pronto',
];

const GUIDES: Record<string, string> = {
  'Contexto do projeto': 'O que o projeto é, para quem, e o que a IA precisa saber antes de mexer em qualquer coisa.',
  'Stack e versões': 'Linguagens, frameworks e versões que valem; o que não usar mesmo que pareça mais fácil.',
  'Estrutura de pastas': 'Onde fica cada coisa e onde um arquivo novo deve nascer.',
  'Convenções de código': 'Nomes, formatação, comentários e padrões que o código já segue.',
  Testes: 'Como rodar os testes, o que precisa de teste e quando um teste pode faltar.',
  'Git e commits': 'Branches, mensagens de commit e o que nunca vai para o repositório.',
  'Nunca faça': 'Proibições diretas, uma por linha, no imperativo.',
  'Definição de pronto': 'O que precisa estar verdadeiro para a tarefa ser dada como terminada.',
};

/** O texto que abre no editor de "Nova regra": frontmatter próprio e uma seção por tópico, com a orientação em comentário. */
export function ruleTemplate(slug: string): string {
  return [
    '---',
    `nome: ${slug}`,
    'escopo: sempre',
    'versao: 1',
    '---',
    '# Regras do projeto',
    '',
    ...RULE_TOPICS.flatMap((topic, i) => [`## ${i + 1}. ${topic}`, `<!-- ${GUIDES[topic]} -->`, '']),
  ].join('\n');
}

const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\d+[.)]\s*/, '')
    .trim();

/** Os tópicos que aparecem como título (`#`, `##`, ...) no texto, sem diferenciar acento, caixa ou numeração. */
export function coveredTopics(text: string): Set<string> {
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => plain(m[1]!));
  return new Set(RULE_TOPICS.filter((topic) => headings.some((h) => h.startsWith(plain(topic)))));
}

/** Estimativa de tokens (~4 caracteres por token), a mesma conta simples para todo artefato na tela. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
