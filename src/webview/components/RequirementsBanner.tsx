import { useState, type ReactNode } from 'react';
import { profileLabel } from '../../shared/aiProfiles';
import type { BoardState, Card } from '../../shared/model';
import { defaultTarget, runTargetOf } from '../../shared/runTarget';
import { cliProblem, type BoardRequirement } from '../../shared/requirements';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ui } from '../commands';
import { useAction } from '../useAction';
import { isWeb } from '../vscode';
import { Button, IconCheck, IconWarning, type ButtonVariant } from './ui';

/** A cor do ícone de atenção: nenhum perfil disponível é erro, o resto que falta é atenção, e o que só é recomendado fica discreto. */
export type RequirementsAlertLevel = 'error' | 'warn' | 'recommended';

/** O problema de um perfil, em poucas palavras, para o título do aviso. */
function profileProblemTitle(problem: BoardRequirement['problem'], name: string): string {
  switch (problem) {
    case 'cli':
      return t('{name}: linha de comando não encontrada', { name });
    case 'signin':
      return t('{name}: sem login', { name });
    case 'unvalidated':
      return t('{name}: não validado', { name });
    case 'stale':
      return t('{name}: precisa verificar de novo', { name });
    case 'not-admissible':
      return t('{name}: não admissível', { name });
    case 'evidence-invalidated':
      return t('{name}: a verificação de capacidades perdeu a validade', { name });
    case 'pending-review':
    default:
      return t('{name}: pendente de revisão', { name });
  }
}

/** Título e explicação de cada requisito, no idioma da interface. */
export function requirementTexts(r: BoardRequirement): { title: string; detail: string } {
  switch (r.id) {
    case 'node':
      return {
        title: t('Node.js não encontrado'),
        detail: t(
          'O servidor do board (o MCP pelo qual a IA lê e altera o board) roda com o Node.js 22 ou mais novo, e ele não está no PATH do terminal. Sem ele, a IA não alcança o board. Instale o Node.js e clique em Verificar de novo.',
        ),
      };
    case 'no-profile':
      return {
        title:
          r.reason === 'no-enabled'
            ? t('Nenhum perfil de CLI está ligado')
            : r.reason === 'unvalidated'
              ? t('Nenhum perfil de CLI foi validado: teste um perfil para o board trabalhar com a IA')
              : t('Nenhum perfil de CLI está disponível para o board trabalhar com a IA'),
        detail:
          r.reason === 'no-enabled'
            ? t(
                'Sem um perfil ligado não rodam os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo. Ligue um perfil de CLI para o board trabalhar com a IA.',
              )
            : t(
                'Sem um perfil disponível não rodam os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo. Veja o que falta em cada perfil no Diagnóstico do ambiente.',
              ),
      };
    case 'profile': {
      const name = r.name ?? r.profile ?? '';
      return {
        title: profileProblemTitle(r.problem, name),
        detail:
          r.problem === 'cli'
            ? t(
                'O board não encontrou a linha de comando deste perfil. Os cards que dependem dele não rodam; os dos outros perfis seguem. Veja como instalar no Diagnóstico do ambiente.',
              )
            : r.problem === 'signin'
              ? t(
                  'A linha de comando está instalada, mas sem login: as execuções deste perfil falham antes de começar. Entre na conta e clique em Verificar de novo.',
                )
              : r.problem === 'unvalidated' || r.problem === 'stale'
                ? t(
                    'Este perfil ainda não foi testado, ou a linha de comando mudou desde o último teste. Veja o estado dele no Diagnóstico do ambiente.',
                  )
                : r.problem === 'evidence-invalidated'
                  ? r.automatic
                    ? t(
                        'A linha de comando, o ambiente ou a extensão mudou desde a última verificação deste perfil, e a prova gravada deixou de valer. O board já está verificando de novo, sem gastar a sua conta; o resultado fica em Saída › Faz AI.',
                      )
                    : r.action?.kind === 'connect'
                      ? t(
                          'A linha de comando, o ambiente ou a extensão mudou desde a última verificação deste perfil, e a prova gravada deixou de valer. Clique em Reconectar neste perfil, em Ferramentas de IA: a verificação faz parte do Conectar.',
                        )
                      : t(
                          'A linha de comando, o ambiente ou a extensão mudou desde a última verificação deste perfil, e a prova gravada deixou de valer. Clique em Verificar capacidades neste perfil, em Ferramentas de IA.',
                        )
                  : r.problem === 'not-admissible'
                    ? t('O regime em vigor não admite este perfil. Veja o motivo no Diagnóstico do ambiente.')
                    : t('Este perfil foi importado e espera revisão. O board não roda nenhum comando dele enquanto isso.'),
      };
    }
    case 'harness': {
      const issue: Record<string, string> = {
        artifacts: t('nenhuma skill, agente ou servidor MCP em modo "Pelo card"'),
        agents: t('nenhum agente do board'),
        rules: t('regras no board ainda desligadas, sem revisão'),
        missing: t('artefato do board que sumiu da origem'),
        isolation: t('artefatos que a CLI carrega sem passar pelo board'),
      };
      return {
        title: t('O harness do board ainda não está definido'),
        detail: t(
          'O board funciona assim, mas as execuções não ganham a economia e a precisão de um harness definido. Falta: {list}. Resolva em Configurações → Harness.',
          {
            list: (r.harnessIssues ?? []).map((i) => issue[i] ?? i).join('; '),
          },
        ),
      };
    }
  }
}

/** Um comando com botão de copiar; sem área de transferência, o comando fica selecionável. */
export function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <span className="requirement-command">
      <code style={{ userSelect: 'all' }}>{command}</code>
      <Button
        size="small"
        onClick={() => {
          if (!navigator.clipboard?.writeText) return setState('failed');
          navigator.clipboard.writeText(command).then(
            () => setState('copied'),
            () => setState('failed'),
          );
        }}
      >
        {t('Copiar comando')}
      </Button>
      <span role="status" className="small">
        {state === 'copied' && (
          <>
            <IconCheck /> {t('Copiado')}
          </>
        )}
        {state === 'failed' && t('Não foi possível copiar. Selecione o comando e copie com o teclado.')}
      </span>
    </span>
  );
}

/**
 * Por que os botões de IA do card não rodam agora, no idioma da interface; null quando rodam. Além
 * da permissão que a ferramenta não aceita, o board sem nenhum perfil de CLI disponível, a CLI que falta ou está sem
 * login, ou o login que venceu. Só conta o perfil que executaria o `card` (`runTargetOf`), ou o padrão sem card: o
 * problema de outro perfil não bloqueia.
 */
export function aiBlockedReason(state: BoardState, card?: Card): string | null {
  if (state.aiRunUnsupported) return t(state.aiRunUnsupported);
  // nenhum perfil disponível bloqueia qualquer execução
  const none = state.requirements.find((r) => r.id === 'no-profile');
  if (none) return t('{title}: veja em Configurações → Verificar ambiente.', { title: requirementTexts(none).title });
  const target = card ? runTargetOf(state, card) : defaultTarget(state.board);
  // escolha explícita inválida: quem executa trata o bloqueio à parte
  if (!target) return null;
  const tool = target.cli.name;
  switch (cliProblem(state, target.cli.id)) {
    case 'expired':
      return t('O login do {tool} venceu: veja em Configurações → Verificar ambiente.', { tool });
    case 'cli':
      return t('A linha de comando do {tool} não foi encontrada: veja em Configurações → Verificar ambiente.', { tool });
    case 'signin':
      return t('A linha de comando do {tool} está sem login: veja em Configurações → Verificar ambiente.', { tool });
    default:
      return null;
  }
}

/** O nome do perfil de CLI que trabalha no card: o da execução em curso, senão o que o executaria. */
export function cardToolLabel(state: BoardState, card: Card): string {
  const running = state.aiActivity.find((a) => a.cardId === card.id);
  if (running) return profileLabel(state.board, running.tool);
  return (runTargetOf(state, card) ?? defaultTarget(state.board)).cli.name;
}

/** Se o requisito tem um botão ou comando que o resolve por aqui (na versão compacta, sem o atalho para as Configurações). */
function actionable(r: BoardRequirement, compact: boolean): boolean {
  const kind = r.action?.kind;
  // o Diagnóstico e as Configurações não existem no chat compacto
  if (kind === 'settings' || kind === 'diagnostic' || kind === 'connect' || kind === 'aiTools') return !compact;
  return kind === 'command';
}

/** A ação que resolve o requisito: o comando com copiar, ou o botão que leva ao Diagnóstico ou ao Harness. */
export function RequirementFix({
  r,
  compact = false,
  variant,
}: {
  r: BoardRequirement;
  compact?: boolean;
  /** no diagnóstico do ambiente, a ação que resolve o item é `primary`; no aviso fica a padrão */
  variant?: ButtonVariant;
}) {
  const openSettings = useBoardStore((s) => s.openSettings);
  const openEnvironment = useBoardStore((s) => s.openEnvironment);
  const openConnect = useBoardStore((s) => s.openConnect);
  if (!actionable(r, compact)) return null;
  const action = r.action!;
  switch (action.kind) {
    case 'command':
      return (
        <>
          <CopyCommand command={action.command} />
          {action.terminal && !isWeb && (
            <Button size="small" variant={variant} onClick={() => ui.openTerminal(action.command)}>
              {t('Abrir no terminal')}
            </Button>
          )}
        </>
      );
    case 'diagnostic':
      return (
        <Button size="small" variant={variant} onClick={() => openEnvironment(action.profile)}>
          {t('Ver no diagnóstico')}
        </Button>
      );
    case 'settings':
      return (
        <Button size="small" variant={variant} onClick={() => openSettings('harness')}>
          {t('Abrir Harness')}
        </Button>
      );
    // a ferramenta que entra por chave de API: o login é o Conectar, em Ferramentas de IA
    case 'connect':
      return (
        <Button size="small" variant={variant} onClick={() => openConnect(action.profile)}>
          {t('Abrir o Conectar')}
        </Button>
      );
    // o perfil verificável sem Conectar (a cópia do Claude Code): o "Verificar capacidades" fica na lista de perfis
    case 'aiTools':
      return (
        <Button size="small" variant={variant} onClick={() => openSettings('aiTools')}>
          {t('Abrir Ferramentas de IA')}
        </Button>
      );
  }
}

/** Um item do aviso: título, explicação e a ação que o resolve. */
function Item({ r, compact }: { r: BoardRequirement; compact: boolean }) {
  const { title, detail } = requirementTexts(r);
  return (
    <li>
      <strong>
        {title}
        {r.optional && <span className="muted"> · {t('recomendado')}</span>}
      </strong>
      {/* na versão compacta (o painel de chat) a explicação só fica de fora quando há um botão que resolve;
          no recomendado, a explicação é o motivo do aviso: fica até na versão compacta */}
      {(!compact || !actionable(r, compact) || r.optional) && <p>{detail}</p>}
      <RequirementFix r={r} compact={compact} />
    </li>
  );
}

/** "Verificar de novo", com retorno: conferindo, e o resultado quando nada mudou. */
function RecheckButton() {
  // o host confirma (`done`) quando a conferência termina; a falha chega como erro e destrava o botão
  const check = useAction(() => ui.checkRequirements());
  const [checked, setChecked] = useState(false);
  return (
    <>
      <span role="status" className="small muted">
        {check.busy ? t('Conferindo…') : checked ? t('Conferido agora: nada mudou.') : null}
      </span>
      <Button
        size="small"
        variant="ghost"
        loading={check.busy}
        onClick={async () => {
          setChecked(false);
          setChecked(await check.run());
        }}
      >
        {t('Verificar de novo')}
      </Button>
    </>
  );
}

/** O que falta para o board trabalhar com a IA. */
function useRequirementItems(): { items: BoardRequirement[]; missing: number; blocked: boolean } {
  const items = useBoardStore((s) => s.state?.requirements ?? []);
  return {
    items,
    missing: items.filter((r) => !r.optional).length,
    // nenhum perfil disponível é mais urgente que os outros requisitos (vale para o board inteiro, não só um card): destaque de erro
    blocked: items.some((r) => r.id === 'no-profile'),
  };
}

/** O resumo do aviso: o que bloqueia, quantos requisitos faltam, quantos perfis precisam de atenção, ou só o recomendado. */
function requirementsSummary(items: BoardRequirement[], missing: number): string {
  const none = items.find((r) => r.id === 'no-profile');
  if (none) return requirementTexts(none).title;
  if (missing > 0)
    return missing === 1
      ? t('Falta 1 requisito para o board trabalhar com a IA')
      : t('Faltam {n} requisitos para o board trabalhar com a IA', { n: missing });
  const profiles = items.filter((r) => r.id === 'profile').length;
  if (profiles > 0)
    return profiles === 1 ? t('1 perfil de CLI precisa de atenção') : t('{n} perfis de CLI precisam de atenção', { n: profiles });
  return t('Recomendado: defina o harness para as execuções gastarem menos contexto');
}

const itemKey = (r: BoardRequirement) => `${r.id}:${r.profile ?? ''}`;

/**
 * O aviso compacto do que falta, no lugar da faixa no topo do board: o ícone de atenção (na aba Configurações
 * e no Verificar ambiente) e o hint dele, com o resumo e o nome de cada item. null quando não falta nada.
 */
export function useRequirementsAlert(): { level: RequirementsAlertLevel; label: string; hint: ReactNode } | null {
  const { items, missing, blocked } = useRequirementItems();
  if (!items.length) return null;
  const label = requirementsSummary(items, missing);
  const warn = missing > 0 || items.some((r) => r.id === 'profile');
  return {
    level: blocked ? 'error' : warn ? 'warn' : 'recommended',
    label,
    hint: (
      <>
        <p>
          <strong>{label}</strong>
        </p>
        <ul>
          {items.map((r) => (
            <li key={itemKey(r)}>{requirementTexts(r).title}</li>
          ))}
        </ul>
        <p className="muted">{t('Veja como resolver em Configurações → Verificar ambiente.')}</p>
      </>
    ),
  };
}

/** O ícone de atenção do aviso, ao lado do nome do botão; o resumo vai em texto para leitores de tela. */
export function RequirementsAlertIcon({ level, label }: { level: RequirementsAlertLevel; label: string }) {
  return (
    <>
      <IconWarning className={`requirements-alert ${level}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * O que falta para o board trabalhar com a ferramenta de IA, com a explicação e a ação de cada item.
 * No board, o aviso é o ícone de atenção de `useRequirementsAlert`; esta faixa fica no chat (compacta), que não tem
 * as Configurações. Some sozinha quando a última pendência é resolvida. O que é só recomendado (não
 * impede as execuções pelo board) não conta como pendência: sozinho, vira uma caixa discreta.
 */
export function RequirementsBanner({ compact = false }: { compact?: boolean }) {
  const { items, missing, blocked } = useRequirementItems();
  // a lista muda (algo foi resolvido): o "nada mudou" de antes não vale mais
  const key = items.map(itemKey).join();
  if (!items.length) return null;
  return (
    <section
      key={key}
      className={`banner requirements ${blocked ? 'error' : missing || items.some((r) => r.id === 'profile') ? 'warn' : 'recommended'} ${compact ? 'compact' : ''}`}
      role="region"
      aria-label={t('Requisitos do board')}
    >
      <div className="requirements-head">
        {(missing > 0 || items.some((r) => r.id === 'profile')) && <IconWarning />}
        <strong role="status">{requirementsSummary(items, missing)}</strong>
        <span className="spacer" />
        {/* a lista completa, com o que é só recomendado (git, GitHub CLI, Code Review Graph); o chat não tem a tela */}
        {!compact && (
          <Button size="small" variant="ghost" onClick={() => useBoardStore.getState().setView('environment')}>
            {t('Ver o diagnóstico completo')}
          </Button>
        )}
        <RecheckButton />
      </div>
      <ul>
        {items.map((r) => (
          <Item key={itemKey(r)} r={r} compact={compact} />
        ))}
      </ul>
    </section>
  );
}
