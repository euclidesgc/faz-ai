import { useEffect, useRef, useState } from 'react';
import { Badge, Button as RxButton } from '@radix-ui/themes';
import type { Card, Id } from '../../../shared/model';
import { cards } from '../../commands';
import { useAction } from '../../useAction';
import { Button, TextField } from '../ui';
import { t, tn } from '../../i18n';

type Answers = Record<Id, { text: string; custom: boolean }>;

/** A IA escreve a pergunta e as opções; a quebra de linha de uma resposta digitada vira espaço. */
const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/**
 * Perguntas da IA, uma por vez, com um resumo no fim. As respostas ficam só aqui até o envio: o host
 * recebe o conjunto de uma vez e devolve a vez para a IA. O pai troca a `key` quando o conjunto muda,
 * o que recomeça o carrossel.
 */
export function QuestionsCarousel({ card, onBeforeSend }: { card: Card; onBeforeSend: () => void }) {
  const questions = card.questions;
  const total = questions.length;
  // 0..total-1 são as perguntas; `total` é o resumo
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // o foco acompanha a troca de passo, para o leitor de tela anunciar a pergunta nova (não na montagem)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const send = useAction(async () => {
    onBeforeSend();
    const list = questions.flatMap((q) => {
      const a = answers[q.id];
      return a ? [{ questionId: q.id, text: a.text, custom: a.custom }] : [];
    });
    await cards.answerQuestions(card.id, list);
  });

  const answer = (id: Id, text: string, custom: boolean) => setAnswers((a) => ({ ...a, [id]: { text, custom } }));
  const clear = (id: Id) =>
    setAnswers((a) => {
      const { [id]: _removed, ...rest } = a;
      return rest;
    });
  const next = () => setStep((s) => Math.min(total, s + 1));
  const unanswered = questions.filter((q) => !answers[q.id]).length;
  const q = step < total ? questions[step] : undefined;
  const current = q ? answers[q.id] : undefined;

  return (
    <section className="drawer-section questions">
      <h3>
        {t('Perguntas da IA')} <small>{t('{n} de {total}', { n: Math.min(step + 1, total), total })}</small>
      </h3>
      {q ? (
        <>
          <h4 ref={heading} tabIndex={-1} className="questions-title">
            {q.question}
          </h4>
          <ul className="questions-options">
            {q.options.map((opt) => {
              const chosen = current?.custom === false && current.text === opt;
              const recommended = opt === q.recommended;
              return (
                <li key={opt}>
                  <RxButton
                    type="button"
                    variant="soft"
                    aria-pressed={chosen}
                    className={recommended ? 'questions-option questions-option--recommended' : 'questions-option'}
                    onClick={() => {
                      answer(q.id, opt, false);
                      next();
                    }}
                  >
                    {opt}
                    {recommended && <Badge>{t('Indicada')}</Badge>}
                  </RxButton>
                </li>
              );
            })}
          </ul>
          <TextField
            key={q.id}
            aria-label={t('Ou escreva a sua resposta')}
            placeholder={t('Ou escreva a sua resposta')}
            value={current?.custom ? current.text : ''}
            onCommit={(v) => {
              const text = oneLine(v);
              if (text) answer(q.id, text, true);
              else if (current?.custom) clear(q.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') next();
            }}
          />
          <div className="questions-nav">
            <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              {t('Anterior')}
            </Button>
            <Button onClick={next}>{t('Próxima')}</Button>
          </div>
        </>
      ) : (
        <>
          <h4 ref={heading} tabIndex={-1} className="questions-title">
            {t('Confira e envie')}
          </h4>
          <ul className="questions-summary">
            {questions.map((item, i) => {
              const a = answers[item.id];
              return (
                <li key={item.id}>
                  <button type="button" className="questions-summary-row" onClick={() => setStep(i)}>
                    <span>{item.question}</span>
                    <span className={a ? undefined : 'muted'}>{a ? a.text : t('não respondida')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {unanswered > 0 && (
            <p className="questions-warning" role="status">
              {tn(unanswered, '1 pergunta sem resposta', '{n} perguntas sem resposta')}
            </p>
          )}
          <p className="muted">{t('As respostas vão para a descrição do card e a vez volta para a IA.')}</p>
          <div className="questions-nav">
            <Button onClick={() => setStep(total - 1)}>{t('Anterior')}</Button>
            <Button variant="primary" loading={send.busy} onClick={() => void send.run()}>
              {t('Enviar respostas')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
