import { useState } from 'react';
import { Badge, Button, Checkbox, Dialog, Tabs, TextField } from '@radix-ui/themes';
import type { AgentMeta, LibraryArtifactInput, ToolCategory } from '../../../../shared/artifacts';
import type { AgentAssistInput, AgentAssistResult, AgentAssistStep } from '../../../../shared/agentAssistance';
import { chat, harness, settings } from '../../../commands';
import { requestAgentAssistance } from '../../../request';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { getLocale, t } from '../../../i18n';
import { ActionButton, FormField } from '../../ui';
import { MarkdownEditor } from '../../MarkdownEditor';
import { ModelEditor } from '../../FieldRenderer';
import { LIBRARY_GUIDE } from './libraryGuide';
import { modelDisplay } from '../../../../shared/models';

const TABS = {
  instructions: 'Instruções',
  model: 'Modelo',
  tools: 'Permissões',
  skills: 'Skills',
  mcp: 'MCPs',
  review: 'Revisão',
} as const;
type Tab = keyof typeof TABS;
const SECTIONS = ['responsibility', 'scope', 'procedure', 'delivery'] as const;
const CATEGORIES: { id: ToolCategory; label: string; hint: string }[] = [
  {
    id: 'read',
    label: 'Leitura',
    hint: 'Permite ler arquivos e buscar nomes, trechos e referências no projeto. Indicado para análise e revisão.',
  },
  {
    id: 'edit',
    label: 'Edição',
    hint: 'Permite criar e alterar arquivos. Marque para agentes que implementam mudanças; deixe desmarcado para revisores que só apontam problemas.',
  },
  {
    id: 'run',
    label: 'Comandos',
    hint: 'Permite executar comandos no terminal, como testes e builds. Comandos também podem alterar arquivos; descreva no conteúdo quais são permitidos.',
  },
  {
    id: 'net',
    label: 'Rede',
    hint: 'Permite pesquisar e consultar conteúdo na internet. Use quando a tarefa precisar de documentação externa atualizada.',
  },
  {
    id: 'agents',
    label: 'Subagentes',
    hint: 'Permite delegar partes da tarefa a outros subagentes, quando a ferramenta suporta isso. Use apenas para agentes que precisam coordenar outros especialistas.',
  },
];
const EMPTY: AgentMeta = { skills: [], mcpServers: [], model: '', tools: { categories: [], native: { tool: '', allow: [], deny: [] } } };

export function LibraryAgentEditor({
  initial,
  guided = false,
  onClose,
}: {
  initial?: LibraryArtifactInput;
  guided?: boolean;
  onClose: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [returnFocus] = useState(() => document.activeElement);
  const [tab, setTab] = useState<Tab>('instructions');
  const [section, setSection] = useState<AgentAssistStep>(guided ? 'responsibility' : 'content');
  const [name, setName] = useState(initial?.name ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastBuilt, setLastBuilt] = useState('');
  const [agent, setAgent] = useState<AgentMeta>(initial?.agent ?? EMPTY);
  const [proposal, setProposal] = useState<{ step: AgentAssistStep; signature: string; context: string; result: AgentAssistResult } | null>(
    null,
  );
  const [reviewed, setReviewed] = useState('');
  const [applied, setApplied] = useState(false);
  const [query, setQuery] = useState('');
  const [lastAttempt, setLastAttempt] = useState<AgentAssistStep | null>(null);
  const buildBody = () =>
    LIBRARY_GUIDE.agent
      .flatMap((part, index) => (answers[SECTIONS[index]!]?.trim() ? [`## ${t(part.title)}\n\n${answers[SECTIONS[index]!]!.trim()}`] : []))
      .join('\n\n');
  const assembledBody = buildBody();
  const effectiveBody = (!body.trim() || body === lastBuilt) && assembledBody ? assembledBody : body;
  const draft: AgentAssistInput = {
    name,
    body: effectiveBody,
    agent,
    sections: answers,
    step: tab === 'instructions' ? section : tab,
    language: getLocale(),
  };
  // A revisão vale para a definição inteira, independentemente da aba que estiver aberta.
  const signature = JSON.stringify({ name, body: effectiveBody, agent, answers });
  const index = SECTIONS.indexOf(section as (typeof SECTIONS)[number]);
  const guide = index >= 0 ? LIBRARY_GUIDE.agent[index] : undefined;
  const activeStep: AgentAssistStep = tab === 'instructions' ? section : tab;
  const context = JSON.stringify({ name, body: effectiveBody, answers });
  const currentProposal =
    proposal?.step === activeStep &&
    (proposal.signature === signature || ((activeStep === 'skills' || activeStep === 'mcp') && proposal.context === context))
      ? proposal.result
      : null;
  const busyChat = state.chat.busy;
  const assist = useAction(async (step: AgentAssistStep) => {
    setApplied(false);
    setLastAttempt(step);
    const result = await requestAgentAssistance({ ...draft, step }, (state.board.runner.timeoutMinutes + 1) * 60_000);
    setProposal({ step, signature, context, result });
    if (step === 'review') setReviewed(signature);
  });
  const detecting = useAction(() => settings.detectModels(state.board.aiTool));
  const save = useAction(async () => {
    await harness.saveLibraryArtifact({
      id: initial?.id,
      kind: 'agent',
      name,
      description:
        initial?.description ||
        (answers.responsibility || effectiveBody.split('\n').find((line) => line.trim() && !line.startsWith('#')) || name)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
      body: effectiveBody,
      agent,
    });
    onClose();
  });
  const changeTab = (next: Tab) => {
    if (tab === 'instructions' && (!body.trim() || body === lastBuilt)) {
      const content = buildBody();
      if (content) {
        setBody(content);
        setLastBuilt(content);
      }
    }
    setQuery('');
    setTab(next);
  };
  const changeSection = (next: AgentAssistStep) => {
    if (next === 'content' && (!body.trim() || body === lastBuilt)) {
      const content = buildBody();
      if (content) {
        setBody(content);
        setLastBuilt(content);
      }
    }
    setSection(next);
  };
  const applyContent = () => {
    if (!currentProposal?.content) return;
    if (tab === 'instructions' && section !== 'content') setAnswers({ ...answers, [section]: currentProposal.content });
    else {
      setBody(currentProposal.content);
      if (tab === 'review') setReviewed(JSON.stringify({ name, body: currentProposal.content, agent, answers }));
    }
    setApplied(true);
  };
  const analyzeBeforeSave = () => {
    changeTab('review');
    void assist.run('review');
  };
  const artifacts = state.harness.library?.artifacts ?? [];
  const dependencies = artifacts.filter((a) => a.kind === (tab === 'mcp' ? 'mcp' : 'skill'));
  const recommendations = currentProposal ? (tab === 'mcp' ? currentProposal.mcpServers : currentProposal.skills) : [];
  const selectedField = tab === 'mcp' ? 'mcpServers' : 'skills';
  const blocked = assist.busy || save.busy;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !blocked && onClose()}>
      <Dialog.Content
        maxWidth="1000px"
        className="scope-harness board-library library-agent-dialog"
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (blocked) event.preventDefault();
        }}
      >
        <Dialog.Title>{initial ? t('Editar subagente') : t('Criar subagente')}</Dialog.Title>
        <div className="library-editor library-agent-editor" aria-label={t('Editor de subagente')}>
          <Dialog.Description className="muted small">
            {t(
              'Um subagente é um especialista com instruções e ferramentas próprias. Ele recebe uma tarefa delimitada e devolve um resultado ao agente que o chamou. No board, também pode ser escolhido para executar um card ou uma fase; cadastrá-lo não o torna o agente padrão. O suporte à delegação depende da ferramenta de IA.',
            )}
          </Dialog.Description>
          <FormField label={t('Nome')} hint={t('Escolha um nome curto para a especialidade, como revisor-de-seguranca.')}>
            {(id) => (
              <TextField.Root
                id={id}
                aria-label={t('Nome')}
                value={name}
                disabled={!!initial || blocked}
                onChange={(e) => setName(e.target.value)}
                placeholder="revisor-de-seguranca"
              />
            )}
          </FormField>
          <Tabs.Root value={tab} onValueChange={(value) => changeTab(value as Tab)}>
            <Tabs.List aria-label={t('Definição do subagente')}>
              {Object.entries(TABS).map(([id, label]) => (
                <Tabs.Trigger value={id} key={id} aria-label={t(label)} disabled={blocked}>
                  {t(label)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="instructions">
              <p className="muted small">
                {t(
                  'Defina quando chamar este especialista, o que ele deve fazer e como deve entregar o resultado. Preencha as partes com suas palavras ou peça ajuda à IA em cada uma. O conteúdo final reúne essas instruções em Markdown.',
                )}
              </p>
              <Tabs.Root value={section} onValueChange={(value) => changeSection(value as AgentAssistStep)}>
                <Tabs.List aria-label={t('Partes das instruções')}>
                  {LIBRARY_GUIDE.agent.map((part, i) => (
                    <Tabs.Trigger key={part.title} value={SECTIONS[i]!} aria-label={t(part.title)} disabled={blocked}>
                      {t(part.title)}
                    </Tabs.Trigger>
                  ))}
                  <Tabs.Trigger value="content" aria-label={t('Conteúdo')} disabled={blocked}>
                    {t('Conteúdo')}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value={section}>
                  {guide ? (
                    <div className="library-guide-question">
                      <p className="muted small">{t(guide.hint)}</p>
                      <FormField label={t(guide.title)}>
                        {(id) => (
                          <MarkdownEditor
                            id={id}
                            ariaLabel={t(guide.title)}
                            value={answers[section] ?? ''}
                            onChange={(value) => setAnswers({ ...answers, [section]: value })}
                            placeholder={t('{instruction}\n\nExemplo:\n{example}', {
                              instruction: t(guide.hint),
                              example: t(guide.example),
                            })}
                            minRows={5}
                          />
                        )}
                      </FormField>
                      <div className="library-guide-example">
                        <strong>{t('Exemplo para adaptar')}</strong>
                        <p>{t(guide.example)}</p>
                        <Button
                          size="1"
                          variant="soft"
                          disabled={blocked}
                          onClick={() =>
                            setAnswers({
                              ...answers,
                              [section]: answers[section]?.trim() ? `${answers[section]}\n\n${t(guide.example)}` : t(guide.example),
                            })
                          }
                        >
                          {t('Usar este exemplo')}
                        </Button>
                      </div>
                      <Button variant="soft" disabled={blocked} onClick={() => changeSection(SECTIONS[index + 1] ?? 'content')}>
                        {t('Continuar')}
                      </Button>
                    </div>
                  ) : (
                    <FormField
                      label={t('Conteúdo')}
                      hint={t(
                        'Revise o Markdown completo. Explique quando delegar, a responsabilidade, os limites e os critérios de conclusão.',
                      )}
                    >
                      {(id) => (
                        <MarkdownEditor
                          id={id}
                          ariaLabel={t('Conteúdo')}
                          value={body}
                          onChange={setBody}
                          placeholder={t(
                            'Exemplo: revise autenticação e permissões, sem editar arquivos. Entregue achados com arquivo, impacto e evidência; se não houver problemas, diga o que foi verificado.',
                          )}
                          minRows={10}
                        />
                      )}
                    </FormField>
                  )}
                </Tabs.Content>
              </Tabs.Root>
              {section === 'content' && Object.values(answers).some((value) => value.trim()) && (
                <Button
                  variant="soft"
                  disabled={blocked}
                  onClick={() => {
                    const rebuild = () => {
                      const content = buildBody();
                      setBody(content);
                      setLastBuilt(content);
                    };
                    if (body.trim() && body !== lastBuilt)
                      useBoardStore.getState().ask({
                        title: t('Montar conteúdo com as respostas?'),
                        message: t('O conteúdo atual será substituído pelo texto das partes preenchidas.'),
                        confirmLabel: t('Montar conteúdo'),
                        onConfirm: rebuild,
                      });
                    else rebuild();
                  }}
                >
                  {t('Montar conteúdo com respostas')}
                </Button>
              )}
            </Tabs.Content>
            <Tabs.Content value="model">
              <p className="muted small">
                {t(
                  'O modelo executa as instruções deste especialista. Escolha entre os modelos disponíveis para a ferramenta atual ou deixe vazio (—) para usar o modelo do card ou da sessão. Prefira um modelo compatível com a complexidade da tarefa.',
                )}
              </p>
              <FormField label={t('Modelo')} hint={t('Vazio usa o modelo do card ou da sessão.')}>
                {() => (
                  <ModelEditor
                    value={agent.model || null}
                    onChange={(value) => setAgent({ ...agent, model: typeof value === 'string' ? value : '' })}
                  />
                )}
              </FormField>
              <ActionButton
                variant="soft"
                loading={detecting.busy}
                disabled={blocked}
                hint={t('Consulta a ferramenta de IA e atualiza os modelos disponíveis neste board.')}
                onClick={() => void detecting.run()}
              >
                {t('Detectar modelos disponíveis')}
              </ActionButton>
              {detecting.error && <p role="alert">{t(detecting.error)}</p>}
            </Tabs.Content>
            <Tabs.Content value="tools">
              <p className="muted small">
                {t(
                  'As permissões definem quais ferramentas o agente pode usar. Marque só as necessárias e descreva no conteúdo os limites de uso. O board mantém suas próprias ferramentas de fluxo; estas categorias controlam as capacidades adicionais do especialista.',
                )}
              </p>
              <div className="agent-permission-list">
                {CATEGORIES.map((category) => (
                  <label className="agent-permission-option" key={category.id}>
                    <Checkbox
                      aria-label={t(category.label)}
                      disabled={blocked}
                      checked={agent.tools.categories.includes(category.id)}
                      onCheckedChange={(checked) =>
                        setAgent({
                          ...agent,
                          tools: {
                            categories: checked
                              ? [...agent.tools.categories, category.id]
                              : agent.tools.categories.filter((value) => value !== category.id),
                            native: { tool: '', allow: [], deny: [] },
                          },
                        })
                      }
                    />
                    <span>
                      <strong>{t(category.label)}</strong>
                      <p className="muted small">{t(category.hint)}</p>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted small">
                {t(
                  'A capacidade de impor essas restrições varia conforme a ferramenta. Regras escritas no conteúdo continuam necessárias, especialmente para comandos e ações externas.',
                )}
              </p>
            </Tabs.Content>
            {(['skills', 'mcp'] as const).map((id) => (
              <Tabs.Content key={id} value={id}>
                <p className="muted small">
                  {id === 'skills'
                    ? t(
                        'Skills são procedimentos reutilizáveis: ensinam como executar uma tarefa, com passos, referências e critérios de validação. Escolha as que este especialista precisa conhecer. Elas complementam suas instruções; selecionar todas aumenta o contexto sem necessariamente melhorar o resultado.',
                      )
                    : t(
                        'MCP (Model Context Protocol) é um padrão para conectar a IA a ferramentas e fontes de dados, como documentação, bancos e serviços. Um servidor MCP oferece operações que o agente pode chamar. Use quando a tarefa precisar dessas integrações: o acesso fica explícito e padronizado, mas não é necessário para todo agente.',
                      )}
                </p>
                {id === 'mcp' && (
                  <p className="muted small">
                    {t(
                      'Os MCPs abaixo foram encontrados na biblioteca do board. Escolha apenas os necessários e explique no conteúdo para quê podem ser usados. A seleção permite acesso às ferramentas do servidor; não substitui a definição de limites para ações externas.',
                    )}
                  </p>
                )}
                <div className="row wrap">
                  <TextField.Root
                    type="search"
                    aria-label={id === 'skills' ? t('Filtrar skills do subagente') : t('Filtrar MCPs do subagente')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('Buscar por nome ou descrição…')}
                  />
                  <Button
                    variant="soft"
                    disabled={blocked || recommendations.length === 0}
                    onClick={() =>
                      setAgent({
                        ...agent,
                        [selectedField]: [...new Set([...agent[selectedField], ...recommendations.map((item) => item.name)])],
                      })
                    }
                  >
                    {t('Selecionar indicadas')}
                  </Button>
                </div>
                {dependencies.length === 0 && (
                  <p className="muted small">
                    {t('Nenhum item deste tipo na biblioteca. Crie ou importe um na respectiva aba do Harness.')}
                  </p>
                )}
                {dependencies
                  .filter((a) => `${a.name} ${a.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
                  .map((item) => {
                    const reason = recommendations.find((entry) => entry.name === item.name)?.reason;
                    return (
                      <label className="agent-dependency-option" key={item.id}>
                        <Checkbox
                          aria-label={item.name}
                          disabled={blocked || (item.missing && !agent[selectedField].includes(item.name))}
                          checked={agent[selectedField].includes(item.name)}
                          onCheckedChange={(checked) =>
                            setAgent({
                              ...agent,
                              [selectedField]: checked
                                ? [...agent[selectedField], item.name]
                                : agent[selectedField].filter((name) => name !== item.name),
                            })
                          }
                        />
                        <span>
                          <strong>{item.name}</strong>
                          {reason && <Badge size="1">{t('Indicada pela IA')}</Badge>}
                          <p className="muted small">
                            {item.description || t('Sem descrição cadastrada. Revise este artefato na biblioteca antes de selecioná-lo.')}
                          </p>
                          {item.kind === 'mcp' && item.mcpSummary && <p className="muted small">{item.mcpSummary}</p>}
                          {reason && <p className="muted small">{reason}</p>}
                          {item.missing && <p className="muted small">{t('Arquivo ausente; este item não pode ser selecionado.')}</p>}
                        </span>
                      </label>
                    );
                  })}
                {agent[selectedField]
                  .filter((name) => !dependencies.some((item) => item.name === name))
                  .map((name) => (
                    <label className="agent-dependency-option" key={`missing-${name}`}>
                      <Checkbox
                        aria-label={name}
                        checked
                        disabled={blocked}
                        onCheckedChange={() =>
                          setAgent({ ...agent, [selectedField]: agent[selectedField].filter((value) => value !== name) })
                        }
                      />
                      <span>
                        <strong>{name}</strong>
                        <p className="muted small">
                          {t('Item não encontrado na biblioteca. Desmarque para retirar esta referência do agente.')}
                        </p>
                      </span>
                    </label>
                  ))}
              </Tabs.Content>
            ))}
            <Tabs.Content value="review">
              <p className="muted small">
                {t(
                  'Antes de salvar, a IA analisa o conteúdo, o modelo, as permissões, as skills e os MCPs escolhidos. Revise as sugestões e escolha se deseja melhorar o conteúdo ou salvar a definição como está.',
                )}
              </p>
              <dl className="wizard-summary">
                <dt>{t('Nome')}</dt>
                <dd>{name || '—'}</dd>
                <dt>{t('Modelo')}</dt>
                <dd>{agent.model ? modelDisplay(state.board.modelCatalog, agent.model) : t('Modelo do card ou da sessão')}</dd>
                <dt>{t('Permissões')}</dt>
                <dd>{agent.tools.categories.map((category) => t(CATEGORIES.find((c) => c.id === category)!.label)).join(', ') || '—'}</dd>
                <dt>Skills</dt>
                <dd>{agent.skills.join(', ') || '—'}</dd>
                <dt>MCPs</dt>
                <dd>{agent.mcpServers.join(', ') || '—'}</dd>
              </dl>
              <pre className="wizard-preview">{effectiveBody || t('Preencha as instruções para revisar o subagente.')}</pre>
            </Tabs.Content>
          </Tabs.Root>
          <div className="row wrap">
            <ActionButton
              variant="soft"
              loading={assist.busy}
              disabled={save.busy || (busyChat && !assist.busy)}
              disabledReason={t('Aguarde a resposta da IA.')}
              hint={t('Analisa esta parte e propõe uma definição usando o objetivo do agente e os itens disponíveis no board.')}
              onClick={() => void assist.run(activeStep)}
            >
              {tab === 'review'
                ? t('Analisar definição com IA')
                : tab === 'skills' || tab === 'mcp'
                  ? t('Indicar com IA')
                  : t('Ajudar com IA')}
            </ActionButton>
          </div>
          {assist.busy && (
            <Button variant="soft" onClick={() => chat.stop()}>
              {t('Interromper assistência')}
            </Button>
          )}
          {currentProposal && (
            <section className="agent-ai-proposal" aria-label={t('Sugestões da IA')}>
              <p>{currentProposal.explanation}</p>
              <ul>
                {currentProposal.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
              {currentProposal.content && (
                <>
                  <details>
                    <summary>{t('Ver conteúdo sugerido')}</summary>
                    <pre className="wizard-preview">{currentProposal.content}</pre>
                  </details>
                  <Button variant="soft" disabled={blocked} onClick={applyContent}>
                    {tab === 'review' ? t('Melhorar conteúdo automaticamente') : t('Aplicar sugestão')}
                  </Button>
                </>
              )}
              {tab === 'model' && (
                <p className="muted small">
                  {t('Modelo indicado: {model}', {
                    model: currentProposal.model
                      ? modelDisplay(state.board.modelCatalog, currentProposal.model)
                      : t('Modelo do card ou da sessão'),
                  })}
                </p>
              )}
              {tab === 'model' && (
                <Button variant="soft" disabled={blocked} onClick={() => setAgent({ ...agent, model: currentProposal.model })}>
                  {t('Usar modelo indicado')}
                </Button>
              )}
              {tab === 'tools' && (
                <>
                  <p className="muted small">
                    {t('Permissões indicadas: {items}', {
                      items:
                        currentProposal.categories.map((category) => t(CATEGORIES.find((c) => c.id === category)!.label)).join(', ') || '—',
                    })}
                  </p>
                  <Button
                    variant="soft"
                    disabled={blocked}
                    onClick={() =>
                      setAgent({ ...agent, tools: { categories: currentProposal.categories, native: { tool: '', allow: [], deny: [] } } })
                    }
                  >
                    {t('Usar permissões indicadas')}
                  </Button>
                </>
              )}
            </section>
          )}
          {applied && (
            <p role="status" className="muted small">
              {t('Sugestão aplicada ao rascunho. Revise o resultado antes de salvar.')}
            </p>
          )}
          {(assist.error || save.error) && <p role="alert">{t(assist.error || save.error!)}</p>}
          <div className="form-actions">
            <Button variant="ghost" disabled={blocked} onClick={onClose}>
              {t('Cancelar')}
            </Button>
            <ActionButton
              loading={assist.busy || save.busy}
              disabled={!name.trim() || !effectiveBody.trim() || (busyChat && !assist.busy)}
              disabledReason={t('Preencha nome e conteúdo e aguarde a IA terminar.')}
              hint={t('Analisa as definições com IA antes da confirmação de salvamento.')}
              onClick={() => (tab === 'review' && reviewed === signature ? void save.run() : analyzeBeforeSave())}
            >
              {tab === 'review' && reviewed === signature
                ? applied
                  ? t('Salvar na biblioteca')
                  : t('Salvar como está')
                : t('Revisar e salvar')}
            </ActionButton>
            {tab === 'review' && lastAttempt === 'review' && assist.error && (
              <Button variant="soft" disabled={blocked || !name.trim() || !effectiveBody.trim()} onClick={() => void save.run()}>
                {t('Salvar sem revisão de IA')}
              </Button>
            )}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
