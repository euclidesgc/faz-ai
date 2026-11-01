import { describe, expect, it } from 'vitest';
import {
  answerEntry,
  applyAnswers,
  cleanQuestions,
  parseQuestions,
  questionsProblem,
  sameQuestion,
  type QuestionInput,
} from '../src/shared/questions';

const question: QuestionInput = {
  question: 'Qual banco usar para o cache?',
  options: ['Redis', 'SQLite', 'Memória'],
  recommended: 'SQLite',
};

describe('perguntas com opções', () => {
  it('compara o texto sem distinguir espaços, maiúsculas e acentos', () => {
    expect(sameQuestion('  QUAL  BANCO usar? ', 'qual banco usar?')).toBe(true);
    expect(sameQuestion('Memória', 'memoria')).toBe(true);
    expect(sameQuestion('Redis', 'SQLite')).toBe(false);
  });

  it('valida a primeira falha e exige a indicada com texto exato', () => {
    expect(questionsProblem([])).toBe('Informe pelo menos uma pergunta.');
    expect(questionsProblem([{ ...question, question: '  ' }])).toBe('A pergunta 1 está vazia.');
    expect(questionsProblem([{ ...question, options: ['Única'] }])).toBe(
      'A pergunta 1 ("Qual banco usar para o cache?") precisa de pelo menos duas opções.',
    );
    expect(questionsProblem([{ ...question, options: ['Redis', ' redis '] }])).toBe(
      'A pergunta 1 ("Qual banco usar para o cache?") tem opções repetidas.',
    );
    expect(questionsProblem([{ ...question, recommended: 'sqlite' }])).toBe(
      'A indicada da pergunta 1 ("Qual banco usar para o cache?") não está entre as opções: use o texto exato de uma delas.',
    );
    expect(questionsProblem([question, { ...question, question: '  QUAL banco USAR para o CACHE?  ' }])).toBe(
      'A pergunta "QUAL banco USAR para o CACHE?" aparece duas vezes nesta rodada.',
    );
    expect(questionsProblem([question])).toBeNull();
  });

  it('limpa quebras de linha e recusa JSON malformado sem derrubar a leitura', () => {
    expect(cleanQuestions([{ question: ' Qual\n banco? ', options: [' Re\ndis ', ' SQLite '], recommended: ' SQLite ' }])).toEqual([
      { question: 'Qual banco?', options: ['Re dis', 'SQLite'], recommended: 'SQLite' },
    ]);
    expect(parseQuestions('não é JSON')).toEqual([]);
    expect(parseQuestions('{}')).toEqual([]);
    expect(parseQuestions('[{"id":"x","question":1,"options":[],"recommended":"a"}]')).toEqual([]);
    expect(parseQuestions(JSON.stringify([{ id: 'q1', ...question, options: ['Só uma'] }]))).toEqual([]);
    expect(parseQuestions(JSON.stringify([{ id: 'q1', ...question }]))).toEqual([{ id: 'q1', ...question }]);
  });

  it('escreve opção indicada, opção comum, resposta personalizada, ausência e decisão automática', () => {
    expect(answerEntry(question, { kind: 'option', text: 'SQLite' }).markdown).toBe(
      '### Qual banco usar para o cache?\nOpções: Redis · SQLite (indicada) · Memória\n**Resposta:** SQLite (a indicada)',
    );
    expect(answerEntry(question, { kind: 'option', text: 'Redis' }).markdown).toContain('**Resposta:** Redis');
    expect(answerEntry(question, { kind: 'custom', text: ' Postgres\n local ' }).markdown).toContain(
      '**Resposta (personalizada):** Postgres local',
    );
    expect(answerEntry(question, { kind: 'none' }).markdown).toContain('**Resposta:** não respondida');
    expect(answerEntry(question, { kind: 'auto' }).markdown).toContain('**Resposta:** SQLite (decidido pela IA no modo autônomo)');
  });

  it('cria a seção, acrescenta e substitui pergunta equivalente preservando introdução e texto posterior', () => {
    const first = answerEntry(question, { kind: 'option', text: 'SQLite' });
    expect(applyAnswers('', [first])).toBe(`## Perguntas e respostas\n\n${first.markdown}`);
    expect(applyAnswers('Resumo', [first])).toBe(`Resumo\n\n## Perguntas e respostas\n\n${first.markdown}`);
    const before = `# Plano\n\n## Perguntas e respostas\n\nIntrodução importante.\n\n${first.markdown}\n\n## Próxima seção\nTexto final.`;
    const second = answerEntry({ question: 'Usar fila?', options: ['Sim', 'Não'], recommended: 'Sim' }, { kind: 'auto' });
    const added = applyAnswers(before, [second]);
    expect(added).toContain('Introdução importante.');
    expect(added).toContain(`${first.markdown}\n\n${second.markdown}`);
    expect(added).toContain('## Próxima seção\nTexto final.');
    const changed = applyAnswers(added, [
      { question: '  QUAL BANCO USAR PARA O CACHE? ', markdown: '### Qual banco usar para o cache?\n**Resposta:** Redis' },
    ]);
    expect(changed.match(/### Qual banco usar para o cache\?/g)).toHaveLength(1);
    expect(changed).toContain('**Resposta:** Redis');
    expect(changed).toContain(second.markdown);
    const spaced = `Prefácio com espaços  \n\n## Perguntas e respostas\n\n${first.markdown}\n\n## Depois\n  Texto intacto.  `;
    const replaced = applyAnswers(spaced, [{ ...first, markdown: '### Qual banco usar para o cache?\n**Resposta:** Redis' }]);
    expect(replaced.startsWith('Prefácio com espaços  \n\n')).toBe(true);
    expect(replaced.endsWith('## Depois\n  Texto intacto.  ')).toBe(true);
  });
});
