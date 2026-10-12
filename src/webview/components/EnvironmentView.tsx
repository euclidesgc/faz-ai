import { useEffect, useState } from 'react';
import { aiToolInfo, type AiTool } from '../../shared/harness';
import { NODE_MIN_MAJOR, missingCount, type EnvCheck } from '../../shared/environment';
import { CLI_COMMAND } from '../../shared/requirements';
import { FLOW_SKILL_NAME } from '../../shared/harnessProject';
import { useBoardStore } from '../store/boardStore';
import { t, tn } from '../i18n';
import { ui } from '../commands';
import { PageHeader } from './settings/PageHeader';
import { CopyCommand, RequirementFix, requirementTexts } from './RequirementsBanner';
import { Button, Hint, IconExternal, IconMissing, IconOk, IconSkipped } from './ui';

/** O nome do item e, no hint, como o board o usa; no idioma da interface. */
function texts(c: EnvCheck, projectTool: AiTool): { title: string; hint: string } {
  const tool = aiToolInfo(c.tool ?? projectTool).label;
  switch (c.id) {
    case 'node':
      return {
        title: t('Node.js {min} ou mais novo', { min: String(NODE_MIN_MAJOR) }),
        hint: t('Roda o MCP do board: a ferramenta de IA o inicia com o Node.js do PATH a cada conversa e a cada execução pelo board.'),
      };
    case 'tool':
      return c.tool === projectTool
        ? {
            title: t('{tool} (ferramenta do projeto)', { tool }),
            hint: t('A ferramenta de IA que o board usa nos botões de IA dos cards, no chat, no heartbeat e no modo autônomo.'),
          }
        : {
            title: t('{tool} (encontrado na máquina)', { tool }),
            hint: t(
              'Outra ferramenta de IA nesta máquina. O board passa a usá-la se você a escolher em Configurações → Harness de IA, e aí instala nela o MCP e a skill do board.',
            ),
          };
    case 'cli':
      return {
        title: t('Linha de comando {cli}', { cli: CLI_COMMAND[c.tool ?? projectTool] }),
        hint: t('O board roda a linha de comando do {tool} em segundo plano, nesta pasta, para a IA trabalhar nos cards.', { tool }),
      };
    case 'signin':
      return {
        title: t('Login na linha de comando'),
        hint: t('As execuções pelo board usam a sua conta e o seu plano no {tool}. Sem login, elas falham antes de começar.', { tool }),
      };
    case 'mcp':
      return {
        title: t('MCP do board (faz-ai)'),
        hint: t(
          'O canal pelo qual a IA do {tool} lê e atualiza os cards deste board: consulta, move entre as colunas, comenta e anexa. Roda na sua máquina.',
          { tool },
        ),
      };
    case 'skill':
      return {
        title: t('Skill do fluxo ({name})', { name: FLOW_SKILL_NAME }),
        hint: t('Ensina a IA do {tool} a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências.', { tool }),
      };
    case 'permission':
      return {
        title: t('Nível de permissão das execuções'),
        hint: t('Diz o que a IA do {tool} pode fazer sozinha nas execuções pelo board. É escolhido em Configurações → Harness de IA.', {
          tool,
        }),
      };
    case 'git':
      return {
        title: t('Git'),
        hint: t(
          'Com o modo do Git ligado, o board cria uma branch ou uma worktree para cada história. O seu nome no Git assina os comentários.',
        ),
      };
    case 'repo':
      return {
        title: t('Repositório Git nesta pasta'),
        hint: t('Os modos de branch e de worktree precisam de um repositório. Sem ele, as histórias são trabalhadas direto na pasta.'),
      };
    case 'gh':
      return {
        title: t('GitHub CLI (gh)'),
        hint: t('O board usa o gh para fazer o merge automático do PR aprovado e para acompanhar os PRs abertos até o merge.'),
      };
    case 'gh-auth':
      return {
        title: t('Login no GitHub CLI'),
        hint: t(
          'O gh usa a sua conta do GitHub para ver e mesclar os PRs. Sem login, o merge automático e o acompanhamento não funcionam.',
        ),
      };
    case 'crg':
      return {
        title: t('Code Review Graph'),
        hint: t(
          'Entrega à IA um grafo do código (funções, classes, quem chama quem): ela acha o trecho certo sem ler arquivos inteiros e gasta menos tokens.',
        ),
      };
    case 'uv':
      return { title: t('uv'), hint: t('Instala e atualiza o Code Review Graph, isolado na própria pasta.') };
    case 'python':
      return {
        title: t('Python 3.10 ou mais novo'),
        hint: t('O Code Review Graph é um programa em Python. Sem um Python 3.10 ou mais novo, o uv baixa um só para ele.'),
      };
    case 'crg-graph':
      return {
        title: t('Grafo deste projeto'),
        hint: t('O Code Review Graph analisa o projeto uma vez; depois, o grafo se atualiza a cada mudança.'),
      };
    case 'crg-mcp':
      return {
        title: t('MCP do Code Review Graph'),
        hint: t('É por ele que a IA do {tool} consulta o grafo nas conversas e nas execuções.', { tool }),
      };
    case 'crg-embeddings':
      return {
        title: t('Busca semântica'),
        hint: t(
          'Deixa a IA buscar o código pelo significado ("onde validamos o login?"), e não só pelo nome. Com o provedor local, o código não sai da sua máquina.',
        ),
      };
  }
}

/** O estado em palavras, para quem não vê o ícone. */
function statusLabel(c: EnvCheck): string {
  if (c.status === 'ok') return t('Pronto');
  if (c.status === 'skipped') return t('Depende do item anterior');
  return t('Falta');
}

const ICON = {
  ok: <IconOk className="env-ok" aria-hidden />,
  missing: <IconMissing className="env-missing" aria-hidden />,
  skipped: <IconSkipped className="env-skipped" aria-hidden />,
};

/** O site entre parênteses, sem o `https://`. */
function DocsLink({ href }: { href: string }) {
  return (
    <span className="env-docs small">
      (
      <a href={href} target="_blank" rel="noreferrer">
        {href.replace(/^https?:\/\//, '').replace(/\/$/, '')} <IconExternal aria-hidden />
      </a>
      )
    </span>
  );
}

interface RowProps {
  check: EnvCheck;
  projectTool: AiTool;
  busy: boolean;
  onFixed: () => void;
}

/** Uma linha da lista: estado, nome (com o hint), versão, site e o comando; o que depende dela vem dentro. */
function Row({ check, projectTool, busy, onFixed }: RowProps) {
  const x = texts(check, projectTool);
  const r = check.requirement;
  const nodeTooOld = check.id === 'node' && check.status === 'missing' && check.version;
  return (
    <li className={`env-item ${check.status}`}>
      <div className="env-row">
        {ICON[check.status]}
        <span className="sr-only">{statusLabel(check)}:</span>
        <Hint content={x.hint}>
          <span tabIndex={0} className="env-name">
            {x.title}
          </span>
        </Hint>
        {check.version && (
          <span className="small muted">{nodeTooOld ? t('{version} encontrado', { version: `v${check.version}` }) : check.version}</span>
        )}
        {check.docs && <DocsLink href={check.docs} />}
      </div>
      {/* o comando com copiar; o login da ferramenta do projeto vem com o "Abrir no terminal" do aviso */}
      {check.command && (
        <div className="env-fix">
          {r?.action?.kind === 'command' ? <RequirementFix r={r} /> : <CopyCommand command={check.command} />}
          {check.id === 'crg-embeddings' && check.status !== 'ok' && (
            <span className="small muted">{t('Depois de instalar o pacote de embeddings.')}</span>
          )}
        </div>
      )}
      {/* o que o board resolve sozinho: o MCP, a skill e a permissão da ferramenta do projeto */}
      {check.status === 'missing' && r && !check.command && (
        <div className="env-fix">
          <p className="small muted">{requirementTexts(r).detail}</p>
          {busy ? (
            <p role="status" className="env-busy">
              <span className="spinner" aria-hidden /> {t('Aplicando e conferindo de novo…')}
            </p>
          ) : (
            <RequirementFix r={r} onFixed={onFixed} />
          )}
        </div>
      )}
      {check.children && check.children.length > 0 && (
        <ul className="env-list">
          {check.children.map((c) => (
            <Row key={c.id} check={c} projectTool={projectTool} busy={busy} onFixed={onFixed} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Section({ id, title, checks, ...rest }: { id: string; title: string; checks: EnvCheck[] } & Omit<RowProps, 'check'>) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <ul className="env-list">
        {checks.map((c) => (
          <Row key={`${c.id}-${c.tool ?? ''}`} check={c} {...rest} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Diagnóstico do ambiente: a lista do que o board precisa, do que é opcional (a outra ferramenta de
 * IA) e do que ele aproveita quando existe, com um ícone de pronto ou de falta em cada item. O board
 * não instala nada de terceiros: cada item traz o site de onde instalar ou o comando para copiar. Abre
 * sozinho na primeira abertura do board na máquina e, depois, pelo "Verificar ambiente" das
 * Configurações. Confere de novo cada vez que a tela abre.
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
  // um botão do board foi clicado: até a conferência seguinte terminar, os botões mostram que estão trabalhando
  const [fixing, setFixing] = useState(false);
  const busy = checking && fixing;
  const onFixed = () => {
    setFixing(true);
    recheck();
  };

  const missing = report ? missingCount(report.required) : 0;
  const suggested = report ? missingCount(report.recommended) : 0;
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
  const rowProps = { projectTool: report?.tool ?? tool, busy, onFixed };

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
          'O que o board precisa para trabalhar com o {tool}, as outras ferramentas de IA desta máquina e o que ele aproveita quando está instalado. Passe o mouse sobre um item para ver como o board o usa. O board instala só o próprio MCP e a skill do fluxo; o resto você instala pelo site indicado.',
          { tool: aiToolInfo(tool).label },
        )}
      </PageHeader>
      <p role="status" className="env-summary">
        <strong>{summary}</strong>
      </p>
      {report && (
        <>
          <Section id="env-required" title={t('Necessários')} checks={report.required} {...rowProps} />
          {report.optional.length > 0 && <Section id="env-optional" title={t('Opcionais')} checks={report.optional} {...rowProps} />}
          <Section id="env-recommended" title={t('Recomendados')} checks={report.recommended} {...rowProps} />
        </>
      )}
    </div>
  );
}
