import { useMemo, useState } from 'react';
import { norm } from '../../shared/filters';
import type { Card } from '../../shared/model';

const LIMIT = 10;

interface Props {
  cards: Card[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  placeholder?: string;
}

/** Seletor de card com busca: mostra os 10 mais recentes e refina conforme o texto. */
export function CardPicker({ cards, selectedId, onSelect, placeholder = 'Buscar história…' }: Props) {
  const [query, setQuery] = useState('');
  const selected = cards.find((c) => c.id === selectedId);

  const { shown, total } = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const matches = cards
      .filter((c) => {
        const t = norm(c.title);
        return words.every((w) => t.includes(w));
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { shown: matches.slice(0, LIMIT), total: matches.length };
  }, [cards, query]);

  return (
    <div className="card-picker">
      {selected && (
        <span className="filter-chip" onClick={() => onSelect(null)} title="Limpar">
          <strong>{selected.title}</strong> ✕
        </span>
      )}
      <input type="search" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {shown.map((c) => (
          <li key={c.id} className={c.id === selectedId ? 'on' : ''} onClick={() => onSelect(c.id === selectedId ? null : c.id)} title={c.title}>
            {c.title}
          </li>
        ))}
        {shown.length === 0 && <li className="muted none">Nenhuma história encontrada.</li>}
      </ul>
      {total > shown.length && <span className="muted small">Mostrando {shown.length} de {total}. Digite para refinar.</span>}
    </div>
  );
}
