import { useMemo, useState } from 'react';
import { suggestSkills, skillCatalog, type CatalogSkill } from '../../../shared/skillCatalog';
import { useBoardStore } from '../../store/boardStore';
import { Badge, Button, Checkbox, Dialog, SegmentedControl, TextField } from '@radix-ui/themes';
import { t } from '../../i18n';

type Tab = 'all' | 'picked' | 'project' | 'user' | 'plugin' | 'suggested';

/** Quantas linhas a lista mostra de uma vez: com plugins são centenas, e a busca resolve o resto. */
const PAGE = 120;
/** Quantas skills marcadas aparecem por nome no resumo; as outras viram "+N". */
const SUMMARY = 5;

const SCOPE_LABEL: Record<CatalogSkill['scope'], string> = { project: 'projeto', user: 'global', plugin: 'plugin' };

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** o que o agente ou o card faz: habilita a aba "Sugeridas" */
  intent?: string;
  /** título da janela de escolha */
  title?: string;
}

/**
 * Escolha de skills para muitas opções: um resumo do que está marcado e uma janela com busca, abas
 * por origem e caixas de seleção. Substitui a parede de chips, que não escala com centenas de skills.
 */
export function SkillPicker({ value, onChange, intent = '', title }: Props) {
  const state = useBoardStore((s) => s.state)!;
  const catalog = useMemo(() => skillCatalog(state), [state]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const picked = new Set(value);
  // uma skill marcada que saiu do disco continua visível, para poder ser desmarcada
  const all: CatalogSkill[] = [
    ...catalog,
    ...value
      .filter((v) => !catalog.some((c) => c.name === v))
      .map((name) => ({ name, description: t('Não encontrada no disco.'), scope: 'user' as const })),
  ];
  const suggested = useMemo(() => suggestSkills(intent, catalog), [intent, catalog]);
  const q = query.trim().toLowerCase();
  const inTab = (k: CatalogSkill) =>
    tab === 'all'
      ? true
      : tab === 'picked'
        ? picked.has(k.name)
        : tab === 'suggested'
          ? suggested.some((x) => x.name === k.name)
          : k.scope === tab;
  const rows = all.filter((k) => inTab(k) && (!q || k.name.toLowerCase().includes(q) || k.description.toLowerCase().includes(q)));
  const count = (tb: Tab) => (tb === 'all' ? all.length : tb === 'picked' ? value.length : all.filter((k) => k.scope === tb).length);
  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((v) => v !== name));
  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'picked', label: 'Marcadas' },
    { id: 'project', label: 'Projeto' },
    { id: 'user', label: 'Globais' },
    { id: 'plugin', label: 'Plugins' },
    ...(suggested.length > 0 ? [{ id: 'suggested' as Tab, label: 'Sugeridas' }] : []),
  ];
  const show = (tb: Tab) => {
    setTab(tb);
    setQuery('');
    setOpen(true);
  };

  return (
    <div className="skill-picker">
      <div className="skill-summary">
        {value.length === 0 && <span className="muted small">{t('Nenhuma skill.')}</span>}
        {value.slice(0, SUMMARY).map((v) => (
          <Badge key={v} color="indigo" variant="soft">
            {v}
          </Badge>
        ))}
        {value.length > SUMMARY && (
          <Button variant="ghost" size="1" onClick={() => show('picked')}>
            +{value.length - SUMMARY}
          </Button>
        )}
      </div>
      <div className="skill-actions">
        <Button variant="soft" color="gray" size="1" onClick={() => show('all')}>
          {t('Escolher skills ({n})', { n: all.length })}
        </Button>
        {suggested.length > 0 && (
          <Button
            variant="ghost"
            size="1"
            title={t('Skills cujo nome ou descrição combinam com a intenção descrita')}
            onClick={() => show('suggested')}
          >
            {t('Sugerir pela intenção ({n})', { n: suggested.length })}
          </Button>
        )}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content className="skill-dialog">
          <Dialog.Title>{title ?? t('Escolher skills')}</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            {t('A IA lê o arquivo de cada skill marcada ao executar. Busque pelo nome ou pela descrição.')}
          </Dialog.Description>
          <TextField.Root
            autoFocus
            type="search"
            aria-label={t('Buscar skill')}
            placeholder={t('Buscar por nome ou descrição…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <SegmentedControl.Root size="1" value={tab} onValueChange={(v) => setTab(v as Tab)} aria-label={t('Origem das skills')}>
            {tabs.map((tb) => (
              <SegmentedControl.Item key={tb.id} value={tb.id}>
                {t(tb.label)} {tb.id === 'suggested' ? suggested.length : count(tb.id)}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
          {tab === 'suggested' && rows.length > 1 && (
            <Button variant="soft" size="1" onClick={() => onChange([...new Set([...value, ...rows.map((k) => k.name)])])}>
              {t('Marcar as {n} sugeridas', { n: rows.length })}
            </Button>
          )}
          <ul className="skill-options" aria-label={t('Skills')}>
            {rows.slice(0, PAGE).map((k) => (
              <li key={k.name}>
                <label className="skill-option">
                  <Checkbox aria-label={k.name} checked={picked.has(k.name)} onCheckedChange={(v) => toggle(k.name, v === true)} />
                  <span className="skill-option-text">
                    <span className="item-title">
                      <span className="item-name">{k.name}</span>
                      <Badge color={k.scope === 'project' ? 'indigo' : 'gray'} variant={k.scope === 'project' ? 'solid' : 'outline'}>
                        {k.plugin ?? t(SCOPE_LABEL[k.scope])}
                      </Badge>
                    </span>
                    {k.description && <span className="item-hint">{k.description}</span>}
                  </span>
                </label>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="muted small">
                {q ? t('Nenhuma skill com "{query}".', { query: query.trim() }) : t('Nenhuma skill nesta aba.')}
              </li>
            )}
          </ul>
          {rows.length > PAGE && (
            <p className="muted small">
              {t('Mostrando {shown} de {total}: refine a busca para ver as outras.', { shown: PAGE, total: rows.length })}
            </p>
          )}
          <div className="skill-footer">
            <span className="muted small">{t('{n} marcadas', { n: value.length })}</span>
            {value.length > 0 && (
              <Button variant="ghost" size="1" onClick={() => onChange([])}>
                {t('Limpar')}
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>{t('Concluir')}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
