import { DEFAULT_APPEARANCE, FONTS, FONT_SIZE_RANGE, THEMES, fontStack, type Appearance } from '../../../shared/appearance';
import { CARD_STATUSES, OWNER_LABEL } from '../../../shared/status';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { ContrastHint } from './ColorPreview';
import { StatusBadge } from '../StatusBar';
import { renderMarkdown } from '../MarkdownEditor';
import { Button, Card, Slider, TextField } from '@radix-ui/themes';
import { FormField, SelectField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { PageHeader } from './PageHeader';

const SAMPLE = '## Exemplo de descrição\n\nTexto de um card com **negrito**, _itálico_ e `código`.\n\n- Primeiro item\n- Segundo item';

export function AppearanceSettings() {
  const appearance = useBoardStore((s) => s.state)!.board.appearance;
  const set = (patch: Partial<Appearance>) => settings.updateBoard({ appearance: patch });
  const changed = JSON.stringify(appearance) !== JSON.stringify(DEFAULT_APPEARANCE);

  return (
    <div>
      <PageHeader
        title="Aparência"
        actions={
          <Button variant="soft" color="gray" disabled={!changed} onClick={() => set(DEFAULT_APPEARANCE)}>
            Restaurar padrões
          </Button>
        }
      >
        Tema do board e tipografia dos textos longos: a descrição dos cards e a conversa, tanto ao escrever quanto ao ler.
      </PageHeader>

      <Card className="form-card" aria-label="Tema e fonte">
        <div className="form-grid">
          <FormField label="Tema">
            {(id) => (
              <SelectField id={id} aria-label="Tema" options={THEMES} value={appearance.theme} onChange={(theme) => set({ theme })} />
            )}
          </FormField>
          <FormField label="Fonte dos textos">
            {(id) => (
              <SelectField
                id={id}
                aria-label="Fonte dos textos"
                options={FONTS}
                value={appearance.font}
                onChange={(font) => set({ font })}
              />
            )}
          </FormField>
        </div>
        <FormField label={`Tamanho da fonte: ${appearance.fontSize}px`}>
          {(id) => (
            <Slider
              id={id}
              aria-label="Tamanho da fonte"
              className="font-size-slider"
              min={FONT_SIZE_RANGE.min}
              max={FONT_SIZE_RANGE.max}
              step={1}
              value={[appearance.fontSize]}
              onValueChange={([fontSize]) => set({ fontSize })}
            />
          )}
        </FormField>
      </Card>

      <SectionHeader title="Prévia" />
      <div
        className="markdown"
        style={{ fontFamily: fontStack(appearance.font), fontSize: appearance.fontSize }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(SAMPLE) }}
      />

      <SectionHeader title="Status dos cards">
        Os status são fixos, porque as regras do board dependem deles; o nome e a cor de cada um podem ser ajustados.
      </SectionHeader>
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
                  <TextField.Root
                    aria-label={`Nome do status ${s.id}`}
                    key={style.label}
                    defaultValue={style.label}
                    onBlur={(e) =>
                      e.target.value.trim() && e.target.value.trim() !== style.label && patch({ label: e.target.value.trim() })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    aria-label={`Cor do status ${s.id}`}
                    value={style.color}
                    onChange={(e) => patch({ color: e.target.value })}
                  />
                  <ContrastHint color={style.color} onPick={(color) => patch({ color })} />
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
