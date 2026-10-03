import { DEFAULT_APPEARANCE, FONTS, FONT_SIZE_RANGE, THEMES, fontStack, type Appearance } from '../../../shared/appearance';
import { CARD_STATUSES, OWNER_LABEL } from '../../../shared/status';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { StatusBadge } from '../StatusBar';
import { renderMarkdown } from '../MarkdownEditor';
import { Button, EnumSelect, FieldRow } from '../ui';

const SAMPLE = '## Exemplo de descrição\n\nTexto de um card com **negrito**, _itálico_ e `código`.\n\n- Primeiro item\n- Segundo item';

export function AppearanceSettings() {
  const appearance = useBoardStore((s) => s.state)!.board.appearance;
  const set = (patch: Partial<Appearance>) => settings.updateBoard({ appearance: patch });
  const changed = JSON.stringify(appearance) !== JSON.stringify(DEFAULT_APPEARANCE);

  return (
    <div>
      <div className="row">
        <h2>Aparência</h2>
        <span className="spacer" />
        <Button variant="ghost" size="small" disabled={!changed} onClick={() => set(DEFAULT_APPEARANCE)}>
          Restaurar padrões
        </Button>
      </div>
      <p className="muted">
        Tema do board e tipografia dos textos longos: a descrição dos cards e a conversa, tanto ao escrever quanto ao ler.
      </p>

      <section className="settings-block">
        <FieldRow label="Tema">
          <EnumSelect options={THEMES} value={appearance.theme} onChange={(theme) => set({ theme })} />
        </FieldRow>
        <FieldRow label="Fonte dos textos">
          <EnumSelect options={FONTS} value={appearance.font} onChange={(font) => set({ font })} />
        </FieldRow>
        <FieldRow label="Tamanho da fonte">
          <div className="row">
            <input
              type="range"
              min={FONT_SIZE_RANGE.min}
              max={FONT_SIZE_RANGE.max}
              step={1}
              value={appearance.fontSize}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <span>{appearance.fontSize}px</span>
          </div>
        </FieldRow>
      </section>

      <h3 className="section-head">Prévia</h3>
      <div
        className="markdown"
        style={{ fontFamily: fontStack(appearance.font), fontSize: appearance.fontSize }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(SAMPLE) }}
      />

      <h3 className="section-head">Status dos cards</h3>
      <p className="muted">Os status são fixos, porque as regras do board dependem deles; o nome e a cor de cada um podem ser ajustados.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Nome</th>
            <th>Cor</th>
            <th>Com quem fica</th>
          </tr>
        </thead>
        <tbody>
          {CARD_STATUSES.map((s) => {
            const style = appearance.statuses[s.id];
            const patch = (v: Partial<typeof style>) => set({ statuses: { ...appearance.statuses, [s.id]: { ...style, ...v } } });
            return (
              <tr key={s.id}>
                <td>
                  <StatusBadge status={s.id} />
                </td>
                <td>
                  <input
                    key={style.label}
                    defaultValue={style.label}
                    onBlur={(e) =>
                      e.target.value.trim() && e.target.value.trim() !== style.label && patch({ label: e.target.value.trim() })
                    }
                  />
                </td>
                <td>
                  <input type="color" value={style.color} onChange={(e) => patch({ color: e.target.value })} />
                </td>
                <td className="muted">
                  {OWNER_LABEL[s.owner]} — {s.hint.toLowerCase()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
