import { DEFAULT_APPEARANCE, FONTS, FONT_SIZE_RANGE, THEMES, fontStack, type Appearance } from '../../../shared/appearance';
import type { Language } from '../../../shared/language';
import { useBoardStore } from '../../store/boardStore';
import { settings, ui } from '../../commands';
import { isWeb } from '../../vscode';
import { t } from '../../i18n';
import { renderMarkdown } from '../MarkdownEditor';
import { Button, Card, Slider } from '@radix-ui/themes';
import { FormField, SelectField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { PageHeader } from './PageHeader';

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'auto', label: 'Automático (idioma do editor ou do navegador) / Automatic' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English' },
];

const SAMPLE = '## Exemplo de descrição\n\nTexto de um card com **negrito**, _itálico_ e `código`.\n\n- Primeiro item\n- Segundo item';

export function AppearanceSettings() {
  const appearance = useBoardStore((s) => s.state)!.board.appearance;
  const set = (patch: Partial<Appearance>) => settings.updateBoard({ appearance: patch });
  const changed = JSON.stringify(appearance) !== JSON.stringify(DEFAULT_APPEARANCE);

  return (
    <div>
      <PageHeader
        title={t('Aparência')}
        actions={
          <Button variant="soft" color="gray" disabled={!changed} onClick={() => set(DEFAULT_APPEARANCE)}>
            {t('Restaurar aparência padrão')}
          </Button>
        }
      >
        {t('Tema do board e tipografia dos textos longos: a descrição dos cards e a conversa, tanto ao escrever quanto ao ler.')}
      </PageHeader>

      {!isWeb && (
        <Card className="form-card">
          <p>{t('A aparência do board (idioma, tema, fonte e tamanho) agora fica no Settings do editor.')}</p>
          <Button variant="soft" onClick={() => ui.openIdeSettings('fazai.appearance.theme')}>
            {t('Abrir no Settings do editor')}
          </Button>
        </Card>
      )}

      {isWeb && (
        <Card className="form-card" aria-label={t('Tema e fonte')}>
          <div className="form-grid">
            <FormField label={t('Idioma')} hint={t('O idioma da interface do board.')}>
              {(id) => (
                <SelectField
                  id={id}
                  aria-label={t('Idioma')}
                  options={LANGUAGE_OPTIONS}
                  value={appearance.language}
                  onChange={(language) => set({ language })}
                />
              )}
            </FormField>
            <FormField label={t('Tema')}>
              {(id) => (
                <SelectField
                  id={id}
                  aria-label={t('Tema')}
                  options={THEMES.map((o) => ({ ...o, label: t(o.label) }))}
                  value={appearance.theme}
                  onChange={(theme) => set({ theme })}
                />
              )}
            </FormField>
            <FormField label={t('Fonte dos textos')}>
              {(id) => (
                <SelectField
                  id={id}
                  aria-label={t('Fonte dos textos')}
                  options={FONTS.map((o) => ({ value: o.value, label: t(o.label) }))}
                  value={appearance.font}
                  onChange={(font) => set({ font })}
                />
              )}
            </FormField>
          </div>
          <FormField label={t('Tamanho da fonte: {size}px', { size: appearance.fontSize })}>
            {(id) => (
              <Slider
                id={id}
                aria-label={t('Tamanho da fonte')}
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
      )}

      <SectionHeader title={t('Prévia')} />
      <div
        className="markdown"
        style={{ fontFamily: fontStack(appearance.font), fontSize: appearance.fontSize }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(t(SAMPLE)) }}
      />
    </div>
  );
}
