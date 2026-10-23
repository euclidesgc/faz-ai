// O Conectar ferramenta (épica "ferramenta por modo", história 7): a lista fixa das ferramentas que a extensão
// traz (`TOOLS`), um cartão por modo oferecido com a mesma ficha em cada um, o selo Recomendado só quando o
// modo recomendado é oferecido, e o progresso do Conectar de cada perfil, com o erro preso ao passo. A tela
// só mostra: o fluxo é do host (`src/extension/ai/connect.ts`), e a chave colada vai direto para ele.
import { useState } from 'react';
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

/** O perfil do catálogo que conecta a ferramenta neste modo: o pronto, cujo id é a própria ferramenta. */
export const catalogProfileOf = (profiles: readonly AiProfile[], tool: string, mode: string): AiProfile | undefined =>
  profiles.find((p) => isReadyProfile(p) && p.tool === tool && p.mode === mode);

/** "Conectada · 0.65.0 · chave de API no cofre · regime compatível (ciência 1) · 6 modelos · data". */
export function connectionSummary(s: Partial<ConnectSummary>): string {
  const parts = [
    s.version ?? t('versão desconhecida'),
    t(s.signIn === 'api-key' ? 'chave de API no cofre' : s.signIn === 'signed-in' ? 'login confirmado' : 'login não verificado'),
    s.regime === 'exclusive'
      ? t('regime exclusivo')
      : s.regime === 'compatible'
        ? t('regime compatível (ciência {n})', { n: s.reviewed ?? 0 })
        : t('sem sonda de capacidades'),
    s.models === null || s.models === undefined ? t('lista de modelos embutida') : tn(s.models, '1 modelo', '{n} modelos'),
  ];
  if (s.at) parts.push(formatDateTime(s.at));
  return parts.join(' · ');
}

/** O progresso do Conectar de um perfil: os passos, o que o passo atual espera da pessoa e o erro preso a ele. */
export function ConnectProgress({ profile, state, mode }: { profile: AiProfile; state: ConnectState; mode?: ToolModeEntry }) {
  const [apiKey, setApiKey] = useState('');
  const connect = useAction((input: { apiKey?: string; acknowledge?: boolean }) => settings.connectAiProfile(profile.id, input));
  const current = CONNECT_STEPS.indexOf(state.step);
  const stepState = (i: number): string => {
    if (state.status === 'connected' || i < current) return t('feito');
    if (i > current) return t('a seguir');
    return t(state.status === 'running' ? 'em curso' : state.status === 'waiting' ? 'espera você' : 'falhou');
  };
  const sendKey = async () => {
    // o campo só limpa quando o host confirma: se falhar, o que a pessoa colou fica
    if (await connect.run({ apiKey })) setApiKey('');
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
        <p role="status" className="row">
          <IconCheck /> {t('Conectada')} · {connectionSummary(state.summary)}
        </p>
      )}
      {state.error && (
        <Callout.Root color={state.status === 'failed' ? 'red' : 'amber'} size="1" role="alert">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>{t(state.error)}</Callout.Text>
        </Callout.Root>
      )}
      {state.status === 'waiting' && state.needs === 'api-key' && (
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
            {t('A chave vai só para o cofre deste computador e para o login da ferramenta; ela não volta para esta tela.')}
          </p>
          <div className="row end">
            <ActionButton
              type="submit"
              hint={t('Guarda a chave no cofre e continua o Conectar.')}
              disabled={!apiKey.trim()}
              loading={connect.busy}
            >
              {t('Guardar a chave e continuar')}
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
            {t(
              'O {name} roda no regime compatível: ele carrega por conta própria arquivos de instruções e configuração que o board não montou. Permissões, MCP e delegação continuam decididos pelo card.',
              { name: profile.name },
            )}
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
          <ActionButton hint={t('Refaz o Conectar a partir do começo.')} loading={connect.busy} onClick={() => void connect.run({})}>
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
  const profile = catalogProfileOf(state.board.aiProfiles, tool.id, mode.mode);
  const connection = profile ? state.connections?.[profile.id] : undefined;
  const connect = useAction(() => settings.connectAiProfile(profile!.id));
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
              : t('Acha a ferramenta, faz o login, verifica as capacidades e lê os modelos.')
          }
          disabled={!profile || connection?.status === 'running'}
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
  const [toolId, setToolId] = useState(TOOLS[0]!.id);
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
