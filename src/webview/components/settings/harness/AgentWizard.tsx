import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import { AGENT_FORMAT, agentToolGroup } from '../../../../shared/agentTools';
import {
  AGENT_WIZARD_STEPS,
  draftAgentInstructions,
  nameFromText,
  suggestAgentModel,
  suggestAgentTools,
  workKind,
} from '../../../../shared/agentWizard';
import type { AgentSuggestion } from '../../../../shared/agentSuggestions';
import { TOOL_PRESETS } from '../../../../shared/execution';
import type { InstallScope } from '../../../../shared/harness';
import { isFreeName, toItemName, type AiToolInfo } from '../../../../shared/harnessProject';
import { selectedMcpNames } from '../../../../shared/harnessSelection';
import type { AgentInput } from '../../../../shared/messages';
import { modelDisplay } from '../../../../shared/models';
import { skillCatalog, suggestSkills } from '../../../../shared/skillCatalog';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ModelEditor } from '../../FieldRenderer';
import { SkillPicker } from '../../skills/SkillPicker';
import { ChipsEditor, FormField, IconWarning } from '../../ui';
import { ToolChecklist } from './ToolChecklist';
import { WizardQuestion, WizardShell } from './Wizard';
import { t } from '../../../i18n';

/** Os passos, na ordem; o nome (em português) é a chave da tradução. */
const STEPS = AGENT_WIZARD_STEPS;

interface Answers {
  directive: string;
  tools: string[];
  /** a pessoa mexeu nas ferramentas: a sugestão da diretriz não as sobrescreve mais */
  toolsTouched: boolean;
  readonly: boolean;
  background: boolean;
  mcp: string[];
  skills: string[];
  model: string;
  modelTouched: boolean;
  standards: string;
  never: string;
  /** o texto das instruções depois que a pessoa o editou; null = o rascunho gerado das respostas */
  body: string | null;
  name: string | null;
  description: string | null;
}

const EMPTY: Answers = {
  directive: '',
  tools: [],
  toolsTouched: false,
  readonly: false,
  background: false,
  mcp: [],
  skills: [],
  model: '',
  modelTouched: false,
  standards: '',
  never: '',
  body: null,
  name: null,
  description: null,
};

/**
 * "Criar agente com ajuda": sete perguntas, uma por vez, cada uma com um exemplo de resposta e uma sugestão que
 * não esconde as opções. O escopo fica o menor possível: ferramentas, servidores e skills só entram se marcados.
 * Nada é gravado antes do botão do último passo; uma sugestão pronta abre o assistente com as respostas feitas.
 */
export function AgentWizard({
  tool,
  scope,
  preset,
  onClose,
}: {
  tool: AiToolInfo;
  scope: InstallScope;
  preset?: AgentSuggestion;
  onClose: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const format = AGENT_FORMAT[tool.id];
  const catalog = state.board.modelCatalog;
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(() => {
    if (!preset) return EMPTY;
    const model = suggestAgentModel(preset.model, catalog, tool.id);
    return {
      ...EMPTY,
      directive: preset.directive,
      tools: preset.tools,
      toolsTouched: true,
      readonly: preset.readonly,
      model: model?.value ?? '',
      modelTouched: true,
      body: preset.instructions,
      name: preset.name,
    };
  });
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  const suggestedTools = useMemo(() => suggestAgentTools(a.directive), [a.directive]);
  const kind = workKind(a.directive);
  const suggestedModel = useMemo(() => suggestAgentModel(kind, catalog, tool.id), [kind, catalog, tool.id]);
  const board = selectedMcpNames(state);
  const skills = skillCatalog(state, 'contextual');
  const suggestedSkills = useMemo(() => suggestSkills(a.directive, skills, 3), [a.directive, skills]);
  const writes = suggestedTools.some((x) => agentToolGroup(tool.id, x.tool)?.id === 'edit');
  const widening = a.tools.filter((x) => agentToolGroup(tool.id, x)?.widens);

  const name = a.name ?? nameFromText(a.directive);
  const description = a.description ?? a.directive.replace(/\s+/g, ' ').trim();
  const nameOk = isFreeName(name, state.harness.agents);
  const draft = draftAgentInstructions(tool.id, {
    directive: a.directive,
    tools: a.tools,
    readonly: a.readonly,
    skills: a.skills,
    mcp: a.mcp,
    standards: a.standards,
    never: a.never,
  });
  const body = a.body ?? draft;

  const next = () => {
    // quem não mexeu na resposta fica com a sugestão da diretriz
    if (step === 0 && !a.toolsTouched) set({ tools: format.tools ? suggestedTools.map((x) => x.tool) : [], readonly: !writes });
    if (step === 3 && !a.modelTouched && suggestedModel) set({ model: suggestedModel.value });
    if (step === STEPS.length - 1) {
      const input: AgentInput = {
        name,
        description,
        body,
        model: a.model,
        tools: format.tools ? a.tools : [],
        deniedTools: [],
        skills: format.skills ? a.skills : [],
        mcp: format.mcp ? a.mcp : [],
        ...(format.readonly && a.readonly ? { readonly: true } : {}),
        ...(format.background && a.background ? { background: true } : {}),
      };
      harness.createAgent(scope, input);
      onClose();
      return;
    }
    setStep(step + 1);
  };

  const disabled = step === 0 ? !a.directive.trim() : step === STEPS.length - 1 ? !nameOk || !description : false;
  const unsupported = (what: string, canSkip = true) => (
    <p className="muted small">
      {t('O {tool} não aceita {what} no arquivo do agente: ele herda tudo da conversa principal.', { tool: tool.label, what })}
      {canSkip && ` ${t('Pode continuar.')}`}
    </p>
  );

  return (
    <WizardShell
      label={t('Criar agente com ajuda')}
      steps={STEPS}
      step={step}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onCancel={onClose}
      finishLabel={t('Criar agente')}
      nextDisabled={disabled}
    >
      {step === 0 && (
        <WizardQuestion
          question={t('Para que este agente existe? Diga o papel e o objetivo dele.')}
          example={t('Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada.')}
        >
          <FormField label={t('Diretriz')} hint={t('Quanto mais estreito o papel, menos ferramentas e contexto o agente precisa.')}>
            {(id) => <TextArea id={id} rows={3} autoFocus value={a.directive} onChange={(e) => set({ directive: e.target.value })} />}
          </FormField>
        </WizardQuestion>
      )}

      {step === 1 && format.tools && (
        <WizardQuestion
          question={t('Que ferramentas ele precisa? O conjunto mínimo para a diretriz já vem sugerido.')}
          example={t('Read, Grep e Glob para ler o código, e Bash só para git diff.')}
        >
          <div className="wizard-suggestion">
            <strong>{t('Sugestão para o que você descreveu')}</strong>
            <ul>
              {suggestedTools.map((x) => (
                <li key={x.tool}>
                  <code>{x.tool}</code> {t(x.reason)}
                </li>
              ))}
            </ul>
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={() => set({ tools: suggestedTools.map((x) => x.tool), toolsTouched: true })}
            >
              {t('Usar a sugestão')}
            </Button>
          </div>
          <div className="agent-presets">
            {TOOL_PRESETS.map((p) => (
              <Button
                key={p.id}
                variant="soft"
                color="gray"
                size="1"
                title={t(p.hint)}
                onClick={() => set({ tools: p.tools, toolsTouched: true })}
              >
                {t(p.label)}
              </Button>
            ))}
          </div>
          <ToolChecklist tool={tool.id} value={a.tools} servers={board} onChange={(tools) => set({ tools, toolsTouched: true })} />
          {widening.length > 0 && (
            <p className="wizard-warning">
              <IconWarning /> {t('Estas escolhas ampliam o escopo do agente: {names}.', { names: widening.join(', ') })}
            </p>
          )}
          {a.tools.length === 0 && (
            <p className="muted small">{t('Nada marcado: o agente usa as ferramentas que o nível de permissão da execução libera.')}</p>
          )}
        </WizardQuestion>
      )}
      {step === 1 && !format.tools && (
        <WizardQuestion
          question={t('O agente pode alterar o projeto?')}
          example={t('Somente leitura, para um revisor que só aponta problemas.')}
        >
          {unsupported(t('lista de ferramentas'), false)}
          <div className="agent-flags">
            <label className="tool-option">
              <Checkbox aria-label={t('Somente leitura')} checked={a.readonly} onCheckedChange={(v) => set({ readonly: v === true })} />
              <span>{t('Somente leitura')}</span>
              <span className="muted small">{t('Não edita arquivos nem roda comandos que mudem estado.')}</span>
            </label>
            <label className="tool-option">
              <Checkbox
                aria-label={t('Em segundo plano')}
                checked={a.background}
                onCheckedChange={(v) => set({ background: v === true })}
              />
              <span>{t('Em segundo plano')}</span>
              <span className="muted small">{t('Roda sem a conversa esperar pelo resultado.')}</span>
            </label>
          </div>
          <p className="muted small">
            {writes
              ? t('Pela diretriz, o agente parece precisar editar arquivos.')
              : t('Pela diretriz, o agente parece só precisar ler: somente leitura é o mais seguro.')}
          </p>
        </WizardQuestion>
      )}

      {step === 2 && (
        <WizardQuestion
          question={t('Precisa de algum servidor MCP além do do board?')}
          example={t('Nenhum: o servidor do board já cobre o que um revisor faz.')}
        >
          {format.mcp ? (
            <>
              <p className="muted small">
                <Badge color="indigo" variant="soft">
                  faz-ai
                </Badge>{' '}
                {t('O servidor do board vai sempre, sem marcar.')}
              </p>
              <ChipsEditor options={[...new Set([...board, ...a.mcp])]} values={a.mcp} onChange={(mcp) => set({ mcp })}>
                {board.length === 0 && <span className="muted small">{t('Nenhum outro servidor no board. Envie-os pela aba MCPs.')}</span>}
              </ChipsEditor>
            </>
          ) : (
            unsupported(t('servidores MCP'))
          )}
        </WizardQuestion>
      )}

      {step === 3 && (
        <WizardQuestion
          question={t('Alguma skill de apoio? Vale uma por assunto.')}
          example={t('Nenhuma, ou só a skill de revisão de código do projeto.')}
        >
          {format.skills ? (
            <>
              {suggestedSkills.length > 0 && (
                <div className="wizard-suggestion">
                  <strong>{t('Sugeridas pela diretriz')}</strong>
                  <ChipsEditor
                    options={suggestedSkills.map((k) => ({ value: k.name, title: k.description }))}
                    values={a.skills}
                    onChange={(list) => set({ skills: list })}
                  />
                </div>
              )}
              <SkillPicker value={a.skills} onChange={(list) => set({ skills: list })} intent={a.directive} usage="contextual" />
              {a.skills.length > 1 && (
                <p className="wizard-warning">
                  <IconWarning /> {t('Você marcou {n} skills: confira se cada uma é de um assunto diferente.', { n: a.skills.length })}
                </p>
              )}
              {skills.length === 0 && (
                <p className="muted small">{t('Nenhuma skill no board em "Pelo card". Envie-as pela aba Skills.')}</p>
              )}
            </>
          ) : (
            unsupported(t('skills'))
          )}
        </WizardQuestion>
      )}

      {step === 4 && (
        <WizardQuestion
          question={t('Que modelo e esforço ele usa?')}
          example={t('O menor modelo com esforço baixo, para um agente que só lê e revisa.')}
        >
          {suggestedModel && (
            <div className="wizard-suggestion">
              <strong>{t('Sugestão: {model}', { model: modelDisplay(catalog, suggestedModel.value, false, t) })}</strong>
              <p className="muted small">{t(suggestedModel.reason)}</p>
              <Button variant="soft" color="gray" size="1" onClick={() => set({ model: suggestedModel.value, modelTouched: true })}>
                {t('Usar a sugestão')}
              </Button>
            </div>
          )}
          <FormField label={t('Modelo e esforço')} hint={t('O modelo indicado no card tem preferência.')}>
            {() => (
              <ModelEditor value={a.model || null} onChange={(v) => set({ model: typeof v === 'string' ? v : '', modelTouched: true })} />
            )}
          </FormField>
        </WizardQuestion>
      )}

      {step === 5 && (
        <WizardQuestion
          question={t('Como ele trabalha? O rascunho sai das respostas; acrescente o que o projeto exige e ajuste o texto.')}
          example={t('Siga o padrão de testes de test/. Nunca rode comandos que mudem o repositório.')}
        >
          <FormField label={t('Padrões e comandos do projeto')} hint={t('Um por linha. Opcional.')}>
            {(id) => <TextArea id={id} rows={2} value={a.standards} onChange={(e) => set({ standards: e.target.value })} />}
          </FormField>
          <FormField label={t('O que ele nunca faz')} hint={t('Um por linha. Opcional.')}>
            {(id) => <TextArea id={id} rows={2} value={a.never} onChange={(e) => set({ never: e.target.value })} />}
          </FormField>
          <FormField label={t('Instruções')}>
            {(id) => (
              <>
                <TextArea
                  id={id}
                  className="code-area"
                  rows={10}
                  spellCheck={false}
                  value={body}
                  onChange={(e) => set({ body: e.target.value })}
                />
                {a.body !== null && (
                  <Button variant="ghost" size="1" onClick={() => set({ body: null })}>
                    {t('Refazer o rascunho com as respostas')}
                  </Button>
                )}
              </>
            )}
          </FormField>
        </WizardQuestion>
      )}

      {step === 6 && (
        <WizardQuestion question={t('Confira o agente inteiro. Nada é gravado antes de Criar agente.')}>
          <FormField label={t('Nome')} hint={name && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
            {(id) => (
              <TextField.Root
                id={id}
                color={name && !nameOk ? 'red' : undefined}
                value={name}
                onChange={(e) => set({ name: toItemName(e.target.value) })}
              />
            )}
          </FormField>
          <FormField label={t('Descrição (quando usar)')}>
            {(id) => <TextField.Root id={id} value={description} onChange={(e) => set({ description: e.target.value })} />}
          </FormField>
          <dl className="wizard-summary">
            <dt>{t('Onde')}</dt>
            <dd>
              <code>
                {scope === 'project' ? tool.agents.dir : `~/${tool.agents.dir}`}/{name}
                {tool.agents.ext}
              </code>
            </dd>
            {format.tools && (
              <>
                <dt>{t('Ferramentas')}</dt>
                <dd>{a.tools.length ? a.tools.join(', ') : t('as do nível de permissão')}</dd>
                <dt>{t('Servidores MCP')}</dt>
                <dd>{['faz-ai', ...a.mcp].join(', ')}</dd>
                <dt>{t('Skills')}</dt>
                <dd>{a.skills.length ? a.skills.join(', ') : t('nenhuma')}</dd>
              </>
            )}
            {format.readonly && (
              <>
                <dt>{t('Como roda')}</dt>
                <dd>
                  {[a.readonly ? t('somente leitura') : t('pode editar'), a.background ? t('em segundo plano') : null]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            )}
            <dt>{t('Modelo')}</dt>
            <dd>{a.model ? modelDisplay(catalog, a.model, false, t) : t('o da sessão')}</dd>
          </dl>
          <pre className="wizard-preview">{body}</pre>
        </WizardQuestion>
      )}
    </WizardShell>
  );
}
