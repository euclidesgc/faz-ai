// O Conectar ferramenta (épica "ferramenta por modo", história 7): a lista fixa das ferramentas que a extensão
// traz (`TOOLS`), um cartão por modo oferecido com a mesma ficha em cada um, o selo Recomendado só quando o
// modo recomendado é oferecido, e o progresso do Conectar de cada perfil, com o erro preso ao passo. A tela
// só mostra: o fluxo é do host (`src/extension/ai/connect.ts`), e a chave colada vai direto para ele.
import { useEffect, useState } from 'react';
import { Badge, Callout, Card, TextField } from '@radix-ui/themes';
import {
  MODE_SHEET_LINES,
  TOOLS,
  recommendedOffered,
  toolEntry,
  type AiToolEntry,
  type ModeSheetLine,
  type ToolModeEntry,
} from '../../../shared/aiTools';
import { isReadyProfile, modeLabel, type AiProfile } from '../../../shared/aiProfiles';
import { CONNECT_STEPS, type ConnectState, type ConnectStep, type ConnectSummary } from '../../../shared/connect';
import { settings, ui } from '../../commands';
import { formatDateTime, t, tn } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { useAction } from '../../useAction';
import { isWeb } from '../../vscode';
import { ActionButton, IconCheck, IconWarning } from '../ui';
import { SectionHeader } from './SectionHeader';

/** Os rótulos das oito linhas da ficha, na ordem de `MODE_SHEET_LINES`. */
const SHEET_LABEL: Record<ModeSheetLine, string> = {
  controls: 'O que o board controla',
  regime: 'Regime esperado',
  precision: 'Precisão do que foi usado',
  consumption: 'Consumo',
  brings: 'O que a ferramenta traz',
  signIn: 'Como se entra',
  billing: 'Cobrança',
  whenToChoose: 'Quando escolher',
};
export const STEP_NAMES: Record<ConnectStep, string> = {
  locate: 'Achar a ferramenta',
  signIn: 'Entrar na conta',
  verify: 'Verificar as capacidades',
  review: 'Ciência do regime',
  models: 'Ler os modelos',
};

/**
 * O perfil do catálogo que conecta a ferramenta: o pronto, cujo id é a própria ferramenta. É um perfil por
 * ferramenta, com o modo trocável (história 10): o cartão de outro modo conecta o mesmo perfil, que passa
 * para aquele modo quando o login dá certo.
 */
export const catalogProfileOf = (profiles: readonly AiProfile[], tool: string): AiProfile | undefined =>
  profiles.find((p) => isReadyProfile(p) && p.tool === tool);

/**
 * "Conectada · 0.65.0 · chave de API guardada · regime compatível (ciência 1) · 6 modelos · data". A ciência é a de
 * agora (`review`, do runner do board), não a da hora da conexão: revogada depois, o resumo diz que falta.
 */
export function connectionSummary(s: Partial<ConnectSummary>, review: number | null = s.reviewed ?? null): string {
  // o modo API não tem binário nem versão: a chave conferida é o que diz que ele está pronto
  const checked = s.signIn === 'api-key-checked';
  const parts = [
    ...(checked && !s.version ? [] : [s.version ?? t('versão desconhecida')]),
    t(
      checked
        ? 'chave de API conferida'
        : s.signIn === 'api-key'
          ? 'chave de API guardada'
          : s.signIn === 'signed-in'
            ? 'login confirmado'
            : 'login não verificado',
    ),
    s.regime === 'exclusive'
      ? t('regime exclusivo')
      : s.regime === 'compatible'
        ? review
          ? t('regime compatível (ciência {n})', { n: review })
          : t('regime compatível, sem ciência: o perfil não roda até você dar a ciência')
        : t('sem sonda de capacidades'),
    s.models === null || s.models === undefined ? t('lista de modelos embutida') : tn(s.models, '1 modelo', '{n} modelos'),
  ];
  if (s.at) parts.push(formatDateTime(s.at));
  return parts.join(' · ');
}

/** O texto da ciência do regime compatível: o mesmo no Conectar e na lista dos perfis. */
export const reviewText = (name: string): string =>
  t(
    'O {name} roda no regime compatível: ele carrega por conta própria arquivos de instruções e configuração que o board não montou. Permissões, MCP e delegação continuam decididos pelo card.',
    { name },
  );

/** O progresso do Conectar de um perfil: os passos, o que o passo atual espera da pessoa e o erro preso a ele. */
export function ConnectProgress({ profile, state, mode }: { profile: AiProfile; state: ConnectState; mode?: ToolModeEntry }) {
  const [apiKey, setApiKey] = useState('');
  /** "Trocar a chave" aberto no cartão conectado */
  const [changing, setChanging] = useState(false);
  const review = useBoardStore((s) => s.state?.board.runner.compatibilityReviews?.[profile.id] ?? null);
  // o modo do cartão vai junto: "Tentar de novo" e a chave continuam o Conectar deste modo
  const connect = useAction((input: { apiKey?: string; acknowledge?: boolean }) =>
    settings.connectAiProfile(profile.id, mode ? { ...input, mode: mode.mode } : input),
  );
  /**
   * no modo API e na CLI (que entra por chave) a chave é conferida agora, pela API; no ACP o agente a aceita sem
   * consultar a rede. Só o Gemini entra por chave numa CLI do catálogo: nas outras o cartão não pede chave
   */
  const checksNow = mode?.mode === 'api' || mode?.mode === 'cli';
  const revoke = useAction(() => settings.reviewAiProfile(profile.id, false));
  const current = CONNECT_STEPS.indexOf(state.step);
  const waitingKey = state.status === 'waiting' && state.needs === 'api-key';
  // o campo só limpa quando o fluxo passa do login (a chave foi aceita) ou termina: na recusa, o que a pessoa
  // colou fica no campo para ela conferir
  const pastSignIn = state.status === 'connected' || current > CONNECT_STEPS.indexOf('signIn');
  useEffect(() => {
    if (pastSignIn && !changing) setApiKey('');
  }, [pastSignIn, changing, state.step, state.status]);
  const stepState = (i: number): string => {
    if (state.status === 'connected' || i < current) return t('feito');
    if (i > current) return t('a seguir');
    return t(state.status === 'running' ? 'em curso' : state.status === 'waiting' ? 'espera você' : 'falhou');
  };
  const sendKey = async () => {
    if (await connect.run({ apiKey })) setChanging(false);
  };
  return (
    <div className="connect-progress" aria-busy={state.status === 'running' || connect.busy}>
      <ol className="connect-steps" aria-label={t('Passos do Conectar')}>
        {CONNECT_STEPS.map((step, i) => (
          <li key={step} data-state={state.status === 'connected' || i < current ? 'done' : i === current ? state.status : 'next'}>
            {t(STEP_NAMES[step])}: <span className="muted">{stepState(i)}</span>
          </li>
        ))}
      </ol>
      {state.status === 'connected' && (
        <>
          <p role="status" className="row">
            <IconCheck /> {t('Conectada')} · {connectionSummary(state.summary, review)}
          </p>
          <div className="row end">
            {(state.summary.signIn === 'api-key' || state.summary.signIn === 'api-key-checked') && !changing && (
              <ActionButton
                size="1"
                variant="soft"
                color="gray"
                hint={t('Guarda outra chave no cofre e refaz o login e a verificação.')}
                onClick={() => setChanging(true)}
              >
                {t('Trocar a chave')}
              </ActionButton>
            )}
            {review !== null && (
              <ActionButton
                size="1"
                variant="soft"
                color="gray"
                hint={t('Tira a sua ciência do regime compatível: o perfil deixa de rodar até você dar a ciência de novo.')}
                loading={revoke.busy}
                onClick={() => void revoke.run()}
              >
                {t('Revogar ciência')}
              </ActionButton>
            )}
          </div>
        </>
      )}
      {state.error && (
        <Callout.Root color={state.status === 'failed' ? 'red' : 'amber'} size="1" role="alert">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(state.error)}</Callout.Text>
        </Callout.Root>
      )}
      {(waitingKey || changing) && (
        <form
          className="connect-key"
          onSubmit={(e) => {
            e.preventDefault();
            void sendKey();
          }}
        >
          <label htmlFor={`connect-key-${profile.id}`}>{t('Chave de API')}</label>
          <TextField.Root
            id={`connect-key-${profile.id}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('Cole a chave aqui')}
          />
          <p className="muted small">
            {mode?.mode === 'cli'
              ? t(
                  'O board confere a chave agora, lendo a lista de modelos da conta pela API do Gemini (não gasta a conta). Aceita, ela fica guardada no cofre deste computador, a mesma para todos os modos, e vai para a CLI só no ambiente de cada execução; ela não volta para esta tela. Recusada, a chave guardada antes continua.',
                )
              : checksNow
                ? t(
                    'O board confere a chave agora, lendo a lista de modelos da conta pela API do Gemini (não gasta a conta). Aceita, ela fica guardada no cofre deste computador, a mesma para todos os modos, e vai à API só no cabeçalho; ela não volta para esta tela. Recusada, a chave guardada antes continua.',
                  )
                : t(
                    'A chave fica guardada no cofre deste computador e vai para o login da ferramenta; ela não volta para esta tela. A ferramenta a confere de fato na primeira execução: uma chave errada aparece ali, com a mensagem dela.',
                  )}
          </p>
          <div className="row end">
            {changing && (
              <ActionButton
                variant="soft"
                color="gray"
                type="button"
                hint={t('Fecha o campo sem trocar a chave guardada.')}
                onClick={() => {
                  setChanging(false);
                  setApiKey('');
                }}
              >
                {t('Cancelar')}
              </ActionButton>
            )}
            <ActionButton
              type="submit"
              hint={t(
                checksNow
                  ? 'Confere a chave com a API, guarda no cofre e continua o Conectar.'
                  : 'Guarda a chave no cofre e continua o Conectar.',
              )}
              disabled={!apiKey.trim()}
              loading={connect.busy}
            >
              {t(checksNow ? 'Conferir e guardar a chave' : 'Guardar a chave e continuar')}
            </ActionButton>
          </div>
        </form>
      )}
      {state.status === 'waiting' && state.needs === 'review' && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {reviewText(profile.name)}
            {mode && ` ${t('O que ele traz: {brings}.', { brings: t(mode.sheet.brings) })}`}
          </Callout.Text>
          <div className="row end">
            <ActionButton
              hint={t('Grava a sua ciência para este perfil; a revisão sobe a cada vez.')}
              loading={connect.busy}
              onClick={() => void connect.run({ acknowledge: true })}
            >
              {t('Entendo o que a ferramenta carrega')}
            </ActionButton>
          </div>
        </Callout.Root>
      )}
      {state.status === 'failed' && (
        <div className="row">
          {state.command && <code>{state.command}</code>}
          {state.command && !isWeb && (
            <ActionButton
              size="1"
              variant="soft"
              hint={t('Abre um terminal com o comando de login.')}
              onClick={() => ui.openTerminal(state.command!)}
            >
              {t('Abrir no terminal')}
            </ActionButton>
          )}
          {state.docs && (
            <a href={state.docs} target="_blank" rel="noopener noreferrer">
              {t('Instalar')}
            </a>
          )}
          <ActionButton hint={t('Retoma o Conectar do passo em que parou.')} loading={connect.busy} onClick={() => void connect.run({})}>
            {t('Tentar de novo')}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

/** Um cartão de modo: a ficha, o selo Recomendado (só no modo recomendado oferecido) e o Conectar. */
function ModeCard({ tool, mode, recommended }: { tool: AiToolEntry; mode: ToolModeEntry; recommended: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const profile = catalogProfileOf(state.board.aiProfiles, tool.id);
  /** o perfil da ferramenta está neste modo (é por ele que os cards rodam) */
  const inUse = profile?.mode === mode.mode;
  // a conexão é do perfil, e o cartão mostra a deste modo: a em curso dele, ou a concluída do modo em uso
  const raw = profile ? state.connections?.[profile.id] : undefined;
  const connection = raw && (raw.mode ?? profile!.mode) === mode.mode ? raw : undefined;
  const connect = useAction(() => settings.connectAiProfile(profile!.id, { mode: mode.mode }));
  const title = `${tool.name} · ${modeLabel(mode.mode as AiProfile['mode'])}`;
  return (
    <Card className="connect-mode" aria-label={title}>
      <div className="connect-mode-head">
        <strong>{title}</strong>
        {recommended && (
          <Badge color="indigo" variant="solid">
            {t('Recomendado')}
          </Badge>
        )}
        {inUse && profile?.enabled && (
          <Badge color="gray" variant="soft">
            {t('Modo em uso')}
          </Badge>
        )}
      </div>
      {recommended && <p className="small">{t(tool.recommended.reason)}</p>}
      <dl className="mode-sheet">
        {MODE_SHEET_LINES.map((line) => (
          <div key={line}>
            <dt>{t(SHEET_LABEL[line])}</dt>
            <dd>{t(mode.sheet[line])}</dd>
          </div>
        ))}
      </dl>
      <div className="row end">
        <ActionButton
          hint={
            connection?.status === 'connected'
              ? t('Refaz o login, a verificação e a leitura dos modelos.')
              : inUse
                ? t('Acha a ferramenta, faz o login, verifica as capacidades e lê os modelos.')
                : t('Passa o perfil da ferramenta para este modo quando o login der certo, com a mesma chave e os mesmos modelos.')
          }
          disabled={!profile || raw?.status === 'running'}
          disabledReason={!profile ? t('Este modo ainda não tem perfil neste board.') : t('O Conectar está em curso.')}
          loading={connect.busy}
          onClick={() => void connect.run()}
        >
          {t(connection?.status === 'connected' ? 'Reconectar' : 'Conectar')}
        </ActionButton>
      </div>
      {profile && connection && <ConnectProgress profile={profile} state={connection} mode={mode} />}
    </Card>
  );
}

/** Ferramentas de IA › Conectar ferramenta. */
export function ConnectTool() {
  // o aviso do topo abre o Conectar já na ferramenta do perfil (o perfil pronto tem o id da ferramenta)
  const requested = useBoardStore((s) => s.connectTool);
  const [toolId, setToolId] = useState(requested && toolEntry(requested) ? requested : TOOLS[0]!.id);
  useEffect(() => {
    if (requested && toolEntry(requested)) setToolId(requested);
  }, [requested]);
  const tool = toolEntry(toolId) ?? TOOLS[0]!;
  const recommended = recommendedOffered(tool);
  return (
    <section className="connect-tool" aria-label={t('Conectar ferramenta')}>
      <SectionHeader id="connect-tool" title={t('Conectar ferramenta')}>
        {t(
          'Escolha a ferramenta e o modo. A extensão acha a ferramenta, faz o login, verifica o que ela carrega por conta própria e lê os modelos: o que fica com você é entrar na conta.',
        )}
      </SectionHeader>
      <div className="connect-layout">
        <ul className="connect-tools" aria-label={t('Ferramentas')}>
          {TOOLS.map((entry) => (
            <li key={entry.id}>
              <button type="button" aria-pressed={entry.id === tool.id} onClick={() => setToolId(entry.id)}>
                <strong>{entry.name}</strong>
                <span className="muted small">{t(entry.billing)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="connect-modes">
          <p className="small">
            {t(tool.billing)}{' '}
            <a href={tool.docs} target="_blank" rel="noopener noreferrer">
              {t('Página oficial')}
            </a>
          </p>
          {tool.modes.map((mode) => (
            <ModeCard key={mode.mode} tool={tool} mode={mode} recommended={recommended === mode.mode} />
          ))}
          {tool.planned.length > 0 && (
            <p className="muted small">
              {t('Ainda não oferecidos nesta versão: {modes}.', {
                modes: tool.planned.map((p) => modeLabel(p.mode as AiProfile['mode'])).join(', '),
              })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
