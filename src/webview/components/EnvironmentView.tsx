import { useEffect, useState, type ReactNode } from 'react';
import { aiToolInfo, type AiTool } from '../../shared/harness';
import { ENV_DOCS, type EnvCheck, type EnvCheckId, type EnvironmentReport } from '../../shared/environment';
import { installPlan, installScript, type InstallPlan, type InstallStepResult } from '../../shared/installPlan';
import { FLOW_SKILL_NAME } from '../../shared/harnessProject';
import { useBoardStore } from '../store/boardStore';
import { isWeb } from '../vscode';
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
          'As execuções do board partem de contexto vazio e só usam o que está marcado em Configurações → Harness: a skill precisa existir para o {tool} e estar marcada em "Incluir em todo contexto" neste board. Instalar por aqui grava na pasta global de skills da ferramenta e já marca.',
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
        privacy: t('Roda na sua máquina: o grafo fica na pasta .code-review-graph do projeto e o código não sai dela.'),
        installNote: t(
          'O último comando registra o MCP do Code Review Graph no {tool} e, por padrão, acrescenta instruções de uso ao arquivo de regras do projeto (CLAUDE.md, AGENTS.md…). Rode-o na pasta do projeto.',
          { tool: label },
        ),
      };
    case 'uv':
      return {
        title: t('uv'),
        purpose: t('Instala e atualiza programas feitos em Python, cada um isolado na própria pasta.'),
        usage: t(
          'O Code Review Graph é instalado e atualizado pelo uv. Logo depois de instalar o uv, o terminal já aberto ainda não o encontra: o último comando recarrega o PATH (ou abra um terminal novo).',
        ),
      };
    case 'python':
      return {
        title: t('Python 3.10 ou mais novo'),
        purpose: t('O Code Review Graph é um programa em Python.'),
        usage: t(
          'Se não houver um Python 3.10 ou mais novo, o uv baixa um só para o Code Review Graph, na pasta dele, ao instalá-lo. Não é preciso instalar Python no sistema, e o que já existe não muda.',
        ),
      };
    case 'crg-graph':
      return {
        title: t('Grafo deste projeto'),
        purpose: t('O Code Review Graph precisa analisar o projeto uma vez antes de responder.'),
        usage: t('Depois do primeiro build, o grafo é atualizado a cada mudança, sem você pedir.'),
      };
    case 'crg-mcp':
      return {
        title: t('MCP do Code Review Graph no {tool}', { tool: label }),
        purpose: t('É por ele que a IA do chat do editor consulta o grafo.'),
        usage: t(
          'O editor inicia o MCP com o comando registrado, procurando-o no PATH de quando abriu. O que foi instalado depois (o uvx do uv) só é achado pelo caminho completo, que vale para esta máquina; o arquivo fica fora do git.',
        ),
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
    // o comando do aviso é o mesmo que abre a lista abaixo, que traz os passos seguintes (o PATH)
    if (!(check.fix?.kind === 'commands' && check.requirement.action?.kind === 'command'))
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
    if (check.fix.brew)
      parts.push(
        <p key="brew" className="small muted">
          {t('Os comandos usam o Homebrew. Sem ele, instale antes pelo site brew.sh ou use o link de download.')}
        </p>,
      );
    if (check.fix.reopenTerminal)
      parts.push(
        <p key="reopen" className="small muted">
          {t('Depois, abra um terminal novo: o que já estava aberto não enxerga o programa recém-instalado.')}
        </p>,
      );
  }
  if (check.fix?.kind === 'pinMcp')
    parts.push(
      <Button
        key="pin"
        size="small"
        onClick={() => {
          ui.pinMcp();
          onFixed();
        }}
      >
        {t('Corrigir o caminho')}
      </Button>,
    );
  if (check.tracked)
    parts.push(
      <p key="tracked">
        {t(
          'O arquivo de MCPs do projeto está no git, então o board não grava nele o caminho desta máquina. Feche e abra o editor de novo, para ele ler o PATH atual, ou tire o arquivo do git.',
        )}
      </p>,
    );
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
        {check.fix?.kind === 'commands' ? t('Ou baixe o instalador') : t('Baixar o instalador')}
      </ExternalLink>,
    );
  return <div className="env-fix">{parts}</div>;
}

interface ItemProps {
  check: EnvCheck;
  tool: AiTool;
  /** os pré-requisitos do item (o uv e o Python do Code Review Graph), mostrados dentro dele */
  prereqs?: EnvCheck[];
  busyId: EnvCheckId | null;
  onFixed: (id: EnvCheckId) => void;
}

function CheckItem({ check, tool, prereqs = [], busyId, onFixed }: ItemProps) {
  const busy = busyId === check.id;
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
        {/* o botão foi clicado: até a nova conferência chegar, o item mostra que está trabalhando */}
        {busy ? (
          <p role="status" className="env-busy">
            <span className="spinner" aria-hidden /> {t('Aplicando e conferindo de novo…')}
          </p>
        ) : (
          <>
            {/* os pré-requisitos primeiro: são a ordem de instalar */}
            {check.status === 'missing' && prereqs.length > 0 && (
              <section className="env-prereqs" aria-label={t('Antes, os pré-requisitos')}>
                <p>
                  <strong>{t('Antes, os pré-requisitos')}</strong>
                </p>
                <ul className="env-list">
                  {prereqs.map((c) => (
                    <CheckItem key={c.id} check={c} tool={tool} busyId={busyId} onFixed={onFixed} />
                  ))}
                </ul>
                <p>
                  <strong>{t('Depois, o próprio item')}</strong>
                </p>
              </section>
            )}
            <Fix check={check} tool={tool} installNote={x.installNote} onFixed={() => onFixed(check.id)} />
          </>
        )}
        {docs && (
          <ExternalLink href={docs}>
            <span className="small">{t('Saiba mais')}</span>
          </ExternalLink>
        )}
      </div>
    </li>
  );
}

/** Copia um texto longo (o script inteiro), com o retorno ao lado do botão. */
function CopyScript({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <span className="requirement-command">
      <Button
        size="small"
        variant="primary"
        onClick={() => {
          if (!navigator.clipboard?.writeText) return setState('failed');
          navigator.clipboard.writeText(text).then(
            () => setState('copied'),
            () => setState('failed'),
          );
        }}
      >
        {t('Copiar o script')}
      </Button>
      <span role="status" className="small">
        {state === 'copied' && t('Copiado')}
        {state === 'failed' && t('Não foi possível copiar. Selecione o script abaixo e copie com o teclado.')}
      </span>
    </span>
  );
}

/**
 * A confirmação do "Instalar tudo": o que vai rodar, em ordem, o script inteiro e o que fica com a
 * pessoa. No editor, roda num terminal à vista; no navegador, não há terminal: o script é para copiar.
 */
function InstallPreview({
  plan,
  report,
  tool,
  onRun,
  onCancel,
}: {
  plan: InstallPlan;
  report: EnvironmentReport;
  tool: AiTool;
  onRun: () => void;
  onCancel: () => void;
}) {
  const script = installScript(plan);
  const title = (id: EnvCheckId) => texts(id, tool).title;
  const label = plan.level === 'required' ? t('Instalar o necessário') : t('Instalar os recomendados');
  return (
    <section className="env-install" aria-label={label}>
      <h3>{label}</h3>
      <p>
        {plan.shell === 'powershell'
          ? t(
              'Roda os passos abaixo em ordem, num terminal do PowerShell, e para no primeiro que falhar. O Windows pode pedir permissão de administrador, e os logins abrem o navegador: responda no terminal.',
            )
          : t(
              'Roda os passos abaixo em ordem, num terminal, e para no primeiro que falhar. Pode pedir a sua senha (sudo), e os logins abrem o navegador: responda no terminal.',
            )}
      </p>
      <ol>
        {plan.steps.map((s) => (
          <li key={s.id}>{title(s.id)}</li>
        ))}
        {plan.installSkill && <li>{title('skill')}</li>}
      </ol>
      {plan.steps.some((s) => s.id === 'crg-embeddings') && (
        <p className="small">
          {t('A busca semântica baixa o PyTorch e o modelo de linguagem: mais de 1 GB, alguns minutos na primeira vez.')}
        </p>
      )}
      {plan.manual.length > 0 && (
        <p className="small">{t('Fica com você, pelos itens da lista: {items}.', { items: plan.manual.map(title).join(', ') })}</p>
      )}
      <details>
        <summary>{t('Ver o script ({os})', { os: report.os.label })}</summary>
        <pre className="env-script">{script}</pre>
      </details>
      <div className="env-install-actions">
        {isWeb ? (
          <>
            <CopyScript text={script} />
            <span className="small muted">{t('No navegador não há terminal: cole o script num terminal aberto na pasta do projeto.')}</span>
          </>
        ) : (
          <Button variant="primary" onClick={onRun}>
            {t('Rodar no terminal')}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancelar')}
        </Button>
      </div>
    </section>
  );
}

/**
 * O que o último "Instalar tudo" fez, passo a passo. O que falhou mostra o comando, o código de saída e
 * o erro: daí em diante, é com a pessoa (o resto da instalação seguiu sem ele).
 */
function InstallResult({ steps, tool, onClose }: { steps: InstallStepResult[]; tool: AiTool; onClose: () => void }) {
  const title = (id: EnvCheckId) => texts(id, tool).title;
  const failed = steps.filter((s) => s.status === 'failed').length;
  return (
    <section className="env-install" aria-label={t('Resultado da instalação')}>
      <h3>{t('Resultado da instalação')}</h3>
      <p>
        {failed
          ? tn(
              failed,
              'Não foi possível instalar {n} item. O erro está abaixo; o resto da instalação seguiu sem ele.',
              'Não foi possível instalar {n} itens. Os erros estão abaixo; o resto da instalação seguiu sem eles.',
            )
          : t('Tudo foi instalado.')}
      </p>
      <ul className="env-list">
        {steps.map((s) => (
          <li key={s.id} className={`env-item ${s.status === 'ok' ? 'ok' : s.status === 'skipped' ? 'skipped' : 'missing'}`}>
            {s.status === 'ok' ? STATUS_ICON.ok : s.status === 'skipped' ? STATUS_ICON.skipped : STATUS_ICON.required}
            <div className="env-body">
              <div className="env-title">
                <strong>{title(s.id)}</strong>
                <span className="small muted">
                  {s.status === 'ok'
                    ? t('Instalado')
                    : s.status === 'skipped'
                      ? t('Pulado: depende de {item}, que falhou', { item: s.because ? title(s.because) : '' })
                      : t('Não foi possível instalar')}
                </span>
              </div>
              {s.status === 'failed' && (
                <>
                  <p className="small">
                    {t('O comando "{command}" terminou com o código {code}.', { command: s.command ?? '', code: String(s.code ?? '') })}
                  </p>
                  {s.error ? (
                    <pre className="env-script">{s.error}</pre>
                  ) : (
                    <p className="small muted">{t('A mensagem completa está no terminal "Faz AI: instalação".')}</p>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="env-install-actions">
        <Button variant="ghost" onClick={onClose}>
          {t('Fechar o resultado')}
        </Button>
      </div>
    </section>
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
  // o item cujo botão foi clicado, até a conferência seguinte terminar
  const [fixing, setFixing] = useState<EnvCheckId | null>(null);
  // o "Instalar tudo" aberto para confirmar, e o que já está rodando no terminal
  const [preview, setPreview] = useState<InstallPlan['level'] | null>(null);
  const installing = useBoardStore((s) => s.state?.environmentInstall ?? null);
  const result = useBoardStore((s) => s.state?.environmentInstallResult ?? null);
  // o resultado fica até a pessoa fechar (vale por instalação: a próxima mostra o dela)
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const busyId = checking ? fixing : null;

  const all = report?.checks ?? [];
  const checks = all.filter((c) => !c.parent);
  const prereqsOf = (id: EnvCheckId) => all.filter((c) => c.parent === id);
  const fix = (id: EnvCheckId) => {
    setFixing(id);
    recheck();
  };
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
              {checking && report && (
                <>
                  <span className="spinner" aria-hidden /> {t('Conferindo…')}
                </>
              )}
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
      {report && <p className="small muted env-os">{t('Comandos de instalação para: {os}', { os: report.os.label })}</p>}
      {result && result.finishedAt !== closedAt && !installing && (
        <InstallResult steps={result.steps} tool={tool} onClose={() => setClosedAt(result.finishedAt)} />
      )}
      {report &&
        (installing ? (
          <p role="status" className="env-busy">
            <span className="spinner" aria-hidden />{' '}
            {t('Instalando no terminal "Faz AI: instalação". Responda lá o que ele pedir; a tela confere de novo quando terminar.')}
          </p>
        ) : preview && installPlan(report, preview) ? (
          <InstallPreview
            plan={installPlan(report, preview)!}
            report={report}
            tool={report.tool}
            onCancel={() => setPreview(null)}
            onRun={() => {
              ui.installEnvironment(preview);
              setPreview(null);
            }}
          />
        ) : (
          <div className="env-install-actions">
            {installPlan(report, 'required') && (
              <Button variant="primary" disabled={checking} onClick={() => setPreview('required')}>
                {t('Instalar o necessário')}
              </Button>
            )}
            {installPlan(report, 'recommended') && (
              <Button disabled={checking} onClick={() => setPreview('recommended')}>
                {t('Instalar os recomendados')}
              </Button>
            )}
          </div>
        ))}
      {report && (
        <>
          <section aria-labelledby="env-required">
            <h3 id="env-required">{t('Necessário')}</h3>
            <ul className="env-list">
              {required.map((c) => (
                <CheckItem key={c.id} check={c} tool={report.tool} prereqs={prereqsOf(c.id)} busyId={busyId} onFixed={fix} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="env-recommended">
            <h3 id="env-recommended">{t('Recomendado')}</h3>
            <ul className="env-list">
              {recommended.map((c) => (
                <CheckItem key={c.id} check={c} tool={report.tool} prereqs={prereqsOf(c.id)} busyId={busyId} onFixed={fix} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
