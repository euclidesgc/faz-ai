import { activeProfile, catalogTool, isAcpProfile, type AiBase } from '../../../shared/aiProfiles';
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { AiTool } from '../../../shared/harness';
import { modelId, type ModelOption } from '../../../shared/models';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { useAction } from '../../useAction';
import { t } from '../../i18n';
import { Button, Card, IconButton, Text, TextField } from '@radix-ui/themes';
import { ActionButton, FormField, IconPlus, IconTrash, SelectField, SwitchField } from '../ui';
import { DependsOn } from './DependsOn';
import { ModelRulesEditor } from './ModelRulesEditor';
import { SettingsCard } from './SettingsCard';
import { useSentList } from './useSentList';
import { PageHeader } from './PageHeader';

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** De onde vem a lista de modelos de cada ferramenta ao clicar em "Detectar". */
const SOURCES: Record<AiBase, string> = {
  claude: 'lista embutida na extensão (o Claude Code não guarda a lista em arquivo)',
  cursor: 'lida do comando cursor-agent models, com a conta em uso; sem a CLI autenticada, lista embutida na extensão',
  kimi: 'lida do comando kimi provider list --json, com os provedores configurados; sem a CLI, lista embutida na extensão',
};

const EMPTY_DRAFT = { model: '', label: '', efforts: '' };

/** Rascunho do modelo novo: nome, identificador na ferramenta e os esforços aceitos. */
function NewModelCard({
  tool,
  taken,
  onAdd,
  onDone,
}: {
  tool: AiTool;
  taken: (id: string) => boolean;
  onAdd: (m: ModelOption) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const model = draft.model.trim();
  const ready = model !== '' && !taken(modelId(tool, model));
  const add = () => {
    if (!ready) return;
    const efforts = splitList(draft.efforts);
    onAdd({ id: modelId(tool, model), tool, model, label: draft.label.trim() || model, efforts, defaultEffort: efforts[0] ?? null });
    onDone();
  };
  const set = (patch: Partial<typeof EMPTY_DRAFT>) => setDraft({ ...draft, ...patch });
  const enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') onDone();
  };
  return (
    <Card className="draft-card" aria-label={t('Modelo novo')}>
      <div className="form-grid">
        <FormField label={t('Nome')}>
          {(id) => (
            <TextField.Root
              id={id}
              autoFocus
              value={draft.label}
              placeholder={t('Ex.: Sonnet 5.5')}
              onChange={(e) => set({ label: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
        <FormField
          label={t('Identificador na ferramenta')}
          hint={draft.model.trim() && !ready ? t('Já existe um modelo com este identificador.') : undefined}
        >
          {(id) => (
            <TextField.Root
              id={id}
              value={draft.model}
              placeholder={t('identificador')}
              onChange={(e) => set({ model: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
        <FormField label={t('Esforços aceitos')} hint={t('Separados por vírgula; o primeiro é o padrão.')}>
          {(id) => (
            <TextField.Root
              id={id}
              value={draft.efforts}
              placeholder="low, medium, high"
              onChange={(e) => set({ efforts: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
      </div>
      <div className="form-actions">
        <Button variant="soft" color="gray" onClick={onDone}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!ready} onClick={add}>
          {t('Adicionar modelo')}
        </Button>
      </div>
    </Card>
  );
}

export function ModelsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const { modelCatalog: catalog, modelRules, rules, aiTool, aiProfiles } = state.board;
  const [profileId, setProfileId] = useState(aiTool);
  useEffect(() => setProfileId(aiTool), [aiTool]);
  const profile = aiProfiles.find((p) => p.id === profileId) ?? activeProfile(state.board);
  const toolId = catalogTool(profile);
  const [adding, setAdding] = useState(false);
  // detectar lê a CLI ou a conta: o botão da ferramenta clicada mostra a espera
  const detect = useAction((tool: AiTool) => settings.detectModels(tool));
  const [detecting, setDetecting] = useState<AiTool | null>(null);

  // as mudanças partem da última lista enviada (ver useSentList)
  const sent = useSentList(catalog, settings.setModels);
  const setCatalog = sent.save;
  const patchModel = (id: string, patch: Partial<ModelOption>) =>
    setCatalog(sent.current().map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // o projeto trabalha com uma ferramenta por vez: só os modelos dela aparecem
  // o agente ACP anuncia os modelos ao abrir a sessão: o "Detectar" vale para ele como para as CLIs prontas
  const acp = isAcpProfile(profile);
  const detectable = profile.kind === 'builtin' || acp;
  const tools = [{ id: toolId, label: profile.name, kind: profile.kind, base: profile.base }];
  const source = acp
    ? t('lida do agente ao abrir uma sessão ACP (session/new), sem gastar a sua conta; o agente precisa estar instalado e com login')
    : profile.kind === 'custom'
      ? t('cadastrada à mão')
      : t(SOURCES[profile.base as AiBase]);

  return (
    <div>
      <PageHeader
        title={t('Modelos de IA')}
        actions={
          <>
            {tools
              .filter(() => detectable)
              .map((tl) => (
                <ActionButton
                  key={tl.id}
                  variant="soft"
                  color="gray"
                  loading={detect.busy && detecting === tl.id}
                  hint={t('Fonte: {source}', { source })}
                  onClick={() => {
                    setDetecting(tl.id);
                    void detect.run(tl.id);
                  }}
                >
                  {t('Detectar modelos')}
                </ActionButton>
              ))}
            <ActionButton
              disabled={adding}
              disabledReason={t('O formulário já está aberto logo abaixo.')}
              hint={t('Abre o formulário de um modelo novo.')}
              onClick={() => setAdding(true)}
            >
              <IconPlus /> {t('Novo modelo')}
            </ActionButton>
          </>
        }
      >
        {t('Modelos do perfil selecionado, com os níveis de esforço de cada um. Escolher um catálogo não muda o perfil executor do board.')}
      </PageHeader>

      <FormField label={t('Perfil')}>
        {(id) => (
          <SelectField
            id={id}
            value={profile.id}
            onChange={setProfileId}
            options={aiProfiles.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
      </FormField>

      {tools.map((tl) => {
        const mine = catalog.filter((o) => o.tool === tl.id);
        return (
          <SettingsCard
            key={tl.id}
            title={tl.label}
            badge={{ text: t('{count} modelo(s)', { count: mine.length }), on: false }}
            hint={t('Ao detectar: {source}. Modelos que você acrescentou à mão são mantidos.', { source })}
          >
            {tl.id === 'cursor' && (
              <div className="models-fast">
                <SwitchField
                  label={t('Incluir os modos rápidos')}
                  checked={state.board.rules.includeFastModels}
                  onChange={(includeFastModels) => settings.updateRules({ includeFastModels })}
                />
                <Text as="p" size="1" color="gray">
                  {t(
                    'O Cursor tem uma versão rápida de muitos modelos: responde mais depressa e cobra mais pelos mesmos tokens. Ligado, cada uma entra no catálogo como um modelo à parte (por exemplo, "Claude Opus 5.5 1M Fast"); desligado, elas saem do catálogo. A lista vem do comando cursor-agent models, lido com a CLI autenticada.',
                  )}
                </Text>
                <DependsOn
                  label={t('ferramenta Cursor')}
                  satisfied={true}
                  target={{ kind: 'board', section: 'harness-tool' }}
                  targetHint={t('em Harness')}
                />
              </div>
            )}
            <Text as="p" size="1" color="gray">
              {t('Mostrando os modelos do {tool}', { tool: tl.label })}
              {' · '}
              <Button
                variant="ghost"
                size="1"
                aria-label={t('Trocar a ferramenta de IA, em Harness')}
                onClick={() => useBoardStore.getState().goToSection('harness-tool')}
              >
                {t('trocar ferramenta')}
              </Button>
            </Text>
            {adding && (
              <NewModelCard
                tool={tl.id}
                taken={(id) => catalog.some((o) => o.id === id)}
                onAdd={(m) => setCatalog([...sent.current(), m])}
                onDone={() => setAdding(false)}
              />
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Nome')}</th>
                  <th>{t('Identificador na ferramenta')}</th>
                  <th>{t('Esforços aceitos (separados por vírgula)')}</th>
                  <th>{t('Esforço padrão')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mine.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <TextField.Root
                        aria-label={t('Nome de {model}', { model: o.model })}
                        key={o.label}
                        defaultValue={o.label}
                        onBlur={(e) =>
                          e.target.value.trim() && e.target.value.trim() !== o.label && patchModel(o.id, { label: e.target.value.trim() })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </td>
                    <td>
                      <code>{o.model}</code>
                    </td>
                    <td>
                      <TextField.Root
                        aria-label={t('Esforços de {model}', { model: o.model })}
                        key={o.efforts.join()}
                        defaultValue={o.efforts.join(', ')}
                        placeholder={t('sem ajuste de esforço')}
                        onBlur={(e) => {
                          const efforts = splitList(e.target.value);
                          if (efforts.join() !== o.efforts.join())
                            patchModel(o.id, {
                              efforts,
                              defaultEffort: o.defaultEffort && efforts.includes(o.defaultEffort) ? o.defaultEffort : (efforts[0] ?? null),
                            });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </td>
                    <td className="narrow">
                      {o.efforts.length > 0 && (
                        <SelectField
                          aria-label={t('Esforço padrão de {model}', { model: o.model })}
                          options={o.efforts.map((e) => ({ value: e, label: e }))}
                          value={o.defaultEffort && o.efforts.includes(o.defaultEffort) ? o.defaultEffort : o.efforts[0]!}
                          onChange={(defaultEffort) => patchModel(o.id, { defaultEffort })}
                        />
                      )}
                    </td>
                    {/* sem confirmação de propósito: a lista pode ser refeita com "Detectar modelos" */}
                    <td className="narrow">
                      <IconButton
                        variant="ghost"
                        color="red"
                        title={t('Remover do catálogo')}
                        aria-label={t('Remover {model} do catálogo', { model: o.model })}
                        onClick={() => setCatalog(sent.current().filter((x) => x.id !== o.id))}
                      >
                        <IconTrash />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {mine.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {detectable
                        ? t('Nenhum modelo. Use "Detectar modelos" ou "Novo modelo".')
                        : t('Nenhum modelo. Use "Novo modelo" para cadastrar à mão.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SettingsCard>
        );
      })}

      <Card className="form-card" aria-label={t('Preencher o modelo sugerido')}>
        <SwitchField
          label={t('Preencher o modelo sugerido automaticamente')}
          checked={modelRules.length > 0 && rules.autoApplyModelSuggestion}
          disabled={modelRules.length === 0}
          onChange={(autoApplyModelSuggestion) => settings.updateRules({ autoApplyModelSuggestion })}
        />
        <Text as="p" size="1" color="gray">
          {t(
            'Ao criar ou mudar um card, preenche o campo "Modelo" com a sugestão das regras abaixo, se ele estiver vazio ou com a sugestão anterior. Um modelo escolhido à mão nunca é trocado.',
          )}
        </Text>
        <DependsOn
          label={t('uma regra de sugestão de modelo')}
          satisfied={modelRules.length > 0}
          target={{ kind: 'board', section: 'model-rules' }}
          targetHint={t('mais abaixo, nesta mesma aba')}
        />
      </Card>

      <ModelRulesEditor />
    </div>
  );
}
