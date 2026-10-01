import { useState } from 'react';
import { AI_TOOLS, type AiTool } from '../../../shared/harness';
import { modelId, type ModelOption } from '../../../shared/models';
import { useBoardStore } from '../../store/boardStore';
import { ModelRulesEditor } from './ModelRulesEditor';

const splitList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

/** De onde vem a lista de modelos de cada ferramenta ao clicar em "Detectar". */
const SOURCES: Record<AiTool, string> = {
  claude: 'lista embutida na extensão (o Claude Code não guarda a lista em arquivo)',
  codex: 'lista embutida na extensão (o Codex não guarda a lista em arquivo)',
  cursor: 'lista embutida na extensão (o Cursor não guarda a lista em arquivo)',
  kimi: 'lida do config.toml do Kimi nesta máquina, com os esforços de cada modelo',
};

export function ModelsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const { modelCatalog: catalog, aiTools } = state.board;
  const [draft, setDraft] = useState<Record<string, { model: string; label: string; efforts: string }>>({});

  const setCatalog = (next: ModelOption[]) => send({ type: 'settings.models.set', catalog: next });
  const patchModel = (id: string, patch: Partial<ModelOption>) => setCatalog(catalog.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const tools = AI_TOOLS.filter((t) => aiTools.includes(t.id) || catalog.some((o) => o.tool === t.id));

  const addModel = (tool: AiTool) => {
    const d = draft[tool];
    if (!d?.model.trim() || catalog.some((o) => o.id === modelId(tool, d.model.trim()))) return;
    const efforts = splitList(d.efforts);
    setCatalog([...catalog, { id: modelId(tool, d.model.trim()), tool, model: d.model.trim(), label: d.label.trim() || d.model.trim(), efforts, defaultEffort: efforts[0] ?? null }]);
    setDraft({ ...draft, [tool]: { model: '', label: '', efforts: '' } });
  };

  return (
    <div>
      <h2>Modelos de IA</h2>
      <p className="muted">
        Catálogo dos modelos que cada ferramenta oferece, com os níveis de esforço de cada um. É daqui que saem as opções do campo "Modelo" dos cards.
      </p>

      <div className="stack">
        {tools.map((t) => {
          const d = draft[t.id] ?? { model: '', label: '', efforts: '' };
          const mine = catalog.filter((o) => o.tool === t.id);
          return (
            <section key={t.id} className="settings-block">
              <div className="row">
                <h3 className="plain">{t.label}</h3>
                <span className="muted small">{mine.length} modelo(s)</span>
                <span className="spacer" />
                <button title={`Fonte: ${SOURCES[t.id]}`} onClick={() => send({ type: 'settings.models.detect', tool: t.id })}>Detectar modelos</button>
              </div>
              <div className="muted small">Ao detectar: {SOURCES[t.id]}. Modelos que você acrescentou à mão são mantidos.</div>
              <table className="table">
                <thead><tr><th>Nome</th><th>Identificador na ferramenta</th><th>Esforços aceitos (separados por vírgula)</th><th>Esforço padrão</th><th></th></tr></thead>
                <tbody>
                  {mine.map((o) => (
                    <tr key={o.id}>
                      <td><input defaultValue={o.label} onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && patchModel(o.id, { label: e.target.value.trim() })} /></td>
                      <td><code>{o.model}</code></td>
                      <td>
                        <input
                          key={o.efforts.join()}
                          defaultValue={o.efforts.join(', ')}
                          placeholder="sem ajuste de esforço"
                          onBlur={(e) => {
                            const efforts = splitList(e.target.value);
                            if (efforts.join() !== o.efforts.join()) patchModel(o.id, { efforts, defaultEffort: o.defaultEffort && efforts.includes(o.defaultEffort) ? o.defaultEffort : efforts[0] ?? null });
                          }}
                        />
                      </td>
                      <td className="narrow">
                        {o.efforts.length > 0 && (
                          <select value={o.defaultEffort ?? ''} onChange={(e) => patchModel(o.id, { defaultEffort: e.target.value || null })}>
                            {o.efforts.map((e) => <option key={e} value={e}>{e}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="narrow"><button className="icon danger" title="Remover do catálogo" onClick={() => setCatalog(catalog.filter((x) => x.id !== o.id))}>🗑</button></td>
                    </tr>
                  ))}
                  <tr>
                    <td><input placeholder="Nome" value={d.label} onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, label: e.target.value } })} /></td>
                    <td><input placeholder="identificador" value={d.model} onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, model: e.target.value } })} /></td>
                    <td><input placeholder="low, medium, high" value={d.efforts} onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, efforts: e.target.value } })} /></td>
                    <td></td>
                    <td className="narrow"><button className="primary" disabled={!d.model.trim()} onClick={() => addModel(t.id)}>Adicionar</button></td>
                  </tr>
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      <ModelRulesEditor />
    </div>
  );
}
