import { useState } from 'react';
import { Badge, Checkbox, Dialog, RadioGroup, Text, TextArea, TextField } from '@radix-ui/themes';
import {
  ASSIST_TOPICS,
  type ArtifactAssistDraft,
  type ArtifactAssistResult,
  type AssistAnswer,
  type AssistKind,
  type AssistQuestion,
} from '../../../../shared/artifactAssistant';
import { boardFrontmatter, isNeutralTool, type NeutralTool } from '../../../../shared/artifactTools';
import { defaultVersion } from '../../../../shared/artifacts';
import { getLocale, t } from '../../../i18n';
import { requestArtifactAssistance } from '../../../request';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';
import { ToolGrid } from './ToolGrid';

/** A primeira pergunta é local e fixa por tipo: ela dá o objetivo que a IA usa nas seguintes. */
const FIRST: Record<AssistKind, { text: string; hint: string }> = {
  rule: {
    text: 'Qual é o objetivo deste projeto e para quem ele é?',
    hint: 'Duas ou três frases bastam: a IA monta o resto a partir do que encontrar no projeto.',
  },
  skill: {
    text: 'O que esta skill deve ensinar?',
    hint: 'Descreva o assunto e quando ele se aplica.',
  },
  agent: {
    text: 'Qual é o objetivo deste agente?',
    hint: 'Descreva o papel da sessão e o que ela deve entregar ao terminar um card.',
  },
};

const SKIPPED = '(pulada)';

interface Step {
  q: AssistQuestion;
  answer: string;
}
/** A escolha em andamento na pergunta atual. */
interface Pick {
  single: string;
  multi: string[];
  tools: NeutralTool[];
  free: string;
}

const emptyDraft = (kind: AssistKind): ArtifactAssistDraft => ({
  name: '',
  description: '',
  version: defaultVersion(kind),
  body: '',
  tools: [],
  ...(kind === 'skill' ? { folder: '' } : {}),
  ...(kind === 'agent' ? { skills: [], model: '' } : {}),
});

/** O que já vem marcado numa pergunta: a opção `suggested`, as sugeridas da IA e, ao voltar, a resposta que a pessoa deu. */
function pickFor(q: AssistQuestion, previous?: string): Pick {
  const labels = q.options.map((o) => o.label);
  const parts = previous ? previous.split(', ') : [];
  if (previous !== undefined) {
    if (q.type === 'single')
      return labels.includes(previous)
        ? { single: previous, multi: [], tools: [], free: '' }
        : { single: '', multi: [], tools: [], free: previous };
    if (q.type === 'multi')
      return {
        single: '',
        multi: parts.filter((x) => labels.includes(x)),
        tools: [],
        free: parts.filter((x) => !labels.includes(x)).join(', '),
      };
    return { single: '', multi: [], tools: parts.filter(isNeutralTool), free: parts.filter((x) => !isNeutralTool(x)).join(', ') };
  }
  return {
    single: q.type === 'single' ? (q.options.find((o) => o.suggested)?.label ?? '') : '',
    multi: q.type === 'multi' ? q.options.filter((o) => o.suggested).map((o) => o.label) : [],
    tools: q.type === 'tools' ? (q.suggestedTools ?? []) : [],
    free: '',
  };
}

const answerOf = (q: AssistQuestion, p: Pick): string => {
  const free = p.free.trim();
  if (q.type === 'single') return free || p.single;
  const chosen = q.type === 'multi' ? p.multi : p.tools;
  return [...chosen, ...(free ? [free] : [])].join(', ');
};

/**
 * "Criar com IA": a IA escreve uma pergunta por vez (com dica e opções, uma delas sugerida) e o rascunho do arquivo
 * se atualiza ao lado. Nada é gravado aqui: "Finalizar e revisar no editor" entrega o rascunho ao formulário.
 */
export function ArtifactAssistant({
  kind,
  onClose,
  onFinish,
}: {
  kind: AssistKind;
  onClose: () => void;
  /** "Finalizar e revisar no editor": quem abre o assistente abre o formulário com este rascunho */
  onFinish: (draft: ArtifactAssistDraft) => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const chatBusy = state.chat.busy;
  const first: AssistQuestion = { text: t(FIRST[kind].text), hint: t(FIRST[kind].hint), type: 'single', options: [] };
  const [steps, setSteps] = useState<Step[]>([]);
  const [current, setCurrent] = useState<AssistQuestion | null>(first);
  const [pick, setPick] = useState<Pick>({ single: '', multi: [], tools: [], free: '' });
  const [result, setResult] = useState<ArtifactAssistResult | null>(null);
  const [draft, setDraft] = useState<ArtifactAssistDraft>(emptyDraft(kind));
  const [finished, setFinished] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  /** Pede a próxima pergunta com estas respostas; só troca o estado quando a IA responde. */
  const ask = useAction(async (next: Step[]) => {
    const answers: AssistAnswer[] = next.map((s) => ({ question: s.q.text, answer: s.answer }));
    setRetry(() => () => void ask.run(next));
    const r = await requestArtifactAssistance(
      { mode: 'question', kind, goal: next[0]!.answer, answers, draft, language: getLocale() },
      (state.board.runner.timeoutMinutes + 1) * 60_000,
    );
    setSteps(next);
    setResult(r);
    setDraft(r.draft);
    setCurrent(r.question ?? null);
    if (r.question) setPick(pickFor(r.question));
    setFinished(r.done || !r.question);
    setRetry(null);
  });

  const index = steps.length + 1;
  const total = Math.max(result?.progress.total ?? ASSIST_TOPICS[kind].length, index);
  const done = finished || current === null;
  const answer = current ? answerOf(current, pick) : '';
  const isFirst = steps.length === 0;
  const submit = (text: string) => current && void ask.run([...steps, { q: current, answer: text }]);
  const back = () => {
    const last = steps.at(-1);
    if (!last) return;
    setSteps(steps.slice(0, -1));
    setCurrent(last.q);
    setPick(pickFor(last.q, last.answer === SKIPPED ? undefined : last.answer));
    setFinished(false);
    ask.reset();
    setRetry(null);
  };
  // editar uma resposta anterior descarta as seguintes e repergunta a partir dali
  const edit = (i: number, text: string) => {
    const old = steps[i];
    if (!old || !text.trim() || text.trim() === old.answer) return;
    void ask.run([...steps.slice(0, i), { q: old.q, answer: text.trim() }]);
  };

  const preview =
    kind === 'rule'
      ? draft.body
      : `${boardFrontmatter({ kind, name: draft.name, description: draft.description, version: draft.version, tools: draft.tools, ...(kind === 'agent' ? { skills: draft.skills ?? [], model: draft.model ?? '' } : { folder: draft.folder ?? '' }) })}\n${draft.body}`;
  const finishable = steps.length > 0 && !ask.busy;
  const nextDisabled = ask.busy || chatBusy || !answer.trim();

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !ask.busy && onClose()}>
      <Dialog.Content className="board-dialog board-dialog-xl scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <header className="board-dialog-head">
          <Dialog.Title>{t('Criar com IA')}</Dialog.Title>
          <Dialog.Description>
            {t('A IA faz uma pergunta por vez e monta o rascunho ao lado. Nada é salvo: você revisa no editor.')}
          </Dialog.Description>
        </header>

        <div className="artifact-form board-dialog-scroll">
          <div className="artifact-form-main">
            {result && result.context.length > 0 && (
              <section className="form-panel" aria-label={t('Contexto que encontrei')}>
                <h4>{t('Contexto que encontrei')}</h4>
                <dl className="context-list">
                  {result.context.map((c, i) => (
                    <div key={i}>
                      <dt>{c.label}</dt>
                      <dd>{c.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {steps.length > 0 && (
              <section className="form-panel" aria-label={t('Respostas anteriores')}>
                <h4>{t('Respostas anteriores')}</h4>
                <p className="muted small">{t('Editar uma resposta descarta as seguintes e a IA pergunta de novo a partir dali.')}</p>
                <ul className="answer-list">
                  {steps.map((s, i) => (
                    <li key={`${i}-${s.answer}`}>
                      <Text size="1" color="gray">
                        {s.q.text}
                      </Text>
                      <TextField.Root
                        aria-label={s.q.text}
                        defaultValue={s.answer}
                        disabled={ask.busy}
                        onBlur={(e) => edit(i, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {done ? (
              <section className="form-panel assistant-done" aria-label={t('Pronto para revisar')}>
                <h4>{t('Pronto para revisar')}</h4>
                <p className="muted small">{t('A IA já tem o que precisa. Confira o rascunho ao lado e finalize para abrir o editor.')}</p>
              </section>
            ) : (
              current && (
                <section className="form-panel assistant-question" aria-label={t('Pergunta atual')}>
                  <p className="muted small" role="status">
                    {t('Pergunta {n} de {total}', { n: index, total })}
                  </p>
                  <h4>{current.text}</h4>
                  {current.hint && <p className="muted small">{current.hint}</p>}
                  {current.type === 'single' && current.options.length > 0 && (
                    <RadioGroup.Root
                      aria-label={current.text}
                      value={pick.free.trim() ? '' : pick.single}
                      onValueChange={(v) => setPick({ ...pick, single: v, free: '' })}
                    >
                      {current.options.map((o) => (
                        <Text as="label" size="2" key={o.label} className="assistant-option">
                          <RadioGroup.Item value={o.label} />
                          <span>{o.label}</span>
                          {o.suggested && <Badge variant="soft">{t('Sugerido')}</Badge>}
                        </Text>
                      ))}
                    </RadioGroup.Root>
                  )}
                  {current.type === 'multi' &&
                    current.options.map((o) => (
                      <Text as="label" size="2" key={o.label} className="assistant-option">
                        <Checkbox
                          checked={pick.multi.includes(o.label)}
                          onCheckedChange={(on) =>
                            setPick({ ...pick, multi: on === true ? [...pick.multi, o.label] : pick.multi.filter((x) => x !== o.label) })
                          }
                        />
                        <span>{o.label}</span>
                        {o.suggested && <Badge variant="soft">{t('Sugerido')}</Badge>}
                      </Text>
                    ))}
                  {current.type === 'tools' && kind !== 'rule' && (
                    <ToolGrid
                      kind={kind}
                      value={pick.tools}
                      onChange={(tools) => setPick({ ...pick, tools })}
                      suggested={current.suggestedTools}
                    />
                  )}
                  <FormField label={current.options.length || current.type === 'tools' ? t('Outra resposta') : t('Sua resposta')}>
                    {(id) =>
                      current.options.length || current.type === 'tools' ? (
                        <TextField.Root id={id} value={pick.free} onChange={(e) => setPick({ ...pick, free: e.target.value })} />
                      ) : (
                        <TextArea
                          id={id}
                          rows={3}
                          autoFocus
                          value={pick.free}
                          onChange={(e) => setPick({ ...pick, free: e.target.value })}
                        />
                      )
                    }
                  </FormField>
                </section>
              )
            )}

            {ask.busy && (
              <p className="muted small" role="status">
                {t('A IA está pensando…')}
              </p>
            )}
            {chatBusy && (
              <p className="muted small" role="status">
                {t('A IA está respondendo no chat. Espere terminar para continuar.')}
              </p>
            )}
            {ask.error && !ask.busy && (
              <div role="alert" className="form-error">
                <span>{ask.error}</span>{' '}
                {retry && (
                  <ActionButton size="1" variant="soft" hint={t('Repete o último pedido à IA.')} onClick={retry}>
                    {t('Tentar de novo')}
                  </ActionButton>
                )}
              </div>
            )}
          </div>

          <aside className="artifact-form-side" aria-label={t('Rascunho do arquivo')}>
            <section className="form-panel">
              <h4>{t('Rascunho do arquivo')}</h4>
              {preview.trim() ? (
                <pre className="form-panel-code assistant-draft">{preview}</pre>
              ) : (
                <p className="muted small">{t('O rascunho aparece aqui conforme você responde.')}</p>
              )}
            </section>
          </aside>
        </div>

        <footer className="board-dialog-footer">
          <ActionButton
            variant="soft"
            color="gray"
            disabled={isFirst || ask.busy}
            disabledReason={t('Esta é a primeira pergunta.')}
            hint={t('Volta à pergunta anterior.')}
            onClick={back}
          >
            {t('Voltar')}
          </ActionButton>
          <span className="spacer" />
          <ActionButton variant="soft" color="gray" hint={t('Fecha sem criar nada.')} onClick={onClose} disabled={ask.busy}>
            {t('Cancelar')}
          </ActionButton>
          {!done && (
            <ActionButton
              variant="soft"
              color="gray"
              disabled={isFirst || ask.busy || chatBusy}
              disabledReason={isFirst ? t('A primeira pergunta não pode ser pulada.') : t('Espere a IA terminar.')}
              hint={t('Segue sem responder esta pergunta.')}
              onClick={() => submit(SKIPPED)}
            >
              {t('Pular')}
            </ActionButton>
          )}
          <ActionButton
            variant={done ? 'solid' : 'soft'}
            disabled={!finishable}
            disabledReason={t('Responda a primeira pergunta para ter um rascunho.')}
            hint={t('Abre o formulário com este rascunho para você revisar e salvar.')}
            onClick={() => onFinish(draft)}
          >
            {t('Finalizar e revisar no editor')}
          </ActionButton>
          {!done && (
            <ActionButton
              loading={ask.busy}
              disabled={nextDisabled}
              disabledReason={chatBusy ? t('A IA está respondendo no chat. Espere terminar.') : t('Responda ou escolha uma opção.')}
              hint={t('Envia a resposta e pede a próxima pergunta.')}
              onClick={() => submit(answer.trim())}
            >
              {t('Próxima')}
            </ActionButton>
          )}
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
