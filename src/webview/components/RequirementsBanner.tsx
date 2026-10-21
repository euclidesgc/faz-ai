import { baseValue } from '../../shared/harness';
import { useMemo, useState, type ReactNode } from 'react';
import { baseInfo } from '../../shared/harness';
import { profileLabel } from '../../shared/aiProfiles';
import type { BoardState, Card } from '../../shared/model';
import { defaultTarget, profilesInUse, runTargetOf } from '../../shared/runTarget';
import { CLI_COMMAND, LOGIN_COMMAND, cliProblem, type BoardRequirement } from '../../shared/requirements';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { harness, ui } from '../commands';
import { useAction } from '../useAction';
import { FLOW_SKILL_NAME } from '../../shared/harnessProject';
import { isWeb } from '../vscode';
import { Button, IconCheck, IconConnect, IconWarning, type ButtonVariant } from './ui';

/** A cor do ícone de atenção: login vencido é erro, o resto que falta é atenção, e o que só é recomendado fica discreto. */
export type RequirementsAlertLevel = 'error' | 'warn' | 'recommended';

/** Título e explicação de cada requisito, no idioma da interface; com o `board`, o perfil leva o nome que a pessoa deu a ele. */
export function requirementTexts(r: BoardRequirement, board?: Pick<BoardState['board'], 'aiProfiles'>): { title: string; detail: string } {
  const tool = board ? profileLabel(board, r.tool) : baseInfo(r.tool).label;
  switch (r.id) {
    case 'node':
      return {
        title: t('Node.js não encontrado'),
        detail: t(
          'O servidor do board (o MCP pelo qual a IA lê e altera o board) roda com o Node.js 22 ou mais novo, e ele não está no PATH do terminal. Sem ele, o {tool} não alcança o board. Instale o Node.js e clique em Verificar de novo.',
          { tool },
        ),
      };
    case 'cli':
      return {
        title: t('A linha de comando do {tool} não foi encontrada', { tool }),
        detail: r.action
          ? t(
              'Sem ela não rodam os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo. O board procurou "{cli}" no PATH do terminal, nas pastas de instalação usuais e nas extensões do editor. Instale com o comando abaixo e clique em Verificar de novo.',
              { cli: r.cli ?? '' },
            )
          : t(
              'Sem ela não rodam os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo. O board procurou "{cli}" no PATH do terminal, nas pastas de instalação usuais e nas extensões do editor. Instale pelo site {where} e clique em Verificar de novo.',
              { cli: r.cli ?? '', where: r.where ?? '' },
            ),
      };
    case 'signin':
      return {
        title: t('A linha de comando do {tool} está sem login', { tool }),
        detail: t(
          'Ela está instalada, mas não entrou na conta: as execuções pelo board falham antes de começar. Rode o comando abaixo no terminal, conclua o login no navegador e clique em Verificar de novo.',
        ),
      };
    case 'mcp':
      return {
        title: t('O MCP do board (faz-ai) não está instalado no {tool}', { tool }),
        detail:
          r.tool === 'claude'
            ? t(
                'Nas conversas com o {tool} fora do board, a IA não enxerga os cards. As execuções pelo board não dependem disso. Conecte e aprove o servidor "faz-ai" quando a ferramenta pedir.',
                { tool },
              )
            : r.tool === 'cursor'
              ? t(
                  'Nas conversas com o Cursor no editor, a IA não enxerga os cards. As execuções pelo board registram o servidor sozinhas, mas a conversa no editor não. Conecte e ative o servidor "faz-ai" em Cursor Settings → MCP.',
                )
              : t(
                  'Nas conversas com o {tool} fora do board, a IA não enxerga os cards, e as execuções pelo board também dependem disso. Conecte e aprove o servidor "faz-ai" quando a ferramenta pedir.',
                  { tool },
                ),
      };
    case 'mcp-stale':
      return {
        title: t('O MCP do board no {tool} está desatualizado', { tool }),
        detail:
          r.action?.kind === 'fixProject'
            ? t(
                '{file} aponta para "{missing}", que não existe mais nesta máquina (um node trocado pelo nvm, ou o board instalado em outro lugar). O registro do projeto vale no lugar do global, então a ferramenta não consegue iniciar o servidor. Corrigir tira o registro deste arquivo e deixa valendo o global, com os caminhos atuais.',
                { file: r.file ?? '', missing: r.missing ?? '' },
              )
            : t(
                '{file} aponta para "{missing}", que não existe mais nesta máquina (um node trocado pelo nvm, ou o board instalado em outro lugar). A ferramenta não consegue iniciar o servidor. Conecte de novo para gravar o caminho atual.',
                { file: r.file ?? '', missing: r.missing ?? '' },
              ),
      };
    case 'mcp-elsewhere':
      return {
        title: t('O MCP do board no {tool} está registrado para outra pasta', { tool }),
        detail:
          r.action?.kind === 'fixProject'
            ? t(
                '{file} liga o servidor do board à pasta "{missing}", e não a este projeto (o arquivo veio de outra máquina pelo git, ou o projeto mudou de lugar). O registro do projeto vale no lugar do global, então a IA falaria com outro board, ou com nenhum. Corrigir tira o registro deste arquivo e deixa valendo o global.',
                { file: r.file ?? '', missing: r.missing ?? '' },
              )
            : t(
                '{file} liga o servidor do board à pasta "{missing}", e não a este projeto (o arquivo veio de outra máquina pelo git, ou o projeto mudou de lugar). A IA falaria com outro board, ou com nenhum. Conecte de novo para gravar a pasta atual.',
                { file: r.file ?? '', missing: r.missing ?? '' },
              ),
      };
    case 'mcp-outdated':
      return {
        title: t('O MCP do board no {tool} é de uma versão anterior', { tool }),
        detail: t(
          '{file} usa a ponte em "{missing}", de uma versão anterior da extensão, que não é mais atualizada e pode não achar o projeto aberto. Instale de novo para gravar o registro atual.',
          { file: r.file ?? '', missing: r.missing ?? '' },
        ),
      };
    case 'mcp-reload':
      return {
        title: t('MCP do board instalado no {tool}: recarregue a janela', { tool }),
        detail: t(
          'O MCP "faz-ai" é o canal pelo qual a IA do chat do Cursor lê e atualiza os cards deste board. Ele foi instalado em {file} depois que esta janela abriu, e o Cursor só lê os MCPs do projeto ao abrir a janela: recarregue para ele aparecer.',
          { file: r.file ?? '' },
        ),
      };
    case 'mcp-path':
      return {
        title: t('O {tool} não acha o comando do MCP do board', { tool }),
        detail: r.tracked
          ? t(
              '{file} inicia o MCP com "{missing}", que não está no PATH com que o editor abriu (o programa foi instalado depois, ou fica numa pasta que o editor não lê). O arquivo está no git, então o board não grava nele o caminho desta máquina: feche e abra o editor de novo, ou tire o arquivo do git.',
              { file: r.file ?? '', missing: r.missing ?? '' },
            )
          : t(
              '{file} inicia o MCP com "{missing}", que não está no PATH com que o editor abriu (o programa foi instalado depois, ou fica numa pasta que o editor não lê). Corrigir grava o caminho completo dele nesta máquina, e o arquivo fica fora do git; depois, recarregue a janela.',
              { file: r.file ?? '', missing: r.missing ?? '' },
            ),
      };
    case 'skill':
      return {
        title: t('A skill do fluxo ({name}) não está pronta para o {tool}', { name: FLOW_SKILL_NAME, tool }),
        detail: t(
          'É ela que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências. As execuções do board partem de contexto vazio: a skill precisa existir e estar no board em modo "Sempre" em Configurações → Harness. Instalar por aqui grava na pasta global de skills da ferramenta e já marca.',
        ),
      };
    case 'mcp-enable':
      return {
        title: t('Ative o MCP do board no {tool}', { tool }),
        detail: t(
          'O MCP "faz-ai" é o canal pelo qual a IA do chat do Cursor lê e atualiza os cards deste board. O Cursor deixa desativado todo MCP novo de um projeto, e só você pode ativá-lo: em Abrir MCPs do Cursor, clique em "faz-ai" e ligue a chave deste projeto.',
        ),
      };
    case 'harness': {
      const issue: Record<string, string> = {
        artifacts: t('nenhuma skill, agente ou servidor MCP em modo "Pelo card"'),
        agents: t('nenhum agente do board'),
        rules: t('regras no board ainda desligadas, sem revisão'),
        missing: t('artefato do board que sumiu da origem'),
        cursor: t('artefatos do projeto que entram no contexto sem passar pelo board'),
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
    case 'permission':
      return { title: t('O {tool} não roda com o nível de permissão escolhido', { tool }), detail: t(r.reason ?? '') };
    case 'permission-mcp':
      return {
        title: t('O {tool} pede aprovação para cada ferramenta do board', { tool }),
        detail: t(
          'Nas conversas com o {tool} fora do board, cada ferramenta do MCP "faz-ai" pede uma aprovação. Uma regra no {file} libera todas de uma vez; sem ela tudo funciona, mas com uma pergunta a cada chamada. As execuções pelo board não pedem nada.',
          { tool, file: r.file ?? '' },
        ),
      };
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
 * da permissão que a ferramenta não aceita, a CLI que falta ou está sem login: o clique só daria erro.
 * Só conta o perfil que executaria o `card` (`runTargetOf`), ou o padrão sem card: o problema de outro perfil não bloqueia.
 */
export function aiBlockedReason(state: BoardState, card?: Card): string | null {
  if (state.aiRunUnsupported) return t(state.aiRunUnsupported);
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

/** Botão que resolve um requisito pelo host (CLI, disco): mostra a espera até ele confirmar, e avisa quem confere de novo. */
function FixButton({
  variant,
  run,
  onFixed,
  children,
}: {
  variant?: ButtonVariant;
  run: () => Promise<void>;
  onFixed?: () => void;
  children: ReactNode;
}) {
  const fix = useAction(run);
  return (
    <Button
      size="small"
      variant={variant}
      loading={fix.busy}
      onClick={() => {
        void fix.run();
        onFixed?.();
      }}
    >
      {children}
    </Button>
  );
}

/** Se o requisito tem um botão ou comando que o resolve por aqui (na versão compacta, sem o atalho para as Configurações). */
function actionable(r: BoardRequirement, compact: boolean): boolean {
  const kind = r.action?.kind;
  // recarregar a janela e abrir os MCPs do editor só existem dentro do editor; no navegador, fica a explicação
  if (kind === 'reload' || kind === 'openEditorMcp') return !isWeb;
  if (kind === 'settings') return !compact;
  return (
    kind === 'command' ||
    kind === 'connect' ||
    kind === 'fixProject' ||
    kind === 'pinMcp' ||
    kind === 'installSkill' ||
    kind === 'allowKimiMcp'
  );
}

/**
 * A ação que resolve o requisito: o comando com copiar, ou o botão que faz. `onFixed` roda depois de
 * um botão que muda algo na máquina (o Diagnóstico confere de novo para o item mudar de estado).
 */
export function RequirementFix({
  r,
  compact = false,
  onFixed,
  variant,
}: {
  r: BoardRequirement;
  compact?: boolean;
  onFixed?: () => void;
  /** no diagnóstico do ambiente, a ação que resolve o item é `primary`; no aviso fica a padrão */
  variant?: ButtonVariant;
}) {
  const openSettings = useBoardStore((s) => s.openSettings);
  const openMcpInstall = () => {
    // a instalação do servidor do board fica no assunto MCPs, em Projeto, na aba da ferramenta do projeto
    useBoardStore.setState({ harnessTab: useBoardStore.getState().state!.board.aiTool, harnessOrigin: 'project', harnessTopic: 'mcp' });
    openSettings('harness');
  };
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
    case 'connect':
      // a instalação mora na seção Servidores MCP da ferramenta, onde se escolhe global ou projeto
      return (
        <Button size="small" variant={variant} onClick={() => openMcpInstall()}>
          <IconConnect /> {t('Instalar o MCP do board')}
        </Button>
      );
    case 'fixProject':
      return (
        <FixButton variant={variant} run={() => ui.fixProjectMcp(action.file)} onFixed={onFixed}>
          <IconConnect /> {t('Corrigir o registro')}
        </FixButton>
      );
    case 'installSkill':
      return (
        <FixButton variant={variant} run={() => harness.installFlowSkill(r.tool)} onFixed={onFixed}>
          {t('Instalar a skill')}
        </FixButton>
      );
    case 'pinMcp':
      return (
        <FixButton variant={variant} run={() => ui.pinMcp()} onFixed={onFixed}>
          <IconConnect /> {t('Corrigir o caminho')}
        </FixButton>
      );
    case 'allowKimiMcp':
      return (
        <Button
          size="small"
          variant={variant}
          onClick={() => {
            ui.allowKimiMcp();
            onFixed?.();
          }}
        >
          <IconConnect /> {t('Liberar as ferramentas do board')}
        </Button>
      );
    case 'openEditorMcp':
      return (
        <Button size="small" variant={variant} onClick={() => ui.openEditorMcp()}>
          <IconConnect /> {t('Abrir MCPs do Cursor')}
        </Button>
      );
    case 'reload':
      return (
        <Button size="small" variant={variant} onClick={() => ui.reloadWindow()}>
          {t('Recarregar a janela')}
        </Button>
      );
    case 'settings':
      return (
        <Button size="small" variant={variant} onClick={() => openSettings('harness')}>
          {t('Abrir Harness')}
        </Button>
      );
  }
}

/** Um item do aviso: título, explicação e a ação que o resolve. */
function Item({ r, compact }: { r: BoardRequirement; compact: boolean }) {
  const board = useBoardStore((s) => s.state?.board);
  const { title, detail } = requirementTexts(r, board);
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

const NO_EXPIRED: string[] = [];
const NO_REQUIREMENTS: BoardRequirement[] = [];

/**
 * O que falta para o board trabalhar com a IA, com o login que venceu no meio de uma execução. Só entram os
 * perfis em uso (o padrão e os dos cards com a IA): o problema de um perfil que ninguém usa não aparece.
 */
function useRequirementItems(): { items: BoardRequirement[]; missing: number; authError: boolean } {
  const state = useBoardStore((s) => s.state);
  const all = state?.requirements ?? NO_REQUIREMENTS;
  const allExpired = state?.authExpired ?? NO_EXPIRED;
  const inUse = useMemo(() => new Set(state ? profilesInUse(state).map((p) => p.id) : []), [state]);
  const requirements = all.filter((r) => inUse.has(r.tool));
  const authExpired = allExpired.filter((tool) => inUse.has(tool));
  // o sinal reativo (RF6) de um login que venceu no meio da execução pode não estar em `requirements`
  // (o probe não soube dizer): sem este item, a pessoa não veria o aviso
  const items: BoardRequirement[] = [
    ...requirements,
    ...authExpired
      .filter((tool) => !requirements.some((r) => r.id === 'signin' && r.tool === tool))
      .map((tool): BoardRequirement => ({
        id: 'signin',
        tool,
        cli: baseValue(CLI_COMMAND, tool) ?? '',
        action: { kind: 'command', command: baseValue(LOGIN_COMMAND, tool) ?? '', terminal: true },
      })),
  ];
  return {
    items,
    missing: items.filter((r) => !r.optional).length,
    // login vencido é mais urgente que os outros requisitos (para o board inteiro, não só um card): destaque de erro
    authError: requirements.some((r) => r.id === 'signin' && !r.optional) || authExpired.length > 0,
  };
}

/** O resumo do aviso: quantos requisitos faltam, ou o passo que falta no Cursor, ou só o recomendado. */
function requirementsSummary(items: BoardRequirement[], missing: number): string {
  return missing === 0
    ? items.every((r) => r.id === 'harness')
      ? t('Recomendado: defina o harness para as execuções gastarem menos contexto')
      : t('Recomendado para a IA enxergar o board nas suas conversas')
    : items.every((r) => r.id === 'mcp-reload' || r.id === 'mcp-enable')
      ? t('Falta um passo para o chat do Cursor usar o board')
      : missing === 1
        ? t('Falta 1 requisito para o board trabalhar com a IA')
        : t('Faltam {n} requisitos para o board trabalhar com a IA', { n: missing });
}

/**
 * O aviso compacto do que falta, no lugar da faixa no topo do board: o ícone de atenção (na aba Configurações
 * e no Verificar ambiente) e o hint dele, com o resumo e o nome de cada item. null quando não falta nada.
 */
export function useRequirementsAlert(): { level: RequirementsAlertLevel; label: string; hint: ReactNode } | null {
  const { items, missing, authError } = useRequirementItems();
  const board = useBoardStore((s) => s.state?.board);
  if (!items.length) return null;
  const label = requirementsSummary(items, missing);
  return {
    level: missing ? (authError ? 'error' : 'warn') : 'recommended',
    label,
    hint: (
      <>
        <p>
          <strong>{label}</strong>
        </p>
        <ul>
          {items.map((r) => (
            <li key={`${r.id}:${r.tool}`}>{requirementTexts(r, board).title}</li>
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
  const { items, missing, authError } = useRequirementItems();
  // a lista muda (algo foi resolvido): o "nada mudou" de antes não vale mais
  const key = items.map((r) => `${r.id}:${r.tool}`).join();
  if (!items.length) return null;
  return (
    <section
      key={key}
      className={`banner requirements ${missing ? (authError ? 'error' : 'warn') : 'recommended'} ${compact ? 'compact' : ''}`}
      role="region"
      aria-label={t('Requisitos do board')}
    >
      <div className="requirements-head">
        {missing > 0 && <IconWarning />}
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
          <Item key={r.id} r={r} compact={compact} />
        ))}
      </ul>
    </section>
  );
}
