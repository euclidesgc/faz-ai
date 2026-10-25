import { CONTEXT_ACTION_LABELS } from '../../../../shared/contextPlan';
import { useBoardStore } from '../../../store/boardStore';
import { Checkbox, Select, TextField } from '@radix-ui/themes';
import type { ExecutionPolicy, ExecutionTarget, PolicyFailure } from '../../../../shared/executionPolicies';
import { AI_BASES } from '../../../../shared/harness';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { t } from '../../../i18n';
import { FormField } from '../../ui';
import { GroupedPicker, type PickerGroup } from '../../GroupedPicker';

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
        'O perfil {name} está desligado: a política pode ser salva, mas a execução só troca para ele depois que você o ligar em Conectar agentes.',
        {
          name: profileLabel(library, profileId),
        },
      )
    : null;
export const targetLabel = (library: PolicyLibrary, target: ExecutionTarget) =>
  `${profileLabel(library, target.profileId)} · ${target.model ?? t('Modelo padrão')}${target.effort ? ` · ${target.effort}` : ''}`;

/** O nome do modelo como a tela mostra (o rótulo do catálogo, ou o código quando o modelo não está nele). */
export const modelName = (library: PolicyLibrary, profileId: string, model: string | null): string => {
  if (model === null) return t('Modelo padrão');
  const profile = library.profiles.find((p) => p.id === profileId);
  return library.models.find((m) => m.model === model && (!profile || m.tool === profile.tool))?.label ?? model;
};
/** "Gemini · API · Pro", ou "Gemini · API · Pro · high" com o esforço. */
export const targetName = (library: PolicyLibrary, target: ExecutionTarget): string =>
  `${profileLabel(library, target.profileId)} · ${modelName(library, target.profileId, target.model)}${target.effort ? ` · ${target.effort}` : ''}`;

/**
 * A origem de uma regra simples: qualquer modelo (`*`), qualquer modelo de um agente (`p:<perfil>`) ou um modelo de um
 * agente (`m:<perfil>:<modelo>`). As condições guardam perfis × modelos; a regra simples usa uma origem só, porque dois
 * perfis e dois modelos casariam as quatro combinações, e não as duas que a pessoa pediu. `null`: as condições têm mais
 * de uma origem (regra montada no modo avançado ou importada).
 */
export const ANY_ORIGIN = '*';
export const originOf = (c: ExecutionPolicy['conditions']): string | null => {
  if (!c.profileIds.length && !c.models.length) return ANY_ORIGIN;
  if (c.profileIds.length !== 1 || c.models.length > 1) return null;
  const model = c.models[0];
  if (model === null) return null;
  return model === undefined ? `p:${c.profileIds[0]}` : `m:${c.profileIds[0]}:${model}`;
};
export const originConditions = (origin: string): Pick<ExecutionPolicy['conditions'], 'profileIds' | 'models'> => {
  if (origin === ANY_ORIGIN) return { profileIds: [], models: [] };
  const [kind, profileId, ...rest] = origin.split(':');
  return kind === 'p' ? { profileIds: [profileId!], models: [] } : { profileIds: [profileId!], models: [rest.join(':')] };
};
const offSuffix = (library: PolicyLibrary, profileId: string) =>
  library.profiles.find((p) => p.id === profileId)?.off ? ` (${t('desligado')})` : '';
/** Os modelos que podem falhar numa regra do agente: só os dele (a regra é do modelo que falha). */
export function originGroups(library: PolicyLibrary, profileId: string): PickerGroup[] {
  const p = library.profiles.find((p) => p.id === profileId);
  if (!p) return [];
  return [
    {
      key: p.id,
      label: profileLabel(library, p.id) + offSuffix(library, p.id),
      options: library.models.filter((m) => p.modelIds.includes(m.id)).map((m) => ({ value: `m:${p.id}:${m.model}`, label: m.label })),
    },
  ];
}
export const originLabel = (library: PolicyLibrary, c: ExecutionPolicy['conditions']): string => {
  const origin = originOf(c);
  if (origin === ANY_ORIGIN) return t('qualquer modelo');
  if (origin === null) {
    const profiles = c.profileIds.map((id) => profileLabel(library, id));
    const models = c.models.map((m) => m ?? t('Modelo padrão'));
    return [profiles.join(', ') || t('qualquer agente'), models.join(', ') || t('qualquer modelo')].join(' · ');
  }
  const { profileIds, models } = originConditions(origin);
  return models.length
    ? `${profileLabel(library, profileIds[0]!)} · ${modelName(library, profileIds[0]!, models[0]!)}`
    : t('qualquer modelo de {agent}', { agent: profileLabel(library, profileIds[0]!) });
};
/** Os destinos que o seletor oferece, um grupo por agente: cada modelo dele e o modelo padrão dele. */
export const targetKeyOf = (target: Pick<ExecutionTarget, 'profileId' | 'model'>) => `${target.profileId}|${target.model ?? ''}`;
/** O destino ainda sem modelo escolhido: a linha aparece vazia até a pessoa escolher. */
export const EMPTY_TARGET: ExecutionTarget = { profileId: '', model: null, effort: null };
/**
 * Os destinos que o seletor oferece, um grupo por agente: todos os modelos de todos os agentes, menos o que falha
 * (`origin`) e os já escolhidos nas outras linhas (`taken`). O "modelo padrão" só nos outros agentes: no do modelo que
 * falha ele pode ser o próprio.
 */
export function targetGroups(
  library: PolicyLibrary,
  origin: { profileId: string; model: string } | null = null,
  taken: readonly string[] = [],
): PickerGroup[] {
  return library.profiles
    .map((p) => ({
      key: p.id,
      label: profileLabel(library, p.id) + offSuffix(library, p.id),
      options: [
        ...library.models
          .filter((m) => p.modelIds.includes(m.id) && !(origin?.profileId === p.id && origin.model === m.model))
          .map((m) => ({ value: targetKeyOf({ profileId: p.id, model: m.model }), label: m.label })),
        ...(origin?.profileId === p.id ? [] : [{ value: targetKeyOf({ profileId: p.id, model: null }), label: t('Modelo padrão') }]),
      ].filter((o) => !taken.includes(o.value)),
    }))
    .filter((g) => g.options.length);
}
/** Os modelos do catálogo, um grupo por agente, no valor `ferramenta:modelo[@esforço]` que o cenário usa. */
export function modelGroupsOf(library: PolicyLibrary, profileId?: string): PickerGroup[] {
  return library.profiles
    .filter((p) => !profileId || p.id === profileId)
    .map((p) => ({
      key: p.id,
      label: profileLabel(library, p.id) + offSuffix(library, p.id),
      options: library.models
        .filter((m) => p.modelIds.includes(m.id))
        .map((m) => ({ value: `${m.tool}:${m.model}${m.defaultEffort ? `@${m.defaultEffort}` : ''}`, label: m.label })),
    }))
    .filter((g) => g.options.length);
}
/** A regra usa algo além do caminho simples (origem única, só a cota, trocar sozinho ou perguntar, sem outras condições). */
export const isAdvanced = (p: ExecutionPolicy): boolean =>
  originOf(p.conditions) === null ||
  p.conditions.failures.length !== 1 ||
  p.conditions.failures[0] !== 'quota' ||
  !['auto', 'offer'].includes(p.action) ||
  p.conditions.actions.length > 0 ||
  p.conditions.agentIds.length > 0 ||
  p.conditions.phaseIds.length > 0 ||
  p.conditions.cardTypeIds.length > 0 ||
  p.conditions.origins.length > 0 ||
  p.conditions.explicit === 'only';
export const HOW_LABELS: Record<ExecutionPolicy['action'], string> = {
  auto: 'Troca sozinho',
  offer: 'Pergunta antes',
  block: 'Bloqueia o card',
  wait: 'Espera e tenta de novo',
};
/** Um nome curto para a regra a partir da origem e do primeiro destino ("Opus 5.5 → Pro (Gemini · API)"). */
export const defaultName = (p: ExecutionPolicy, library: PolicyLibrary): string => {
  const origin = originOf(p.conditions);
  const { profileIds, models } = origin !== null && origin !== ANY_ORIGIN ? originConditions(origin) : { profileIds: [], models: [] };
  const from = models.length ? modelName(library, profileIds[0]!, models[0]!) : originLabel(library, p.conditions);
  const target = p.targets.find((target) => target.profileId);
  // o agente só entra no nome quando o destino está noutro agente
  const to = target
    ? modelName(library, target.profileId, target.model) +
      (target.profileId === profileIds[0] ? '' : ` (${profileLabel(library, target.profileId)})`)
    : t(HOW_LABELS[p.action]);
  return `${from.charAt(0).toUpperCase()}${from.slice(1)} → ${to}`;
};
/** A frase da regra: "Quando X esgotar a cota, o board troca sozinho para Y; se também falhar, Z." */
export function ruleSentence(p: ExecutionPolicy, library: PolicyLibrary): string {
  const failures =
    p.conditions.failures.length === 1 && p.conditions.failures[0] === 'quota'
      ? t('esgotar a cota')
      : t('falhar por {failures}', { failures: p.conditions.failures.map((f) => t(FAILURE_LABELS[f]).toLowerCase()).join(', ') });
  const when = t('Quando {origin} {failure}', { origin: originLabel(library, p.conditions), failure: failures });
  if (p.action === 'block') return `${when}, ${t('o card fica bloqueado')}.`;
  if (p.action === 'wait') return `${when}, ${t('o board espera {seconds} s e tenta de novo', { seconds: p.limits.backoffMs / 1000 })}.`;
  const chosen = p.targets.filter((target) => target.profileId);
  if (!chosen.length) return `${when}, … (${t('escolha ao menos um modelo')})`;
  const [first, ...rest] = chosen.map((target) => targetName(library, target));
  const how =
    p.action === 'auto'
      ? t('o board troca sozinho para {target}', { target: first! })
      : t('o board pergunta se segue em {target}', { target: first! });
  const then = rest.length ? `; ${t('se também falhar, {targets}', { targets: rest.join(t(', depois ')) })}` : '';
  return `${when}, ${how}${then}.`;
}
export function Choice({
  label,
  value,
  choices,
  groups,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  /** as opções soltas; com `groups`, elas ficam no topo, antes dos grupos */
  choices: { value: string; label: string }[];
  /** com grupos (um por agente), o seletor ganha o filtro por nome */
  groups?: PickerGroup[];
  onChange(value: string): void;
}) {
  return (
    <FormField label={label}>
      {(id) =>
        groups ? (
          <GroupedPicker
            id={id}
            value={value}
            head={choices}
            groups={groups}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
          />
        ) : (
          <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
            <Select.Trigger id={id} />
            <Select.Content>
              {choices.map((o) => (
                <Select.Item key={o.value} value={o.value}>
                  {o.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )
      }
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
  hint,
  values,
  choices,
  onChange,
}: {
  label: string;
  hint?: string;
  values: T[];
  choices: { value: T; label: string }[];
  onChange(value: T[]): void;
}) {
  return (
    <fieldset className="fallback-checks">
      <legend>{label}</legend>
      {hint && <p className="muted small">{hint}</p>}
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
