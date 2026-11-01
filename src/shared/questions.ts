import { norm } from './filters';
import type { CardQuestion } from './model';

/** Título de dado, fixo em português, para a seção de respostas da descrição. */
export const QA_HEADING = 'Perguntas e respostas';
export type QuestionInput = Omit<CardQuestion, 'id'>;
export type QuestionAnswer = { kind: 'option'; text: string } | { kind: 'custom'; text: string } | { kind: 'none' } | { kind: 'auto' };

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
export const sameQuestion = (a: string, b: string): boolean => norm(oneLine(a)) === norm(oneLine(b));

export function cleanQuestions(questions: QuestionInput[]): QuestionInput[] {
  return questions.map((q) => ({
    question: oneLine(q.question),
    options: q.options.map(oneLine),
    recommended: oneLine(q.recommended),
  }));
}

/** Devolve apenas o primeiro problema, com a ordem e o texto esperados pelo MCP. */
export function questionsProblem(questions: QuestionInput[]): string | null {
  if (!questions.length) return 'Informe pelo menos uma pergunta.';
  const cleaned = cleanQuestions(questions);
  const seen = new Set<string>();
  for (const [index, q] of cleaned.entries()) {
    const n = index + 1;
    if (!q.question) return `A pergunta ${n} está vazia.`;
    const label = `A pergunta ${n} ("${q.question}")`;
    if (q.options.length < 2 || q.options.some((o) => !o)) return `${label} precisa de pelo menos duas opções.`;
    if (new Set(q.options.map((o) => norm(o))).size !== q.options.length) return `${label} tem opções repetidas.`;
    if (!q.options.includes(q.recommended))
      return `A indicada da pergunta ${n} ("${q.question}") não está entre as opções: use o texto exato de uma delas.`;
    const key = norm(q.question);
    if (seen.has(key)) return `A pergunta "${q.question}" aparece duas vezes nesta rodada.`;
    seen.add(key);
  }
  return null;
}

/** JSON inválido ou parcial não derruba o snapshot. */
export function parseQuestions(json: string): CardQuestion[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    if (
      !value.every(
        (q) =>
          q &&
          typeof q === 'object' &&
          typeof q.id === 'string' &&
          q.id.length > 0 &&
          typeof q.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.every((o: unknown) => typeof o === 'string') &&
          typeof q.recommended === 'string',
      )
    )
      return [];
    const questions = value as CardQuestion[];
    if (questions.length && (questionsProblem(questions) || new Set(questions.map((q) => q.id)).size !== questions.length)) return [];
    return questions;
  } catch {
    return [];
  }
}

/** Monta uma entrada legível e reaproveitável para a seção da descrição. */
export function answerEntry(q: QuestionInput, answer: QuestionAnswer): { question: string; markdown: string } {
  const cleaned = cleanQuestions([q])[0]!;
  const options = cleaned.options.map((o) => (o === cleaned.recommended ? `${o} (indicada)` : o)).join(' · ');
  const response =
    answer.kind === 'none'
      ? '**Resposta:** não respondida'
      : answer.kind === 'auto'
        ? `**Resposta:** ${cleaned.recommended} (decidido pela IA no modo autônomo)`
        : answer.kind === 'custom'
          ? `**Resposta (personalizada):** ${oneLine(answer.text)}`
          : `**Resposta:** ${oneLine(answer.text)}${oneLine(answer.text) === cleaned.recommended ? ' (a indicada)' : ''}`;
  return { question: cleaned.question, markdown: `### ${cleaned.question}\nOpções: ${options}\n${response}` };
}

/** Substitui só as entradas correspondentes, sem alterar o texto antes ou depois da seção. */
export function applyAnswers(description: string, entries: { question: string; markdown: string }[]): string {
  if (!entries.length) return description;
  const withBlank = (prefix: string, next: string) =>
    `${prefix}${prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n'}${next}`;
  const lines = description.split('\n');
  const heading = lines.findIndex((line) => /^##\s+/.test(line) && sameQuestion(line.replace(/^##\s+/, ''), QA_HEADING));
  if (heading < 0) {
    const section = `## ${QA_HEADING}\n\n${entries.map((e) => e.markdown.trim()).join('\n\n')}`;
    return description ? withBlank(description, section) : section;
  }
  let end = heading + 1;
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end]!)) end++;
  const section = lines.slice(heading + 1, end);
  const starts = section.flatMap((line, i) => (/^###\s+/.test(line) ? [i] : []));
  const intro = section.slice(0, starts[0] ?? section.length).join('\n');
  const blocks = starts.map((start, i) =>
    section
      .slice(start, starts[i + 1] ?? section.length)
      .join('\n')
      .trim(),
  );
  for (const entry of entries) {
    const index = blocks.findIndex((block) => sameQuestion(block.split('\n')[0]!.replace(/^###\s+/, ''), entry.question));
    if (index < 0) blocks.push(entry.markdown.trim());
    else blocks[index] = entry.markdown.trim();
  }
  const headerAndIntro = `${lines[heading]!}${intro ? `\n${intro}` : ''}`;
  const updated = withBlank(headerAndIntro, blocks.join('\n\n'));
  const before = heading ? `${lines.slice(0, heading).join('\n')}\n` : '';
  const after = lines.slice(end).join('\n');
  return `${before}${after ? withBlank(updated, after) : updated}`;
}
