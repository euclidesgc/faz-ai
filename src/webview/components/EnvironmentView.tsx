import { useEffect, useState, type ReactNode } from 'react';
import { aiToolInfo, type AiTool } from '../../shared/harness';
import { ENV_DOCS, type EnvCheck, type EnvCheckId } from '../../shared/environment';
import { FLOW_SKILL_NAME } from '../../shared/harnessProject';
import { useBoardStore } from '../store/boardStore';
import { t, tn } from '../i18n';
import { harness, ui } from '../commands';
import { PageHeader } from './settings/PageHeader';
import { CopyCommand, RequirementFix, requirementTexts } from './RequirementsBanner';
import { Button, IconExternal, IconMissing, IconOk, IconRecommend, IconSkipped } from './ui';

/** Onde cada ferramenta documenta a linha de comando (o "Saiba mais" da CLI e do login). */
const CLI_DOCS: Record<AiTool, string> = {
  claude: 'https://claude.com/claude-code',
  codex: 'https://developers.openai.com/codex',
  cursor: 'https://cursor.com/cli',
  kimi: 'https://moonshotai.github.io/kimi-code',
  copilot: 'https://github.com/features/copilot/cli',
};
const MCP_DOCS = 'https://github.com/euclidesgc/faz-ai/blob/main/docs/mcp.md';

/** Onde baixar o que não se instala com um comando só. */
const DOWNLOAD: Partial<Record<EnvCheckId, string>> = {
  node: 'https://nodejs.org/en/download',
  git: 'https://git-scm.com/downloads',
  gh: 'https://cli.github.com',
};

interface Texts {
  title: string;
  /** para que serve */
  purpose: string;
  /** como o board usa */
  usage: string;
  /** o que sai da máquina, quando é o caso */
  privacy?: string;
  /** um aviso junto dos comandos de instalação */
  installNote?: string;
}

/** O texto de cada item, no idioma da interface. */
function texts(id: EnvCheckId, tool: AiTool): Texts {
  const label = aiToolInfo(tool).label;
  switch (id) {
    case 'node':
      return {
        title: t('Node.js 18 ou mais novo'),
        purpose: t('Roda o MCP do board, o servidor pelo qual a IA lê e altera os cards.'),
        usage: t('A ferramenta de IA inicia o MCP com o node do PATH do terminal a cada conversa e a cada execução pelo board.'),
      };
    case 'cli':
      return {
        title: t('Linha de comando do {tool}', { tool: label }),
        purpose: t('É ela que o board chama para a IA trabalhar nos cards.'),
        usage: t(
          'Os botões de IA dos cards, o chat do board, o heartbeat e o modo autônomo rodam a linha de comando do {tool} em segundo plano, nesta pasta.',
          { tool: label },
        ),
        privacy: t(
          'O que a IA lê (o card, o código do projeto) vai para o {tool} pelas regras da sua conta nele; o board não manda nada a mais.',
          { tool: label },
        ),
      };
    case 'signin':
      return {
        title: t('Login na linha de comando do {tool}', { tool: label }),
        purpose: t('As execuções pelo board usam a sua conta e o seu plano.'),
        usage: t('Sem login, as execuções falham antes de começar.'),
      };
    case 'mcp':
      return {
        title: t('MCP do board (faz-ai)'),
        purpose: t('É o canal pelo qual a IA lê e atualiza os cards deste board.'),
        usage: t(
          'Nas conversas com o {tool}, a IA usa o MCP para consultar os cards, movê-los entre as colunas e registrar comentários e anexos.',
          { tool: label },
        ),
        privacy: t('Roda na sua máquina: o MCP fala com o board por um arquivo local, sem passar pela rede.'),
      };
    case 'permission':
      return {
        title: t('Nível de permissão das execuções'),
        purpose: t('Diz o que a IA pode fazer sozinha quando o board a executa.'),
        usage: t('É escolhido em Harness de IA. Algumas ferramentas não aceitam todos os níveis fora de um terminal.'),
      };
    case 'skill':
      return {
        title: t('Skill do fluxo ({name})', { name: FLOW_SKILL_NAME }),
        purpose: t('Ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências.'),
        usage: t(
          'O {tool} carrega a skill quando você pede para trabalhar num card, no chat do editor ou no terminal. Ela é instalada na pasta global de skills da ferramenta e vale para todos os projetos.',
          { tool: label },
        ),
      };
    case 'git':
      return {
        title: t('Git'),
        purpose: t('O controle de versão do projeto.'),
        usage: t(
          'Com o modo do Git ligado, o board cria uma branch ou uma worktree para cada história. Ele também lê do Git o seu nome, que assina os comentários.',
        ),
      };
    case 'repo':
      return {
        title: t('Repositório Git nesta pasta'),
        purpose: t('Os modos de branch e de worktree precisam de um repositório.'),
        usage: t('Sem repositório, as histórias são trabalhadas direto na pasta, sem branch própria.'),
      };
    case 'gh':
      return {
        title: t('GitHub CLI (gh)'),
        purpose: t('Fala com o GitHub pela linha de comando.'),
        usage: t('O board usa o gh para fazer o merge automático do PR aprovado e para acompanhar os PRs abertos até o merge.'),
        privacy: t('Usa a sua conta do GitHub, direto do gh; nada passa pelo board.'),
      };
    case 'gh-auth':
      return {
        title: t('Login no GitHub CLI'),
        purpose: t('O gh precisa da sua conta para ver e mesclar os PRs.'),
        usage: t('Sem login, o merge automático e o acompanhamento dos PRs não funcionam.'),
      };
    case 'crg':
      return {
        title: t('Code Review Graph'),
        purpose: t('Monta um grafo do código (funções, classes, quem chama quem) e o entrega à IA por um MCP próprio.'),
        usage: t(
          'Em vez de ler arquivos inteiros, a IA consulta o grafo para achar o trecho certo e medir o impacto de uma mudança: gasta menos tokens e erra menos nos cards.',
        ),
        privacy: t(
          'Roda na sua máquina: o grafo fica na pasta .code-review-graph do projeto e o código não sai dela. Precisa do Python 3.10 ou mais novo, que o uv instala junto, sem mexer no Python do sistema.',
        ),
        installNote: t(
          'O último comando registra o MCP do Code Review Graph no {tool} e, por padrão, acrescenta instruções de uso ao arquivo de regras do projeto (CLAUDE.md, AGENTS.md…). Rode-o na pasta do projeto.',
          { tool: label },
        ),
      };
    case 'crg-graph':
      return {
        title: t('Grafo deste projeto'),
        purpose: t('O Code Review Graph precisa analisar o projeto uma vez antes de responder.'),
        usage: t('Depois do primeiro build, o grafo é atualizado a cada mudança, sem você pedir.'),
      };
    case 'crg-embeddings':
      return {
        title: t('Busca semântica do Code Review Graph'),
        purpose: t('Deixa a IA buscar o código pelo significado ("onde validamos o login?"), e não só pelo nome.'),
        usage: t(
          'A busca do MCP do Code Review Graph passa a comparar o sentido da pergunta com cada função do grafo, e a IA acha o que procura em menos tentativas.',
        ),
        privacy: t(
          'Com o provedor local (o dos comandos abaixo), o modelo all-MiniLM-L6-v2 é baixado uma vez do Hugging Face e roda na sua máquina: o código não sai dela. Os provedores openai, google, minimax e voyage mandam trechos do código para a API desses serviços, e muitas empresas não permitem isso. Confira a política da sua antes de trocar o provedor.',
        ),
      };
  }
}

const STATUS_ICON = {
  ok: <IconOk className="env-ok" aria-hidden />,
  required: <IconMissing className="env-missing" aria-hidden />,
  recommended: <IconRecommend className="env-recommend" aria-hidden />,
  skipped: <IconSkipped className="env-skipped" aria-hidden />,
};

/** O estado do item, em palavras (o ícone sozinho não diz nada a quem não vê a cor). */
function statusLabel(c: EnvCheck): string {
  if (c.status === 'ok') return c.version ? t('Pronto · {version}', { version: c.version }) : t('Pronto');
  if (c.status === 'skipped') return t('Depende do item anterior');
  return c.level === 'required' ? t('Falta') : t('Recomendado');
}

/** O link "Saiba mais" de cada item. */
function docsOf(id: EnvCheckId, tool: AiTool): string | undefined {
  if (id === 'cli' || id === 'signin') return CLI_DOCS[tool];
  if (id === 'mcp') return MCP_DOCS;
  return ENV_DOCS[id];
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <IconExternal aria-hidden />
    </a>
  );
}

/** Como resolver o item: a ação do aviso de requisitos, os comandos, o botão que instala ou o link de download. */
function Fix({ check, tool, installNote, onFixed }: { check: EnvCheck; tool: AiTool; installNote?: string; onFixed: () => void }) {
  if (check.status !== 'missing') return null;
  const parts: ReactNode[] = [];
  if (check.requirement) {
    // o texto do aviso diz o que foi procurado e onde: o detalhe que a tela não repete
    parts.push(
      <p key="detail" className="env-detail">
        {requirementTexts(check.requirement).detail}
      </p>,
    );
    parts.push(<RequirementFix key="action" r={check.requirement} onFixed={onFixed} />);
  }
  if (check.fix?.kind === 'commands') {
    if (installNote) parts.push(<p key="note">{installNote}</p>);
    parts.push(
      <ol key="commands" className="env-commands">
        {check.fix.commands.map((c) => (
          <li key={c}>
            <CopyCommand command={c} />
          </li>
        ))}
      </ol>,
    );
  }
  if (check.fix?.kind === 'installSkill')
    parts.push(
      <Button
        key="skill"
        size="small"
        onClick={() => {
          harness.installFlowSkill(tool, 'user');
          // a instalação muda o harness na hora: conferir de novo leva o item para "Pronto"
          onFixed();
        }}
      >
        {t('Instalar a skill')}
      </Button>,
    );
  const download = DOWNLOAD[check.id];
  if (download && !check.requirement?.action)
    parts.push(
      <ExternalLink key="download" href={download}>
        {t('Baixar o instalador')}
      </ExternalLink>,
    );
  return <div className="env-fix">{parts}</div>;
}

function CheckItem({ check, tool, onFixed }: { check: EnvCheck; tool: AiTool; onFixed: () => void }) {
  const x = texts(check.id, tool);
  const icon = check.status === 'ok' ? STATUS_ICON.ok : check.status === 'skipped' ? STATUS_ICON.skipped : STATUS_ICON[check.level];
  const docs = docsOf(check.id, tool);
  return (
    <li className={`env-item ${check.status}`}>
      {icon}
      <div className="env-body">
        <div className="env-title">
          <strong>{x.title}</strong>
          <span className="small muted">{statusLabel(check)}</span>
        </div>
        <dl>
          <dt>{t('Para que serve')}</dt>
          <dd>{x.purpose}</dd>
          <dt>{t('Como o board usa')}</dt>
          <dd>{x.usage}</dd>
          {x.privacy && (
            <>
              <dt>{t('Privacidade')}</dt>
              <dd>{x.privacy}</dd>
            </>
          )}
        </dl>
        <Fix check={check} tool={tool} installNote={x.installNote} onFixed={onFixed} />
        {docs && (
          <ExternalLink href={docs}>
            <span className="small">{t('Saiba mais')}</span>
          </ExternalLink>
        )}
      </div>
    </li>
  );
}

/**
 * Diagnóstico do ambiente: tudo de que o board precisa para trabalhar com a IA e o que ele usa quando
 * existe, em forma de lista de tarefas. Abre sozinho na primeira abertura do board na máquina e,
 * depois, pelo "Verificar ambiente" das Configurações. Confere de novo cada vez que a tela abre.
 */
export function EnvironmentView() {
  const report = useBoardStore((s) => s.state?.environment ?? null);
  const tool = useBoardStore((s) => s.state!.board.aiTool);
  const setView = useBoardStore((s) => s.setView);
  const [askedAt, setAskedAt] = useState(() => Date.now());
  const checking = !report || report.checkedAt < askedAt;
  // confere ao abrir: a pessoa pode ter instalado algo desde a última vez
  useEffect(() => {
    ui.checkEnvironment();
  }, []);
  const recheck = () => {
    setAskedAt(Date.now());
    ui.checkEnvironment();
  };

  const checks = report?.checks ?? [];
  const required = checks.filter((c) => c.level === 'required');
  const recommended = checks.filter((c) => c.level === 'recommended');
  const missing = required.filter((c) => c.status === 'missing').length;
  const suggested = recommended.filter((c) => c.status === 'missing').length;
  const summary = !report
    ? t('Conferindo o ambiente…')
    : missing
      ? missing === 1
        ? t('Falta 1 item necessário para o board trabalhar com a IA.')
        : t('Faltam {n} itens necessários para o board trabalhar com a IA.', { n: missing })
      : suggested
        ? tn(
            suggested,
            'O board está pronto para trabalhar com a IA. Há {n} recomendação para aproveitar melhor.',
            'O board está pronto para trabalhar com a IA. Há {n} recomendações para aproveitar melhor.',
          )
        : t('Tudo pronto: o board tem tudo o que usa.');

  return (
    <div className="environment">
      <PageHeader
        title={t('Diagnóstico do ambiente')}
        actions={
          <>
            <span role="status" className="small muted">
              {checking && report ? t('Conferindo…') : ''}
            </span>
            <Button size="small" variant="ghost" disabled={checking} onClick={recheck}>
              {t('Verificar de novo')}
            </Button>
            <Button size="small" onClick={() => setView('board')}>
              {t('Ir para o board')}
            </Button>
          </>
        }
      >
        {t(
          'O que o board precisa para trabalhar com o {tool} e o que ele aproveita quando está instalado. Cada item diz para que serve, como o board o usa, o que sai da sua máquina e como resolver o que falta.',
          { tool: aiToolInfo(tool).label },
        )}
      </PageHeader>
      <p role="status" className="env-summary">
        <strong>{summary}</strong>
      </p>
      {report && (
        <>
          <section aria-labelledby="env-required">
            <h3 id="env-required">{t('Necessário')}</h3>
            <ul className="env-list">
              {required.map((c) => (
                <CheckItem key={c.id} check={c} tool={report.tool} onFixed={recheck} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="env-recommended">
            <h3 id="env-recommended">{t('Recomendado')}</h3>
            <ul className="env-list">
              {recommended.map((c) => (
                <CheckItem key={c.id} check={c} tool={report.tool} onFixed={recheck} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
