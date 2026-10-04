import { useState } from 'react';
import { childProgress, linkedCards, linkProblem } from '../../../shared/links';
import { cardRef, type Card, type LinkKind } from '../../../shared/model';
import { childrenOf, columnOf, isLive } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { links } from '../../commands';
import { Button as RxButton, IconButton, TextField } from '@radix-ui/themes';
import { IconTrash, SelectField } from '../ui';
import { t, dt } from '../../i18n';

type Relation = 'parent' | 'child' | 'related';
const RELATIONS: { value: Relation; label: string }[] = [
  { value: 'parent', label: 'é o pai deste card' },
  { value: 'child', label: 'é filho deste card' },
  { value: 'related', label: 'é relativo' },
];
/** Quantos cards a busca mostra por vez. */
const RESULTS = 6;

/** Vínculos do card com outros, de qualquer workflow: pai, filhos (com o progresso) e relativos. */
export function LinksSection({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const [relation, setRelation] = useState<Relation>('child');
  const [query, setQuery] = useState('');
  const linked = linkedCards(state, card.id);
  const progress = childProgress(state, card.id);
  const structuralParent = card.parentId ? state.cards.find((c) => c.id === card.parentId) : undefined;
  const subtasks = childrenOf(state, card.id);
  const total = linked.parents.length + linked.children.length + linked.related.length + (structuralParent ? 1 : 0) + subtasks.length;
  const kind = (r: Relation): LinkKind => (r === 'related' ? 'related' : 'child');
  const ends = (other: Card, r: Relation): [string, string] => (r === 'parent' ? [other.id, card.id] : [card.id, other.id]);

  const q = query.trim().toLowerCase().replace(/^#/, '');
  const found = q
    ? state.cards
        .filter((c) => isLive(c) && c.id !== card.id)
        .filter((c) => String(c.number) === q || c.title.toLowerCase().includes(q))
        .filter((c) => linkProblem(state, ...ends(c, relation), kind(relation)) === null)
        .slice(0, RESULTS)
    : [];

  const remove = (id: string) =>
    links.remove(state.links.find((l) => (l.fromId === card.id && l.toId === id) || (l.toId === card.id && l.fromId === id))!.id);
  const row = (c: Card) => (
    <li key={c.id} className={columnOf(state, c)?.category !== 'open' ? 'done' : ''}>
      <a onClick={() => openCard(c.id)}>
        <span className="card-id">{cardRef(c)}</span> {c.title}
      </a>
      <span className="muted">{dt(columnOf(state, c)?.name ?? '')}</span>
      <IconButton
        variant="ghost"
        color="red"
        size="1"
        title={t('Remover o vínculo')}
        aria-label={t('Remover o vínculo com {card}', { card: cardRef(c) })}
        onClick={() => remove(c.id)}
      >
        <IconTrash />
      </IconButton>
    </li>
  );
  const group = (title: string, list: Card[], note?: string) =>
    list.length > 0 && (
      <div className="link-group" role="group" aria-label={title}>
        <h4>
          {title} {note && <small className="muted">{note}</small>}
        </h4>
        <ul className="children">{list.map(row)}</ul>
      </div>
    );

  return (
    <section className="drawer-section" aria-label={t('Vínculos')}>
      <div className="section-head">
        <h3>
          {t('Vínculos')} <small>{total}</small>
        </h3>
      </div>
      {total === 0 && <p className="muted small">{t('Este card não está vinculado a nenhum outro.')}</p>}
      {structuralParent && (
        <div className="link-group" role="group" aria-label={t('Pai')}>
          <h4>
            {t('Pai')} <small className="muted">{t('estrutura')}</small>
          </h4>
          <ul className="children">
            <li>
              <a onClick={() => openCard(structuralParent.id)}>
                <span className="card-id">{cardRef(structuralParent)}</span> {structuralParent.title}
              </a>
              <span className="muted">{dt(columnOf(state, structuralParent)?.name ?? '')}</span>
            </li>
          </ul>
        </div>
      )}
      {group(t('Pai'), linked.parents)}
      {group(t('Filhos'), linked.children, t('{done}/{total} encerrados', { done: progress.done, total: progress.total }))}
      {group(t('Relativos'), linked.related)}
      {subtasks.length > 0 && (
        <div className="link-group" role="group" aria-label={t('Filhos')}>
          <h4>
            {t('Filhos')} <small className="muted">{t('sub-tarefas')}</small>
          </h4>
          <button
            type="button"
            className="link-shortcut"
            onClick={() => document.getElementById('subtasks-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {t('{count} sub-tarefa(s) — ver na seção Sub-tarefas', { count: subtasks.length })}
          </button>
        </div>
      )}
      <div className="link-add">
        <SelectField<Relation>
          size="1"
          aria-label={t('Tipo de vínculo')}
          options={RELATIONS.map((r) => ({ ...r, label: t(r.label) }))}
          value={relation}
          onChange={setRelation}
        />
        <TextField.Root
          className="grow"
          aria-label={t('Buscar card para vincular')}
          placeholder={t('Buscar card por número ou título…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {q && found.length === 0 && <p className="muted small">{t('Nenhum card disponível com "{query}".', { query: query.trim() })}</p>}
      {found.length > 0 && (
        <ul className="link-results" aria-label={t('Cards encontrados')}>
          {found.map((c) => (
            <li key={c.id}>
              <RxButton
                variant="ghost"
                size="1"
                onClick={() => {
                  links.add(...ends(c, relation), kind(relation));
                  setQuery('');
                }}
              >
                <span className="card-id">{cardRef(c)}</span> {c.title}{' '}
                <span className="muted">· {dt(columnOf(state, c)?.name ?? '')}</span>
              </RxButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
