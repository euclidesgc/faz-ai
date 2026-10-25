// O progresso do Conectar de um perfil (épica "ferramenta por modo", história 7), agora dentro de Conectar agentes:
// os passos, o que o passo atual espera da pessoa (a chave de API, a ciência do regime) e o erro preso a ele. O
// fluxo é do host (`src/extension/ai/connect.ts`); a tela só mostra, e a chave colada vai direto para ele.
import { useEffect, useState } from 'react';
import { Callout, TextField } from '@radix-ui/themes';
import { MODE_SHEET_LINES, type ModeSheetLine, type ToolModeEntry } from '../../../../shared/aiTools';
import { isReadyProfile, modeLabel, type AiProfile } from '../../../../shared/aiProfiles';
import { CONNECT_STEPS, type ConnectState, type ConnectStep, type ConnectSummary } from '../../../../shared/connect';
import { settings, ui } from '../../../commands';
import { formatDateTime, t, tn } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { isWeb } from '../../../vscode';
import { ActionButton, IconCheck, IconWarning } from '../../ui';

/** Os rótulos das oito linhas da ficha, na ordem de `MODE_SHEET_LINES`. */
export const SHEET_LABEL: Record<ModeSheetLine, string> = {
  controls: 'O que o board controla',
  regime: 'Contexto do card',
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
  review: 'Ciência do contexto aberto',
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
      ? t('a IA lê só o que o board prepara (regime exclusivo)')
      : s.regime === 'compatible'
        ? review
          ? t('a IA também lê a configuração do próprio agente (regime compatível, ciência {n})', { n: review })
          : t(
              'a IA também lê a configuração do próprio agente (regime compatível), sem a sua ciência: o perfil não roda até você dar a ciência',
            )
        : t('capacidades não verificadas'),
    s.models === null || s.models === undefined
      ? t('modelos da lista da extensão (o agente não informa os dele)')
      : tn(s.models, '1 modelo', '{n} modelos'),
  ];
  if (s.at) parts.push(formatDateTime(s.at));
  return parts.join(' · ');
}

/** O texto da ciência do regime compatível: o mesmo no Conectar e na lista dos perfis. */
export const reviewText = (name: string): string =>
  t(
    'O {name} roda com o contexto aberto (regime compatível): além do que o card entrega, ele carrega por conta própria arquivos de instruções e configuração que o board não montou. Isso gasta mais e pode trazer instruções que não estão no card. Permissões, MCP e delegação continuam decididos pelo card.',
    { name },
  );

/** O progresso do Conectar de um perfil: os passos, o que o passo atual espera da pessoa e o erro preso a ele. */
export function ConnectProgress({
  profile,
  state,
  mode,
  login,
}: {
  profile: AiProfile;
  state: ConnectState;
  mode?: ToolModeEntry;
  /**
   * entra na conta pela tela (o login no terminal que o board acompanha e, no fim, retoma o Conectar); sem ele, o
   * passo do login que falhou só abre o comando num terminal
   */
  login?: () => void;
}) {
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
  const accept = useAction(() => settings.reviewAiProfile(profile.id, true));
  /**
   * conectada no regime compatível, mas sem a ciência de agora (revogada depois): o passo da ciência volta a esperar
   * a pessoa, com o botão para dar de novo, em vez de "feito" ao lado do "sem ciência" do resumo
   */
  const reviewMissing = state.status === 'connected' && state.summary.regime === 'compatible' && !review;
  const reviewIndex = CONNECT_STEPS.indexOf('review');
  const current = CONNECT_STEPS.indexOf(state.step);
  const waitingKey = state.status === 'waiting' && state.needs === 'api-key';
  // o campo só limpa quando o fluxo passa do login (a chave foi aceita) ou termina: na recusa, o que a pessoa
  // colou fica no campo para ela conferir
  const pastSignIn = state.status === 'connected' || current > CONNECT_STEPS.indexOf('signIn');
  useEffect(() => {
    if (pastSignIn && !changing) setApiKey('');
  }, [pastSignIn, changing, state.step, state.status]);
  const stepState = (i: number): string => {
    if (reviewMissing && i === reviewIndex) return t('espera você');
    if (state.status === 'connected' || i < current) return t('feito');
    if (i > current) return t('a seguir');
    return t(state.status === 'running' ? 'em curso' : state.status === 'waiting' ? 'espera você' : 'falhou');
  };
  const steps = (
    <ol className="connect-steps" aria-label={t('Passos do Conectar')}>
      {CONNECT_STEPS.map((step, i) => (
        <li
          key={step}
          data-state={
            reviewMissing && i === reviewIndex
              ? 'waiting'
              : state.status === 'connected' || i < current
                ? 'done'
                : i === current
                  ? state.status
                  : 'next'
          }
        >
          {t(STEP_NAMES[step])}: <span className="muted">{stepState(i)}</span>
        </li>
      ))}
    </ol>
  );
  const sendKey = async () => {
    if (await connect.run({ apiKey })) setChanging(false);
  };
  return (
    <div className="connect-progress" aria-busy={state.status === 'running' || connect.busy}>
      {state.status === 'connected' ? (
        <>
          {/* pronto, uma linha basta: os passos, o resumo técnico e a ficha do modo ficam em "Ver detalhes" */}
          <p role="status" className="row">
            {reviewMissing ? <IconWarning /> : <IconCheck />}
            {reviewMissing
              ? t('Falta a sua ciência: o agente não roda cards até você dá-la.')
              : state.summary.at
                ? t('Pronto para rodar cards · conferido em {date}', { date: formatDateTime(state.summary.at) })
                : t('Pronto para rodar cards')}
          </p>
          <details className="connect-details" open={reviewMissing}>
            <summary>{t('Ver detalhes')}</summary>
            {steps}
            <p className="muted small">{connectionSummary(state.summary, review)}</p>
            {mode && (
              <>
                <p className="muted small">{t('Como funciona o modo {mode}', { mode: modeLabel(mode.mode) })}</p>
                <ModeSheetList mode={mode} />
              </>
            )}
            {/* revogar é raro: fica com os detalhes do regime, não entre as ações da linha */}
            {review !== null && (
              <ActionButton
                size="1"
                variant="soft"
                color="gray"
                hint={t('Tira a sua ciência do regime compatível: o perfil deixa de rodar até você dar a ciência de novo.')}
                loading={revoke.busy}
                onClick={() => void revoke.run()}
              >
                {t('Parar de usar com o contexto aberto')}
              </ActionButton>
            )}
          </details>
          {reviewMissing && <p>{reviewText(profile.name)}</p>}
          <div className="row end">
            {reviewMissing && (
              <ActionButton
                size="1"
                hint={t('Dá de novo a sua ciência do regime compatível: o perfil volta a rodar, sem refazer o Conectar.')}
                loading={accept.busy}
                onClick={() => void accept.run()}
              >
                {t('Usar assim mesmo')}
              </ActionButton>
            )}
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
          </div>
        </>
      ) : (
        steps
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
              {t('Usar assim mesmo')}
            </ActionButton>
          </div>
        </Callout.Root>
      )}
      {state.status === 'failed' && (
        <div className="row">
          {state.command && <code>{state.command}</code>}
          {state.command && login && (
            <ActionButton
              size="1"
              variant="soft"
              hint={t('Abre o login num terminal; quando ele fechar, o board confere a conta e retoma o Conectar sozinho.')}
              onClick={login}
            >
              {t('Entrar no terminal')}
            </ActionButton>
          )}
          {state.command && !login && !isWeb && (
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

/** A ficha de um modo, linha a linha: o que o board controla, o regime, a precisão, o consumo, a cobrança… */
export function ModeSheetList({ mode }: { mode: ToolModeEntry }) {
  return (
    <dl className="mode-sheet">
      {MODE_SHEET_LINES.map((line) => (
        <div key={line}>
          <dt>{t(SHEET_LABEL[line])}</dt>
          <dd>{t(mode.sheet[line])}</dd>
        </div>
      ))}
    </dl>
  );
}
