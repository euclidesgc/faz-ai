import type { EnvironmentReport } from '../../../shared/environment';
import type { EffectiveLimits } from '../../../shared/orchestration';
import type { ProfileProblem } from '../../../shared/profileHealth';
import { t } from '../../i18n';
import { REASON_LABELS } from '../settings/policies/parts';

const PROBLEM_NAME: Record<ProfileProblem, string> = {
  'pending-review': 'o perfil espera revisão',
  cli: 'a linha de comando não foi encontrada',
  signin: 'o login não está conectado',
  unvalidated: 'o perfil ainda não foi testado',
  stale: 'o perfil precisa ser testado de novo',
  'not-admissible': 'o perfil não é admissível',
};

const UNAVAILABLE = 'Indisponível nesta versão';

/** Uma linha por limite efetivo: o pedido, o que vale e o motivo, como `effectiveLimits` devolveu. */
function limitRows(l: EffectiveLimits): { name: string; asked: string; effective: string; reason: string }[] {
  const rows = [
    { name: t('Processos em pasta própria'), asked: '—', effective: String(l.branchProcesses), reason: '—' },
    { name: t('Processos só de texto'), asked: '—', effective: String(l.textProcesses), reason: '—' },
    { name: t('Escritores por pasta'), asked: '—', effective: String(l.writersPerWorkspace), reason: '—' },
    {
      name: t('Sub-tarefas em paralelo'),
      asked: String(l.subtasks.requested),
      effective: String(l.subtasks.effective),
      reason: l.subtasks.reason ?? '—',
    },
    {
      name: t('Processos no total'),
      asked: '—',
      effective: l.globalProcesses === null ? t('Sem teto') : String(l.globalProcesses),
      reason: '—',
    },
  ];
  for (const [id, n] of Object.entries(l.perProfile))
    rows.push({ name: t('Processos do perfil {id}', { id }), asked: '—', effective: String(n), reason: '—' });
  return rows;
}

/**
 * A próxima execução e os limites do Diagnóstico. Só mostra o que o relatório trouxe: o destino vem do
 * simulador de políticas e os limites de `effectiveLimits`; nenhuma regra é recalculada aqui.
 */
export function NextRunSection({ report }: { report: Pick<EnvironmentReport, 'regime' | 'nextRun' | 'limits'> }) {
  const { regime, nextRun, limits } = report;
  const decision = nextRun?.simulation.decision;
  return (
    <section aria-labelledby="env-next-run">
      <h3 id="env-next-run">{t('Próxima execução e limites')}</h3>
      <p className="small">
        {t('Contexto do card: {regime}', {
          regime: regime === 'exclusive' ? t('fechado (regime exclusivo)') : t('aberto (regime compatível)'),
        })}
      </p>
      {!decision ? (
        <p className="small muted">{t(UNAVAILABLE)}</p>
      ) : (
        <div className="env-fix">
          {decision.target ? (
            <p>
              {t('Alvo padrão: {target}', { target: `${decision.target.profileId} · ${decision.target.model ?? t('modelo padrão')}` })}
              {decision.policy && (
                <span className="small muted">
                  {' '}
                  · {t('regra {id}, versão {n}', { id: decision.policy.id, n: decision.policy.revision })}
                </span>
              )}
            </p>
          ) : (
            <p>
              {t('Bloqueada: {reason}', { reason: REASON_LABELS[decision.reason] ? t(REASON_LABELS[decision.reason]!) : decision.reason })}
            </p>
          )}
          {nextRun!.blockedInUse.map((b) => (
            <p key={b.id} className="small">
              {t('Os cards com alvo {name} não rodam: {reason}.', { name: b.name, reason: t(PROBLEM_NAME[b.problem]) })}
            </p>
          ))}
        </div>
      )}
      {!limits ? (
        <p className="small muted">{t(UNAVAILABLE)}</p>
      ) : (
        <table className="env-limits">
          <caption className="sr-only">{t('Limites de execução')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Limite')}</th>
              <th scope="col">{t('Pedido')}</th>
              <th scope="col">{t('Efetivo')}</th>
              <th scope="col">{t('Motivo')}</th>
            </tr>
          </thead>
          <tbody>
            {limitRows(limits).map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{r.asked}</td>
                <td>{r.effective}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
