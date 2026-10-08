import { useState, type KeyboardEvent } from 'react';
import { AI_TOOLS, type AiTool } from '../../../shared/harness';
import { modelId, withPrice, type ModelOption, type ModelPrice } from '../../../shared/models';
import { PRICE_URLS, restoreBuiltinPrice } from '../../../shared/prices';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { Button, Card, IconButton, Text, TextField } from '@radix-ui/themes';
import { FormField, IconPlus, IconTrash, SelectField, SwitchField } from '../ui';
import { ModelPriceCell } from './ModelPriceCell';
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
const SOURCES: Record<AiTool, string> = {
  claude: 'lista embutida na extensão (o Claude Code não guarda a lista em arquivo)',
  codex: 'lista embutida na extensão (o Codex não guarda a lista em arquivo)',
  cursor: 'lida do comando cursor-agent models, com a conta em uso; sem a CLI autenticada, lista embutida na extensão',
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

  // as mudanças partem da última lista enviada (ver useSentList)
  const sent = useSentList(catalog, settings.setModels);
  const setCatalog = sent.save;
  const setPrice = (o: ModelOption, key: keyof ModelPrice, value: number | null) =>
    setCatalog(sent.current().map((x) => (x.id === o.id ? withPrice(x, { [key]: value }) : x)));
  const patchModel = (id: string, patch: Partial<ModelOption>) =>
    setCatalog(sent.current().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const restorePrice = (o: ModelOption) => setCatalog(sent.current().map((x) => (x.id === o.id ? restoreBuiltinPrice(x) : x)));
  // para o aviso de preço conferido há tempo demais
  const today = new Date();

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
              </div>
            )}
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
                  <th>{t('Preço (US$ por milhão de tokens)')}</th>
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
                    <td>
                      <ModelPriceCell
                        model={o}
                        tool={tl.id}
                        today={today}
                        onPrice={(key, value) => setPrice(o, key, value)}
                        onVariable={(variablePrice) => patchModel(o.id, { variablePrice })}
                        onRestore={() => restorePrice(o)}
                      />
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
                    <td colSpan={6} className="muted">
                      {t('Nenhum modelo. Use "Detectar modelos" ou "Novo modelo".')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Text as="p" size="1" color="gray" className="price-hint">
              {t(
                'O custo informado pela ferramenta tem preferência; o preço aqui é usado para estimar o custo das ferramentas que não informam.',
              )}
              {tl.id === 'cursor' && (
                <>
                  {' '}
                  {t(
                    'No Cursor, a estimativa usa a tarifa cadastrada: o modo rápido é um modelo à parte, com preço próprio, e o contexto longo (mais de 256 mil tokens, que pode custar 2x) não é separado, porque o Cursor só informa o total de tokens.',
                  )}
                </>
              )}{' '}
              <a href={PRICE_URLS[tl.id]} target="_blank" rel="noreferrer">
                {t('Preços de {tool}', { tool: tl.label })}
              </a>
            </Text>
          </SettingsCard>
        );
      })}

      <ModelRulesEditor />
    </div>
  );
}
