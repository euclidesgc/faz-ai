import { useState, type KeyboardEvent } from 'react';
import { AI_TOOLS, type AiTool } from '../../../shared/harness';
import { modelId, type ModelOption } from '../../../shared/models';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { Button, Card, IconButton, TextField } from '@radix-ui/themes';
import { FormField, IconPlus, IconTrash, SelectField } from '../ui';
import { ModelRulesEditor } from './ModelRulesEditor';
import { SettingsCard } from './SettingsCard';
import { PageHeader } from './PageHeader';

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** De onde vem a lista de modelos de cada ferramenta ao clicar em "Detectar". */
const SOURCES: Record<AiTool, string> = {
  claude: 'lista embutida na extensão (o Claude Code não guarda a lista em arquivo)',
  codex: 'lista embutida na extensão (o Codex não guarda a lista em arquivo)',
  cursor: 'lista embutida na extensão (o Cursor não guarda a lista em arquivo)',
  kimi: 'lida do config.toml do Kimi nesta máquina, com os esforços de cada modelo',
  copilot: 'lista embutida na extensão (o GitHub Copilot não guarda a lista em arquivo)',
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
  const { modelCatalog: catalog, aiTool } = state.board;
  const [adding, setAdding] = useState(false);

  const setCatalog = (next: ModelOption[]) => settings.setModels(next);
  const patchModel = (id: string, patch: Partial<ModelOption>) => setCatalog(catalog.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  // o projeto trabalha com uma ferramenta por vez: só os modelos dela aparecem
  const tools = AI_TOOLS.filter((tl) => tl.id === aiTool);

  return (
    <div>
      <PageHeader
        title={t('Modelos de IA')}
        actions={
          <>
            {tools.map((tl) => (
              <Button
                key={tl.id}
                variant="soft"
                color="gray"
                title={t('Fonte: {source}', { source: t(SOURCES[tl.id]) })}
                onClick={() => settings.detectModels(tl.id)}
              >
                {t('Detectar modelos')}
              </Button>
            ))}
            <Button disabled={adding} onClick={() => setAdding(true)}>
              <IconPlus /> {t('Novo modelo')}
            </Button>
          </>
        }
      >
        {t(
          'Modelos da ferramenta em uso no projeto, com os níveis de esforço de cada um. É daqui que saem as opções do campo "Modelo" dos cards. A ferramenta é escolhida em Harness de IA.',
        )}
      </PageHeader>

      {tools.map((tl) => {
        const mine = catalog.filter((o) => o.tool === tl.id);
        return (
          <SettingsCard
            key={tl.id}
            title={tl.label}
            badge={{ text: t('{count} modelo(s)', { count: mine.length }), on: false }}
            hint={t('Ao detectar: {source}. Modelos que você acrescentou à mão são mantidos.', { source: t(SOURCES[tl.id]) })}
          >
            {adding && (
              <NewModelCard
                tool={tl.id}
                taken={(id) => catalog.some((o) => o.id === id)}
                onAdd={(m) => setCatalog([...catalog, m])}
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
                        onClick={() => setCatalog(catalog.filter((x) => x.id !== o.id))}
                      >
                        <IconTrash />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {mine.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('Nenhum modelo. Use "Detectar modelos" ou "Novo modelo".')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SettingsCard>
        );
      })}

      <ModelRulesEditor />
    </div>
  );
}
