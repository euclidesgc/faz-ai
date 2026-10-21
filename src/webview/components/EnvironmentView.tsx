import { useEffect } from 'react';
import { NODE_MIN_MAJOR, missingCount, type EnvCheck, type InstallStepKind } from '../../shared/environment';
import { useBoardStore } from '../store/boardStore';
import { t, tn } from '../i18n';
import { ui } from '../commands';
import { useAction } from '../useAction';
import { isWeb } from '../vscode';
import { PageHeader } from './settings/PageHeader';
import { CopyCommand, RequirementFix, requirementTexts } from './RequirementsBanner';
import type { ProfileHealth } from '../../shared/profileHealth';
import { ProfileBlock } from './environment/ProfileBlock';
import { Button, Hint, IconExternal, IconMissing, IconOk, IconSkipped } from './ui';

/** O nome do item e, no hint, como o board o usa; no idioma da interface. */
function texts(c: EnvCheck): { title: string; hint: string } {
  switch (c.id) {
    case 'node':
      return {
        title: t('Node.js {min} ou mais novo', { min: String(NODE_MIN_MAJOR) }),
        hint: t('Roda o MCP do board: a ferramenta de IA o inicia com o Node.js do PATH a cada conversa e a cada execução pelo board.'),
      };
    case 'harness':
      return {
        title: t('Banco de artefatos do board'),
        hint: t(
          'O banco de artefatos do board: as skills, agentes, servidores MCP e regras que as execuções podem usar, no modo de cada um. Sem ele o board funciona, mas sem o ganho de economia e precisão.',
        ),
      };
    case 'harness-artifacts':
      return {
        title: t('Artefatos no board'),
        hint: t(
          'Nenhuma skill, agente ou servidor MCP em modo "Pelo card": o planejamento dos cards não tem de onde escolher. Importe ou crie artefatos em Harness, na aba Artefatos do board.',
        ),
      };
    case 'harness-agents':
      return {
        title: t('Agente do board'),
        hint: t('Sem agente, toda execução roda com o escopo cheio. Crie um com "Criar agente com ajuda" ou "Sugerir agentes com IA".'),
      };
    case 'harness-rules':
      return {
        title: t('Regras revisadas'),
        hint: t('Há regras enviadas ao board ainda desligadas: revise o texto na aba Regras e ative, ou tire do board.'),
      };
    case 'harness-missing':
      return {
        title: t('Artefatos presentes'),
        hint: t(
          'Um artefato do board sumiu da origem; a aba do assunto mostra quais estão ausentes, para tirar do board ou repor o arquivo.',
        ),
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
    case 'branch-name':
      return {
        title: t('Nome da branch principal/develop'),
        hint: t(
          'O nome novo já está nas configurações, mas o repositório ainda usa o antigo. Renomear ou Desfazer na tela Git acerta o clone, o upstream e o origin; o comando abaixo é só o do clone local.',
        ),
      };
    case 'flow-skill-copy':
      return {
        title: t('Cópia antiga da skill do fluxo'),
        hint: t(
          'Versões anteriores instalaram a skill faz-ai-fluxo nas pastas das ferramentas. O fluxo agora vem do board, e a cópia só confunde as sessões que não são do board. O board não apaga o arquivo: apague os listados abaixo se não precisar deles.',
        ),
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
      return {
        title: t('uv'),
        hint: t(
          'Instala o Code Review Graph e o mantém atualizado, isolado na própria pasta. Se faltar um Python 3.10 ou mais novo, o uv baixa um só para ele: não é preciso instalar o Python antes.',
        ),
      };
    case 'crg-graph':
      return {
        title: t('Grafo deste projeto'),
        hint: t('O Code Review Graph analisa o projeto uma vez; depois, o grafo se atualiza a cada mudança.'),
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

/** O que faz cada passo da instalação que não se explica pelo comando. */
function stepText(step: InstallStepKind): string {
  switch (step) {
    case 'nvm':
      return t('Instala o nvm, o gerenciador de versões do Node.js:');
    case 'nvm-load':
      return t('Carrega o nvm neste terminal (num terminal novo, ele já vem carregado):');
    case 'node':
      return t('Instala o Node.js {min} com ele:', { min: String(NODE_MIN_MAJOR) });
    case 'path-save':
      return t('Põe a pasta ~/.local/bin, onde o programa foi instalado, no PATH dos próximos terminais:');
    case 'path-load':
      return t('Põe a pasta no PATH deste terminal, para achar o programa agora:');
    case 'apt-update':
      return t('Atualiza a lista de pacotes (numa máquina nova, o apt não acha nada antes disso):');
    case 'brew':
      return t('Pelo Homebrew (sem ele, instale antes pelo site brew.sh, ou baixe o instalador no site acima):');
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
}

/** Uma linha da lista: estado, nome (com o hint), versão, site e o comando; o que depende dela vem dentro. */
function Row({ check }: RowProps) {
  const x = texts(check);
  const r = check.requirement;
  const openSettings = useBoardStore((s) => s.openSettings);
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
      {/* a sugestão de como instalar, só enquanto falta: os comandos em ordem, cada um com copiar */}
      {check.status !== 'ok' && check.install && (
        <div className="env-fix">
          <span className="small muted">{check.install.length > 1 ? t('Para instalar, em ordem:') : t('Para instalar:')}</span>
          <ol className="env-commands">
            {check.install.map((s) => (
              <li key={s.command}>
                {s.step && <span className="small">{stepText(s.step)}</span>}
                <CopyCommand command={s.command} />
              </li>
            ))}
          </ol>
          {check.reopenTerminal && (
            <span className="small muted">
              {t('Depois, abra um terminal novo: o que já estava aberto não enxerga o programa recém-instalado.')}
            </span>
          )}
        </div>
      )}
      {/* o comando com copiar */}
      {check.command && (
        <div className="env-fix">
          {check.install && check.status !== 'ok' && <span className="small muted">{t('Depois:')}</span>}
          <CopyCommand command={check.command} />
          {check.inProject && <span className="small muted">{t('Na pasta do projeto.')}</span>}
        </div>
      )}
      {/* a cópia antiga da skill do fluxo: os arquivos a apagar à mão */}
      {check.paths?.length ? (
        <div className="env-fix">
          <span className="small muted">{t('Arquivos para apagar:')}</span>
          <ul className="env-commands">
            {check.paths.map((p) => (
              <li key={p}>
                <CopyCommand command={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* a renomeação pendente se resolve na tela Git (Renomear / Desfazer) */}
      {check.id === 'branch-name' && check.status === 'missing' && (
        <div className="env-fix">
          <Button size="small" variant="primary" onClick={() => openSettings('git')}>
            {t('Abrir a tela Git')}
          </Button>
        </div>
      )}
      {/* a recomendação do banco de artefatos: o texto do aviso e o atalho para o Harness */}
      {check.status === 'missing' && r && !check.command && (
        <div className="env-fix">
          <p className="small muted">{requirementTexts(r).detail}</p>
          <RequirementFix r={r} variant="primary" />
        </div>
      )}
      {check.children && check.children.length > 0 && (
        <ul className="env-list">
          {check.children.map((c) => (
            <Row key={c.id} check={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Section({ id, title, checks }: { id: string; title: string; checks: EnvCheck[] }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <ul className="env-list">
        {checks.map((c) => (
          <Row key={c.id} check={c} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Os perfis de CLI: um bloco por perfil ligado (o padrão primeiro) e, recolhido, o grupo dos desligados
 * e dos pendentes de revisão. O perfil que o aviso do topo apontou fica à vista, e o grupo abre se ele
 * estiver lá dentro.
 */
function ProfilesSection({ profiles, focus }: { profiles: ProfileHealth[]; focus: string | null }) {
  const on = profiles.filter((p) => p.registration === 'enabled');
  const off = profiles.filter((p) => p.registration !== 'enabled');
  return (
    <section aria-labelledby="env-profiles">
      <h3 id="env-profiles">{t('Perfis de CLI')}</h3>
      {on.length === 0 && <p className="small muted">{t('Nenhum perfil de CLI está ligado.')}</p>}
      {on.map((p) => (
        <ProfileBlock key={p.id} health={p} focused={p.id === focus} />
      ))}
      {off.length > 0 && (
        <details open={off.some((p) => p.id === focus)}>
          <summary>{t('Desligados ({n})', { n: off.length })}</summary>
          {off.map((p) => (
            <ProfileBlock key={p.id} health={p} focused={p.id === focus} />
          ))}
        </details>
      )}
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
  const focusProfile = useBoardStore((s) => s.environmentProfile);
  const setView = useBoardStore((s) => s.setView);
  // a espera é a da mensagem: o host confirma (`done`) quando o relatório já está no board, ou avisa a falha
  const check = useAction(() => ui.checkEnvironment());
  const checking = check.busy;
  // confere ao abrir: a pessoa pode ter instalado algo desde a última vez
  useEffect(() => {
    void check.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const recheck = () => void check.run();
  // recarregar a janela reinicia a extensão: as execuções de IA em andamento param, então pergunta antes
  const ask = useBoardStore((s) => s.ask);
  const running = useBoardStore((s) => s.state?.aiRuns.length ?? 0);
  const reload = () =>
    running
      ? ask({
          title: t('Recarregar a janela?'),
          message: tn(
            running,
            'A IA está trabalhando em {n} card. Recarregar a janela interrompe essa execução.',
            'A IA está trabalhando em {n} cards. Recarregar a janela interrompe essas execuções.',
          ),
          confirmLabel: t('Recarregar'),
          danger: true,
          onConfirm: () => ui.reloadWindow(),
        })
      : ui.reloadWindow();
  const missing = report ? missingCount(report.required) + (report.availability.blocked ? 1 : 0) : 0;
  const suggested = report ? missingCount(report.recommended) + missingCount([report.harness]) + report.availability.warnings.length : 0;
  const summary = !report
    ? check.error
      ? t('A conferência falhou. Tente de novo.')
      : t('Conferindo o ambiente…')
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
            <Button disabled={checking} onClick={recheck}>
              {t('Verificar de novo')}
            </Button>
            {/* no navegador a página não reinicia o host: recarregar só faz sentido no editor */}
            {!isWeb && (
              <Button
                title={t(
                  'Reinicia a extensão e lê de novo o PATH, as CLIs e os plugins. Use depois de instalar algo ou de atualizar a extensão.',
                )}
                onClick={reload}
              >
                {t('Recarregar a janela')}
              </Button>
            )}
            <Button variant="primary" onClick={() => setView('board')}>
              {t('Ir para o board')}
            </Button>
          </>
        }
      >
        {t(
          'O que o board precisa para trabalhar com a IA: o Node.js, cada perfil de CLI (linha de comando, login e credenciais), o banco de artefatos e o que ele aproveita quando está instalado. Passe o mouse sobre um item para ver como o board o usa. O board não instala nada de terceiros: instale pelo comando ou pelo site indicado.',
        )}
      </PageHeader>
      <p role="status" className="env-summary">
        <strong>{summary}</strong>
      </p>
      {report?.curlMissing && (
        <p className="small">
          {t(
            'Os comandos de instalação abaixo usam o curl, que não foi encontrado nesta máquina. Instale-o antes pelo gerenciador de pacotes do sistema.',
          )}{' '}
          <DocsLink href="https://curl.se/download.html" />
        </p>
      )}
      {report && (
        <>
          <Section id="env-required" title={t('Necessários')} checks={report.required} />
          <ProfilesSection profiles={report.profiles} focus={focusProfile} />
          <Section id="env-harness" title={t('Banco de artefatos')} checks={[report.harness]} />
          <Section id="env-recommended" title={t('Recomendados')} checks={report.recommended} />
        </>
      )}
    </div>
  );
}
