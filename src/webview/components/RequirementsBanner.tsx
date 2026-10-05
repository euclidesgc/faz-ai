import { useState } from 'react';
import { aiToolInfo } from '../../shared/harness';
import type { BoardRequirement } from '../../shared/requirements';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ui } from '../commands';
import { Button, IconCheck, IconConnect, IconWarning } from './ui';

/** Título e explicação de cada requisito, no idioma da interface. */
function texts(r: BoardRequirement): { title: string; detail: string } {
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
        title: t('O servidor do board não está registrado no {tool}', { tool }),
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
        title: t('O registro do servidor do board no {tool} está desatualizado', { tool }),
        detail: t(
          '{file} aponta para "{missing}", que não existe mais nesta máquina (um node trocado pelo nvm, ou o board instalado em outro lugar). A ferramenta não consegue iniciar o servidor. Conecte de novo para gravar o caminho atual.',
          { file: r.file ?? '', missing: r.missing ?? '' },
        ),
      };
    case 'mcp-elsewhere':
      return {
        title: t('O servidor do board no {tool} está registrado para outra pasta', { tool }),
        detail: t(
          '{file} liga o servidor do board à pasta "{missing}", e não a este projeto (o arquivo veio de outra máquina pelo git, ou o projeto mudou de lugar). A IA falaria com outro board, ou com nenhum. Conecte de novo para gravar a pasta atual.',
          { file: r.file ?? '', missing: r.missing ?? '' },
        ),
      };
    case 'permission':
      return { title: t('O {tool} não roda com o nível de permissão escolhido', { tool }), detail: t(r.reason ?? '') };
  }
}

/** Um comando com botão de copiar; sem área de transferência, o comando fica selecionável. */
function CopyCommand({ command }: { command: string }) {
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
 * O que falta para o board trabalhar com a ferramenta de IA. Fica visível em todas as telas enquanto
 * faltar alguma coisa, sem botão de fechar: some sozinho quando a última pendência é resolvida.
 */
export function RequirementsBanner({ compact = false }: { compact?: boolean }) {
  const requirements = useBoardStore((s) => s.state?.requirements ?? []);
  const openSettings = useBoardStore((s) => s.openSettings);
  if (!requirements.length) return null;
  return (
    <section className={`banner warn requirements ${compact ? 'compact' : ''}`} role="alert" aria-label={t('Requisitos do board')}>
      <div className="requirements-head">
        <IconWarning />
        <strong>
          {requirements.length === 1
            ? t('Falta 1 requisito para o board trabalhar com a IA')
            : t('Faltam {n} requisitos para o board trabalhar com a IA', { n: requirements.length })}
        </strong>
        <span className="spacer" />
        <Button size="small" variant="ghost" onClick={() => ui.checkRequirements()}>
          {t('Verificar de novo')}
        </Button>
      </div>
      <ul>
        {requirements.map((r) => {
          const { title, detail } = texts(r);
          return (
            <li key={r.id}>
              <strong>{title}</strong>
              {!compact && <p>{detail}</p>}
              {r.action?.kind === 'command' && <CopyCommand command={r.action.command} />}
              {r.action?.kind === 'connect' && (
                <Button size="small" onClick={() => ui.connectAI()}>
                  <IconConnect /> {t('Conectar ao board (MCP)')}
                </Button>
              )}
              {r.action?.kind === 'settings' && !compact && (
                <Button size="small" onClick={() => openSettings('harness')}>
                  {t('Abrir Harness de IA')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
