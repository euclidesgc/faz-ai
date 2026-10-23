import { CONTEXT_ACTION_LABELS } from '../../../../shared/contextPlan';
import { useBoardStore } from '../../../store/boardStore';
import { Checkbox, Select, TextField } from '@radix-ui/themes';
import type { ExecutionPolicy, ExecutionTarget, PolicyFailure } from '../../../../shared/executionPolicies';
import { AI_BASES } from '../../../../shared/harness';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { t } from '../../../i18n';
import { FormField } from '../../ui';

export const FAILURE_LABELS: Record<PolicyFailure, string> = {
  auth: 'Autenticação',
  quota: 'Quota de uso',
  'rate-limit': 'Limite de frequência',
  unavailable: 'Indisponibilidade',
  capability: 'Capacidade obrigatória',
  permission: 'Permissão',
  'flag-refused': 'Argumento recusado',
  timeout: 'Tempo esgotado',
  'invalid-output': 'Saída inválida',
  'partial-work': 'Trabalho parcial',
  unknown: 'Falha desconhecida',
};
export const POLICY_ACTION_LABELS: Record<ExecutionPolicy['action'], string> = {
  block: 'Bloquear',
  wait: 'Aguardar',
  offer: 'Oferecer alternativas',
  auto: 'Fallback automático',
};
export const ORIGIN_LABELS = { manual: 'Manual', heartbeat: 'Heartbeat', autopilot: 'Autopiloto', chat: 'Conversa', test: 'Teste' };
export const REASON_LABELS: Record<string, string> = {
  'no-policy': 'Nenhuma política corresponde ao cenário.',
  'requested-target-invalid': 'A escolha de origem é inválida.',
  'invalid-input': 'O cenário contém valores inválidos.',
  'invalid-history': 'O histórico de tentativas é inválido.',
  'invalid-policy-set': 'Há conflitos ou destinos inválidos nas políticas.',
  'reconciliation-required': 'É preciso reconciliar o trabalho antes de tentar novamente.',
  'mandatory-constraint-failed': 'A falha obrigatória impede fallback automático.',
  'deadline-exhausted': 'O prazo da cadeia terminou.',
  'attempts-exhausted': 'O máximo de tentativas foi atingido.',
  'policy-block': 'A política determina bloqueio.',
  'policy-wait': 'A política determina espera.',
  'targets-exhausted': 'Nenhum destino elegível restou.',
  backoff: 'Aguarde o intervalo entre tentativas.',
  'alternatives-require-review': 'A pessoa precisa escolher uma alternativa.',
  'fallback-permitted': 'O cenário permite o próximo destino.',
  'already-visited': 'Este destino já foi tentado.',
  'availability-unknown': 'Disponibilidade não informada.',
  unavailable: 'Destino indisponível.',
  'credentials-not-reviewed': 'As credenciais do cenário não estão revisadas.',
  'admission-blocked': 'O destino do cenário não tem admissão.',
  'constraints-changed': 'O destino altera um limite obrigatório.',
  'concurrency-limit': 'O limite de concorrência foi atingido.',
  'invalid-consumption': 'Os dados de consumo são inválidos.',
  'visited-cycle': 'Há um destino repetido no histórico.',
  'invalid-budget': 'Os limites da cadeia são inválidos.',
};
export const profileLabel = (library: PolicyLibrary, id: string): string => {
  const p = library.profiles.find((p) => p.id === id);
  // o catálogo monta o rótulo com o modo a partir dos perfis do board ("Gemini · API")
  if (p?.label) return p.label;
  const name = AI_BASES.find((tool) => tool.id === p?.tool)?.label;
  return name ? (id === p?.tool ? name : `${id} (${name})`) : t('Ausente: {name}', { name: id });
};
/**
 * O aviso do destino num perfil desligado no board (história 12): a política salva e o simulador a avalia, mas na
 * execução a troca não acontece até a pessoa ligar o perfil. Não bloqueia salvar.
 */
export const offTargetNote = (library: PolicyLibrary, profileId: string): string | null =>
  library.profiles.find((p) => p.id === profileId)?.off
    ? t(
        'O perfil {name} está desligado: a política pode ser salva, mas a execução só troca para ele depois que você o ligar em Ferramentas de IA.',
        {
          name: profileLabel(library, profileId),
        },
      )
    : null;
export const targetLabel = (library: PolicyLibrary, target: ExecutionTarget) =>
  `${profileLabel(library, target.profileId)} · ${target.model ?? t('Modelo padrão')}${target.effort ? ` · ${target.effort}` : ''}`;
export function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return (
    <FormField label={label}>
      {(id) => (
        <Select.Root value={value} onValueChange={onChange}>
          <Select.Trigger id={id} />
          <Select.Content>
            {choices.map((o) => (
              <Select.Item key={o.value} value={o.value}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
    </FormField>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1000000,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
}) {
  return (
    <FormField label={label}>
      {(id) => (
        <TextField.Root id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      )}
    </FormField>
  );
}
export function Checks<T extends string | null>({
  label,
  values,
  choices,
  onChange,
}: {
  label: string;
  values: T[];
  choices: { value: T; label: string }[];
  onChange(value: T[]): void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {choices.map((o) => (
        <label className="check" key={String(o.value)}>
          <Checkbox
            checked={values.includes(o.value)}
            onCheckedChange={(checked) => onChange(checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
export function PolicySummary({ policy, library }: { policy: ExecutionPolicy; library: PolicyLibrary }) {
  const state = useBoardStore((s) => s.state)!;
  return (
    <dl>
      <dt>{t('Nome')}</dt>
      <dd>{policy.name}</dd>
      <dt>{t('Prioridade')}</dt>
      <dd>{policy.priority}</dd>
      <dt>{t('Ação')}</dt>
      <dd>{t(POLICY_ACTION_LABELS[policy.action])}</dd>
      <dt>{t('Definição ligada')}</dt>
      <dd>{policy.enabled ? t('Sim') : t('Não')}</dd>
      <dt>{t('Perfis de origem')}</dt>
      <dd>{policy.conditions.profileIds.map((id) => profileLabel(library, id)).join(', ') || t('Qualquer valor')}</dd>
      <dt>{t('Modelos de origem')}</dt>
      <dd>{policy.conditions.models.map((m) => m ?? t('Modelo padrão')).join(', ') || t('Qualquer valor')}</dd>
      <dt>{t('Falhas')}</dt>
      <dd>{policy.conditions.failures.map((f) => t(FAILURE_LABELS[f])).join(', ')}</dd>
      <dt>{t('Ações de origem')}</dt>
      <dd>{policy.conditions.actions.map((a) => t(CONTEXT_ACTION_LABELS[a])).join(', ') || t('Qualquer valor')}</dd>
      <dt>{t('Agentes de origem')}</dt>
      <dd>
        {policy.conditions.agentIds.map((id) => state.harness.library?.artifacts.find((a) => a.id === id)?.name ?? id).join(', ') ||
          t('Qualquer valor')}
      </dd>
      <dt>{t('Fases de origem')}</dt>
      <dd>
        {policy.conditions.phaseIds.map((id) => state.columns.find((c) => c.id === id)?.name ?? id).join(', ') || t('Qualquer valor')}
      </dd>
      <dt>{t('Tipos de origem')}</dt>
      <dd>
        {policy.conditions.cardTypeIds.map((id) => state.cardTypes.find((c) => c.id === id)?.name ?? id).join(', ') || t('Qualquer valor')}
      </dd>
      <dt>{t('Origens da chamada')}</dt>
      <dd>{policy.conditions.origins.map((o) => t(ORIGIN_LABELS[o])).join(', ') || t('Qualquer valor')}</dd>
      <dt>{t('Escolhas explícitas')}</dt>
      <dd>
        {t(
          policy.conditions.explicit === 'exclude'
            ? 'Preservar escolhas explícitas'
            : policy.conditions.explicit === 'include'
              ? 'Incluir quando perfil e modelo corresponderem'
              : 'Somente escolhas explícitas correspondentes',
        )}
      </dd>
      <dt>{t('Destinos ordenados')}</dt>
      <dd>
        <ol>
          {policy.targets.map((target, i) => {
            const off = offTargetNote(library, target.profileId);
            return (
              <li key={i}>
                {targetLabel(library, target)}
                {off && <p role="note">{off}</p>}
              </li>
            );
          })}
        </ol>
      </dd>
      <dt>{t('Máximo de tentativas')}</dt>
      <dd>{policy.limits.maxAttempts}</dd>
      <dt>{t('Prazo da cadeia (segundos)')}</dt>
      <dd>{policy.limits.maxElapsedMs / 1000}</dd>
      <dt>{t('Intervalo entre tentativas (segundos)')}</dt>
      <dd>{policy.limits.backoffMs / 1000}</dd>
      <dt>{t('Teto global de processos')}</dt>
      <dd>{policy.limits.globalProcesses ?? t('Sem teto adicional')}</dd>
      <dt>{t('Tetos por perfil')}</dt>
      <dd>
        {Object.keys(policy.limits.perProfile).length ? (
          <ul>
            {Object.entries(policy.limits.perProfile).map(([id, n]) => (
              <li key={id}>
                {profileLabel(library, id)}: {n}
              </li>
            ))}
          </ul>
        ) : (
          t('Sem teto adicional')
        )}
      </dd>
    </dl>
  );
}
