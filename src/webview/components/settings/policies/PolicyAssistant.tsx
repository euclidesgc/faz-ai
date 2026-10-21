import { useState } from 'react';
import { Button, TextArea } from '@radix-ui/themes';
import type { ExecutionPolicy } from '../../../../shared/executionPolicies';
import { policyChanges, MAX_GOAL_CHARS, type PolicyAssistMode, type PolicyAssistResult } from '../../../../shared/policyAssistant';
import type { PolicyLibrary, PolicyScenario } from '../../../../shared/policyManagement';
import { requestExecutionPolicy } from '../../../request';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { getLocale, t } from '../../../i18n';
import { FormField } from '../../ui';
import { FAILURE_LABELS, PolicySummary, REASON_LABELS, targetLabel } from './parts';

const MODE_LABELS: Record<PolicyAssistMode, string> = {
  create: 'Criar com ajuda de IA',
  fallbacks: 'Sugerir fallbacks',
  conflicts: 'Revisar conflitos',
};
const ELIGIBILITY_LABELS: Record<PolicyScenario['eligibility'], string> = {
  admitted: 'Destinos admitidos',
  unavailable: 'Destinos indisponíveis',
  'pending-credentials': 'Credenciais pendentes',
  'blocked-admission': 'Sem admissão comprovada',
};

/**
 * Pede uma proposta à IA e a mostra (explicação, diferenças, exemplos simulados) antes de qualquer coisa. A IA nunca
 * salva nem liga política: "Usar como rascunho" só entrega a proposta ao editor, onde valem a comparação e a revisão de sempre.
 * O editor manual não depende deste painel nem de executor admissível.
 */
export function PolicyAssistant({
  modes,
  draft,
  library,
  applyLabel,
  onApply,
}: {
  modes: PolicyAssistMode[];
  draft: ExecutionPolicy | null;
  library: PolicyLibrary;
  applyLabel: string;
  onApply(policy: ExecutionPolicy): void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [mode, setMode] = useState<PolicyAssistMode | null>(null);
  const [goal, setGoal] = useState('');
  const [result, setResult] = useState<PolicyAssistResult | null>(null);
  const ask = useAction(async (next: PolicyAssistMode) => {
    setResult(null);
    const reply = await requestExecutionPolicy(
      { type: 'executionPolicy.assist', input: { mode: next, goal, draft, language: getLocale() } },
      (state.board.runner.timeoutMinutes + 1) * 60_000,
    );
    if (!reply.assistance) throw new Error(t('A IA não devolveu uma proposta.'));
    setResult(reply.assistance);
  });
  const close = () => {
    setMode(null);
    setResult(null);
    ask.reset();
  };
  if (!mode)
    return (
      <div className="actions">
        {modes.map((m) => (
          <Button key={m} variant="soft" onClick={() => setMode(m)}>
            {t(MODE_LABELS[m])}
          </Button>
        ))}
      </div>
    );
  const policy = result?.policy ?? null;
  const name = (id: string) => library.snapshot.records.find((r) => r.policy.id === id)?.policy.name ?? draft?.name ?? id;
  return (
    <section aria-label={t(MODE_LABELS[mode])}>
      <h4>{t(MODE_LABELS[mode])}</h4>
      <p className="muted">
        {t(
          'A IA recebe só o catálogo, os perfis e as políticas, sem segredos, e devolve uma proposta. Nada é salvo nem ligado até você revisar e confirmar. Sem IA disponível, o editor manual continua igual.',
        )}
      </p>
      {mode === 'create' && (
        <FormField label={t('Objetivo da política')}>
          {(id) => <TextArea id={id} rows={3} maxLength={MAX_GOAL_CHARS} value={goal} onChange={(e) => setGoal(e.target.value)} />}
        </FormField>
      )}
      <div className="actions">
        <Button disabled={ask.busy || (mode === 'create' && !goal.trim())} onClick={() => void ask.run(mode)}>
          {ask.busy ? t('Consultando a IA…') : t('Pedir proposta')}
        </Button>
        <Button variant="soft" onClick={close}>
          {t('Fechar assistente')}
        </Button>
      </div>
      {ask.error && <p role="alert">{t(ask.error)}</p>}
      {result && (
        <div role="status">
          <h4>{t('Explicação da IA')}</h4>
          <p>{result.explanation}</p>
          {result.problems.length > 0 && (
            <>
              <h4>{t('Conflitos nas políticas salvas')}</h4>
              <ul>
                {result.problems.map((p, i) => (
                  <li key={i}>
                    {t(p.code === 'cycle' ? 'Cadeia cíclica' : p.code === 'ambiguous-priority' ? 'Prioridade ambígua' : 'Destino inválido')}
                    : {p.policyIds.map(name).join(' → ')}
                  </li>
                ))}
              </ul>
            </>
          )}
          {policy ? (
            <>
              <h4>{t('Rascunho proposto')}</h4>
              <PolicySummary policy={policy} library={library} />
              <h4>{t('Diferenças')}</h4>
              <ul>
                {policyChanges(draft, policy).map((c) => (
                  <li key={c.path}>
                    {c.path}: {c.before} → {c.after}
                  </li>
                ))}
              </ul>
              <h4>{t('Exemplos na simulação local')}</h4>
              <p className="muted">
                {t('Cenários hipotéticos com o rascunho ligado só na simulação. Não comprovam admissão nem credenciais.')}
              </p>
              <ul>
                {result.scenarios.map((s, i) => (
                  <li key={i}>
                    {t(FAILURE_LABELS[s.failure])} · {t(ELIGIBILITY_LABELS[s.eligibility])}:{' '}
                    {t(REASON_LABELS[s.simulation.decision.reason] ?? s.simulation.decision.reason)}
                    {s.simulation.decision.target ? ` → ${targetLabel(library, s.simulation.decision.target)}` : ''}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => {
                  onApply(policy);
                  close();
                }}
              >
                {applyLabel}
              </Button>
            </>
          ) : (
            <p>{t('A IA não propôs alterações no rascunho.')}</p>
          )}
        </div>
      )}
    </section>
  );
}
