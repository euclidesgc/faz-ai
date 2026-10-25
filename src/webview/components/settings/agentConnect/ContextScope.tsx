import { useState } from 'react';
import { Badge, Select, Text, TextField } from '@radix-ui/themes';
import type { AiProfile } from '../../../../shared/aiProfiles';
import {
  CONTEXT_KINDS,
  closedByConstruction,
  contextScopeState,
  leakTokens,
  locationKey,
  type ContextLocationKind,
  type ContextLocationResult,
  type ContextScopeReport,
  type UntestedReason,
} from '../../../../shared/contextScope';
import { settings } from '../../../commands';
import { formatDateTime, t, tn } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ContextLeak } from './ContextLeak';
import {
  ActionButton,
  ActionIconButton,
  FormField,
  Hint,
  IconInfo,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconTrash,
  IconWarning,
} from '../../ui';

const KIND_LABEL: Record<ContextLocationKind, string> = {
  instructions: 'instruções',
  rules: 'regras',
  memory: 'memória',
  skill: 'skills',
  agent: 'agentes',
  hook: 'hooks',
  mcp: 'servidores MCP',
  settings: 'configuração',
};

const UNTESTED_LABEL: Record<UntestedReason, string> = {
  'not-text': 'não verificável por este teste (não entra como texto)',
  pattern: 'caminho que o board não sabe resolver',
  'missing-user': 'não existe na sua pasta pessoal; o board não escreve nela',
  'no-line': 'existe, mas sem uma linha boa para citar',
  'control-failed': 'sem prova: o agente não citou nem a linha de controle',
  'used-tools': 'sem prova: o agente usou ferramentas no teste',
  'run-failed': 'o teste não rodou',
};

const WHY =
  'Com o contexto fechado, cada card gasta só o necessário e segue só as instruções dele. Aberto, a IA também lê arquivos da própria ferramenta: gasta mais e pode seguir instruções que não estão no card.';

/** A coluna "No board": o veredito do teste, a única fonte da conclusão. */
function Verdict({ loc }: { loc: ContextLocationResult }) {
  const v = loc.verdict;
  if (v.state === 'leaks')
    return (
      <span className="context-verdict leaks">
        <IconWarning /> {t('entra sozinho')}
      </span>
    );
  if (v.state === 'controlled')
    return (
      <span className="context-verdict controlled">
        <IconLock />{' '}
        {t(v.how === 'canary' ? 'fica de fora: só entra se o card incluir (testado com isca)' : 'fica de fora: só entra se o card incluir')}
      </span>
    );
  return <span className="muted">{t(UNTESTED_LABEL[v.reason])}</span>;
}

/** A linha do resumo: fechado, aberto ou não verificado, e de onde vem a conclusão. */
function Summary({ report, current, kept }: { report: ContextScopeReport | undefined; current: string | null; kept: string[] }) {
  if (!report)
    return (
      <p className="row">
        <IconInfo /> {t('Ainda não testado: o board não sabe o que este agente lê sozinho.')}
      </p>
    );
  if (report.error)
    return (
      <p className="row" role="alert">
        <IconWarning /> {t('O teste não terminou: {error}', { error: report.error })}
      </p>
    );
  const state = contextScopeState(report);
  const when = formatDateTime(report.at);
  // os que a pessoa manteve não são problema a resolver: saem da lista e do custo, e o resumo diz que foi escolha dela
  const allLeaking = report.locations.filter((l) => l.verdict.state === 'leaks');
  const leaking = allLeaking.filter((l) => !kept.includes(locationKey(l)));
  const cost = leaking.reduce((sum, l) => sum + leakTokens(l), 0);
  const outdated = report.version && current && report.version !== current;
  // a frase diz o estado, quantos e quanto custa; os caminhos ficam na lista logo abaixo, com o que fazer em cada um
  const headline =
    state === 'closed' ? (
      <>
        <span className="context-tone closed">
          <IconLock /> <strong>{t('Contexto fechado:')}</strong>
        </span>{' '}
        {t('a IA usa só o que o card entrega.')}
      </>
    ) : state === 'open' && !leaking.length ? (
      <>
        <IconInfo /> <strong>{t('Contexto aberto por escolha sua:')}</strong>{' '}
        {tn(allLeaking.length, 'você manteve 1 local que entra em todo card.', 'você manteve {n} locais que entram em todo card.')}
      </>
    ) : state === 'open' ? (
      <>
        <span className="context-tone open">
          <IconLockOpen /> <strong>{t('Contexto aberto:')}</strong>
        </span>{' '}
        {tn(leaking.length, '1 local entra sozinho em todo card', '{n} locais entram sozinhos em todo card')}
        {cost > 0 ? ` ${tn(cost, '(~1 token).', '(~{n} tokens).')}` : '.'}
      </>
    ) : (
      <>
        <IconInfo />{' '}
        {report.discovered
          ? t('Não deu para verificar: nenhum local teve prova.')
          : t('O agente não disse onde lê; só os arquivos de instrução do projeto foram conferidos.')}
      </>
    );
  return (
    <>
      <p className="row context-headline" role="status">
        <span>{headline}</span>
      </p>
      <Text as="p" size="1" color="gray">
        {state === 'open' && leaking.length
          ? t('Verificado em {date}. Veja abaixo o que fazer com cada um.', { date: when })
          : t('Verificado em {date}.', { date: when })}
      </Text>
      {outdated && (
        <Text as="p" size="1" color="amber">
          {t('Testado na versão {old}; a atual é {now}. Teste de novo.', { old: report.version!, now: current })}
        </Text>
      )}
    </>
  );
}

/** Acrescentar um local que o agente esqueceu: só nesta máquina, e uma nova descoberta não apaga. */
function AddLocation({ profileId, onClose }: { profileId: string; onClose(): void }) {
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<ContextLocationKind>('instructions');
  const add = useAction(async () => {
    await settings.contextLocation(profileId, 'add', { path, scope: path.trim().startsWith('~') ? 'user' : 'project', kind });
    onClose();
  });
  return (
    <form
      className="context-add"
      onSubmit={(e) => {
        e.preventDefault();
        void add.run();
      }}
    >
      <FormField label={t('Caminho')} hint={t('Relativo à raiz do projeto, ou começando por ~/ na sua pasta pessoal. Aceita * e **.')}>
        {(id) => <TextField.Root id={id} value={path} placeholder="AGENTS.md" onChange={(e) => setPath(e.target.value)} />}
      </FormField>
      <FormField label={t('Tipo')}>
        {(id) => (
          <Select.Root value={kind} onValueChange={(v) => setKind(v as ContextLocationKind)}>
            <Select.Trigger id={id} />
            <Select.Content>
              {CONTEXT_KINDS.map((k) => (
                <Select.Item key={k} value={k}>
                  {t(KIND_LABEL[k])}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      </FormField>
      {add.error && <p role="alert">{t(add.error)}</p>}
      <div className="row end">
        <ActionButton variant="soft" color="gray" type="button" hint={t('Fecha sem acrescentar.')} onClick={onClose}>
          {t('Cancelar')}
        </ActionButton>
        <ActionButton
          type="submit"
          disabled={!path.trim()}
          disabledReason={t('Informe o caminho')}
          loading={add.busy}
          hint={t('O local entra no próximo teste.')}
        >
          {t('Acrescentar')}
        </ActionButton>
      </div>
    </form>
  );
}

const ORDER = { leaks: 0, controlled: 1, untested: 2 } as const;
const NO_KEPT: string[] = [];

/**
 * O contexto do card do agente: o que ele carrega sozinho além do que o card entrega. O agente declara onde a
 * ferramenta lê ("Padrão da ferramenta", só informativo) e o teste diz o que acontece quando o board roda ("No board").
 */
export function ContextScope({ profile }: { profile: AiProfile }) {
  const report = useBoardStore((s) => s.state?.contextScopes?.[profile.id]);
  const running = useBoardStore((s) => !!s.state?.contextScopeRunning?.includes(profile.id));
  const current = useBoardStore((s) => s.state?.connections?.[profile.id]?.summary.version ?? null);
  const kept = useBoardStore((s) => s.state?.contextKept?.[profile.id]) ?? NO_KEPT;
  const [adding, setAdding] = useState(false);
  const test = useAction(() => settings.testContextScope(profile.id));
  const remove = useAction((path: string, scope: 'project' | 'user', kind: ContextLocationKind) =>
    settings.contextLocation(profile.id, 'remove', { path, scope, kind }),
  );
  const rows = [...(report?.locations ?? [])].sort((a, b) => ORDER[a.verdict.state] - ORDER[b.verdict.state]);
  if (closedByConstruction(profile))
    return (
      <section className="context-scope" aria-label={t('Contexto do card')}>
        <Text size="2" weight="medium">
          {t('Contexto do card')}
        </Text>
        <p className="row" role="status">
          <IconLock />{' '}
          {t(
            'Contexto fechado por construção: no modo API o próprio board monta cada pedido, e nenhum programa lê arquivos por conta própria. Não há o que testar.',
          )}
        </p>
      </section>
    );
  return (
    <section className="context-scope" aria-label={t('Contexto do card')}>
      <div className="row">
        <Text size="2" weight="medium">
          {t('Contexto do card')}
        </Text>
        <Hint content={t(WHY)}>
          <span tabIndex={0} className="muted" aria-label={t('Por que isso importa')}>
            <IconInfo />
          </span>
        </Hint>
      </div>
      {running ? (
        <p className="row" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('Testando o que o agente lê sozinho… Gasta alguns pedidos da conta dele.')}
        </p>
      ) : (
        <Summary report={report} current={current} kept={kept} />
      )}
      {test.error && <p role="alert">{t(test.error)}</p>}
      {rows.length > 0 && (
        <details className="context-details" open={contextScopeState(report) === 'open'}>
          <summary>{t('O que este agente lê sozinho ({n} locais)', { n: rows.length })}</summary>
          {/* uma lista, não uma tabela: o painel do agente é estreito e o veredito não pode ficar cortado */}
          <ul className="context-list" aria-label={t('Locais')}>
            {rows.map((loc) => (
              <li key={`${loc.scope}:${loc.path}:${loc.kind}`} className="context-item">
                <div className="context-item-head">
                  <code>{loc.path}</code>
                  <Verdict loc={loc} />
                </div>
                {/* um local com curinga ou nas pastas acima vaza por arquivos: a lista vai numa linha própria */}
                {loc.verdict.state === 'leaks' && (loc.verdict.files.length > 1 || loc.verdict.files[0] !== loc.path) && (
                  <div className="context-files muted small">{t('Arquivos: {list}', { list: loc.verdict.files.join(', ') })}</div>
                )}
                {loc.verdict.state === 'leaks' && <ContextLeak profileId={profile.id} loc={loc} overlaps={report?.overlaps ?? []} />}
                <div className="context-item-meta muted small">
                  {t(KIND_LABEL[loc.kind])} · {t(loc.scope === 'user' ? 'seus arquivos' : 'projeto')}
                  {loc.loads && (
                    <>
                      {' · '}
                      {t('Padrão da ferramenta')}: {t(loc.loads === 'always' ? 'carrega sempre' : 'carrega quando combina')}
                    </>
                  )}
                  {loc.source !== 'agent' && (
                    <Badge color="gray" variant="soft" size="1">
                      {t(loc.source === 'person' ? 'acrescentado por você' : 'achado no projeto')}
                    </Badge>
                  )}
                  {loc.source === 'person' && (
                    <ActionIconButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      aria-label={t('Tirar {path}', { path: loc.path })}
                      hint={t('Tira o local que você acrescentou; vale no próximo teste.')}
                      onClick={() => void remove.run(loc.path, loc.scope, loc.kind)}
                    >
                      <IconTrash />
                    </ActionIconButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Text as="p" size="1" color="gray">
            {t(
              '"Padrão da ferramenta" é o que o agente declarou: como ela se comporta rodando sozinha. O veredito ao lado de cada local é o que o teste provou rodando como um card. Os arquivos da sua pasta pessoal só são lidos: o board nunca escreve neles.',
            )}
          </Text>
        </details>
      )}
      {adding && <AddLocation profileId={profile.id} onClose={() => setAdding(false)} />}
      <div className="row end">
        {!adding && (
          <ActionButton
            size="1"
            variant="soft"
            color="gray"
            hint={t('Um local que o agente lê e não declarou.')}
            onClick={() => setAdding(true)}
          >
            <IconPlus /> {t('Acrescentar um local')}
          </ActionButton>
        )}
        <ActionButton
          size="1"
          variant={report ? 'soft' : 'solid'}
          disabled={running || !profile.enabled}
          disabledReason={running ? t('O teste já está em curso.') : t('Ligue o agente antes.')}
          loading={test.busy && !running}
          hint={t(
            'Pergunta ao agente onde ele lê sozinho e confere pedindo que ele cite trechos desses arquivos, rodando como um card. Gasta alguns pedidos da conta dele.',
          )}
          onClick={() => void test.run()}
        >
          {t(report ? 'Testar de novo' : 'Testar agora')}
        </ActionButton>
      </div>
    </section>
  );
}
