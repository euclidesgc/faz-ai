import { useState } from 'react';
import { aiToolInfo } from '../../shared/harness';
import type { BoardState } from '../../shared/model';
import type { BoardRequirement } from '../../shared/requirements';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ui } from '../commands';
import { isWeb } from '../vscode';
import { Button, IconCheck, IconConnect, IconWarning } from './ui';

/** Título e explicação de cada requisito, no idioma da interface. */
export function requirementTexts(r: BoardRequirement): { title: string; detail: string } {
  const tool = aiToolInfo(r.tool).label;
  switch (r.id) {
    case 'node':
      return {
        title: t('Node.js não encontrado'),
        detail: t(
          'O servidor do board (o MCP pelo qual a IA lê e altera o board) roda com o Node.js 18 ou mais novo, e ele não está no PATH do terminal. Sem ele, o {tool} não alcança o board. Instale o Node.js e clique em Verificar de novo.',
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
    case 'mcp-enable':
      return {
        title: t('Ative o MCP do board no {tool}', { tool }),
        detail: t(
          'O MCP "faz-ai" é o canal pelo qual a IA do chat do Cursor lê e atualiza os cards deste board. O Cursor deixa desativado todo MCP novo de um projeto, e só você pode ativá-lo: em Abrir MCPs do Cursor, clique em "faz-ai" e ligue a chave deste projeto.',
        ),
      };
    case 'permission':
      return { title: t('O {tool} não roda com o nível de permissão escolhido', { tool }), detail: t(r.reason ?? '') };
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
 */
export function aiBlockedReason(state: BoardState): string | null {
  if (state.aiRunUnsupported) return t(state.aiRunUnsupported);
  const cli = state.requirements.find((r) => r.id === 'cli' || r.id === 'signin');
  if (!cli) return null;
  return cli.id === 'cli'
    ? t('A linha de comando do {tool} não foi encontrada: veja o aviso no topo do board.', { tool: aiToolInfo(cli.tool).label })
    : t('A linha de comando do {tool} está sem login: veja o aviso no topo do board.', { tool: aiToolInfo(cli.tool).label });
}

/** Se o requisito tem um botão ou comando que o resolve por aqui (na versão compacta, sem o atalho para as Configurações). */
function actionable(r: BoardRequirement, compact: boolean): boolean {
  const kind = r.action?.kind;
  // recarregar a janela e abrir os MCPs do editor só existem dentro do editor; no navegador, fica a explicação
  if (kind === 'reload' || kind === 'openEditorMcp') return !isWeb;
  if (kind === 'settings') return !compact;
  return kind === 'command' || kind === 'connect' || kind === 'fixProject' || kind === 'pinMcp';
}

/**
 * A ação que resolve o requisito: o comando com copiar, ou o botão que faz. `onFixed` roda depois de
 * um botão que muda algo na máquina (o Diagnóstico confere de novo para o item mudar de estado).
 */
export function RequirementFix({ r, compact = false, onFixed }: { r: BoardRequirement; compact?: boolean; onFixed?: () => void }) {
  const openSettings = useBoardStore((s) => s.openSettings);
  const openMcpInstall = () => {
    useBoardStore.setState({ harnessTab: 'all' });
    openSettings('harness');
  };
  if (!actionable(r, compact)) return null;
  const action = r.action!;
  switch (action.kind) {
    case 'command':
      return <CopyCommand command={action.command} />;
    case 'connect':
      // a instalação mora na seção Servidores MCP da ferramenta, onde se escolhe global ou projeto
      return (
        <Button size="small" onClick={() => openMcpInstall()}>
          <IconConnect /> {t('Instalar o MCP do board')}
        </Button>
      );
    case 'fixProject':
      return (
        <Button
          size="small"
          onClick={() => {
            ui.fixProjectMcp(action.file);
            onFixed?.();
          }}
        >
          <IconConnect /> {t('Corrigir o registro')}
        </Button>
      );
    case 'pinMcp':
      return (
        <Button
          size="small"
          onClick={() => {
            ui.pinMcp();
            onFixed?.();
          }}
        >
          <IconConnect /> {t('Corrigir o caminho')}
        </Button>
      );
    case 'openEditorMcp':
      return (
        <Button size="small" onClick={() => ui.openEditorMcp()}>
          <IconConnect /> {t('Abrir MCPs do Cursor')}
        </Button>
      );
    case 'reload':
      return (
        <Button size="small" onClick={() => ui.reloadWindow()}>
          {t('Recarregar a janela')}
        </Button>
      );
    case 'settings':
      return (
        <Button size="small" onClick={() => openSettings('harness')}>
          {t('Abrir Harness de IA')}
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
  const checkedAt = useBoardStore((s) => s.state?.requirementsCheckedAt ?? 0);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const done = askedAt !== null && checkedAt > askedAt;
  return (
    <>
      <span role="status" className="small muted">
        {askedAt !== null && (done ? t('Conferido agora: nada mudou.') : t('Conferindo…'))}
      </span>
      <Button
        size="small"
        variant="ghost"
        disabled={askedAt !== null && !done}
        onClick={() => {
          setAskedAt(Date.now());
          ui.checkRequirements();
        }}
      >
        {t('Verificar de novo')}
      </Button>
    </>
  );
}

/**
 * O que falta para o board trabalhar com a ferramenta de IA. Fica visível em todas as telas enquanto
 * faltar alguma coisa, sem botão de fechar: some sozinho quando a última pendência é resolvida. O que
 * é só recomendado (não impede as execuções pelo board) não conta como pendência: sozinho, vira uma
 * caixa discreta (com a explicação) em vez da faixa de aviso.
 */
export function RequirementsBanner({ compact = false }: { compact?: boolean }) {
  const requirements = useBoardStore((s) => s.state?.requirements ?? []);
  const missing = requirements.filter((r) => !r.optional).length;
  // a lista muda (algo foi resolvido): o "nada mudou" de antes não vale mais
  const key = requirements.map((r) => r.id).join();
  if (!requirements.length) return null;
  return (
    <section
      key={key}
      className={`banner requirements ${missing ? 'warn' : 'recommended'} ${compact ? 'compact' : ''}`}
      role="region"
      aria-label={t('Requisitos do board')}
    >
      <div className="requirements-head">
        {missing > 0 && <IconWarning />}
        <strong role="status">
          {missing === 0
            ? requirements.every((r) => r.id === 'mcp-reload' || r.id === 'mcp-enable')
              ? t('Falta um passo para o chat do Cursor usar o board')
              : t('Recomendado para a IA enxergar o board nas suas conversas')
            : missing === 1
              ? t('Falta 1 requisito para o board trabalhar com a IA')
              : t('Faltam {n} requisitos para o board trabalhar com a IA', { n: missing })}
        </strong>
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
        {requirements.map((r) => (
          <Item key={r.id} r={r} compact={compact} />
        ))}
      </ul>
    </section>
  );
}
