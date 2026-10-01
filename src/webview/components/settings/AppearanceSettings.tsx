import { DEFAULT_APPEARANCE, FONTS, FONT_SIZE_RANGE, THEMES, fontStack, type Appearance, type TextFont, type ThemeMode } from '../../../shared/appearance';
import { useBoardStore } from '../../store/boardStore';
import { renderMarkdown } from '../MarkdownEditor';

const SAMPLE = '## Exemplo de descrição\n\nTexto de um card com **negrito**, _itálico_ e `código`.\n\n- Primeiro item\n- Segundo item';

export function AppearanceSettings() {
  const appearance = useBoardStore((s) => s.state)!.board.appearance;
  const send = useBoardStore((s) => s.send);
  const set = (patch: Partial<Appearance>) => send({ type: 'settings.board.update', patch: { appearance: patch } });
  const changed = (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).some((k) => appearance[k] !== DEFAULT_APPEARANCE[k]);

  return (
    <div>
      <div className="row">
        <h2>Aparência</h2>
        <span className="spacer" />
        <button className="ghost small" disabled={!changed} onClick={() => set(DEFAULT_APPEARANCE)}>Restaurar padrões</button>
      </div>
      <p className="muted">Tema do board e tipografia dos textos longos: a descrição dos cards e os comentários, tanto ao escrever quanto ao ler.</p>

      <section className="settings-block">
        <label className="field-row">
          <span>Tema</span>
          <select value={appearance.theme} onChange={(e) => set({ theme: e.target.value as ThemeMode })}>
            {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>Fonte dos textos</span>
          <select value={appearance.font} onChange={(e) => set({ font: e.target.value as TextFont })}>
            {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>Tamanho da fonte</span>
          <div className="row">
            <input type="range" min={FONT_SIZE_RANGE.min} max={FONT_SIZE_RANGE.max} step={1} value={appearance.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
            <span>{appearance.fontSize}px</span>
          </div>
        </label>
      </section>

      <h3 className="section-head">Prévia</h3>
      <div className="markdown" style={{ fontFamily: fontStack(appearance.font), fontSize: appearance.fontSize }} dangerouslySetInnerHTML={{ __html: renderMarkdown(SAMPLE) }} />
    </div>
  );
}
