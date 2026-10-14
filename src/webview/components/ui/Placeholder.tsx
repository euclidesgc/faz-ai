import { Skeleton } from '@radix-ui/themes';
import { t } from '../../i18n';

/**
 * Esqueleto da primeira carga de uma tela com forma conhecida (board, Métricas, Consumo): blocos cinza no lugar
 * do que vai aparecer, com o texto para o leitor de tela. Nunca cobre dado que já está na tela: numa recarga
 * a tela mantém os números e diz "Atualizando…" (ver DESIGN.md, "Estados de espera").
 */
export function Placeholder({ label, lines = 3, className }: { label: string; lines?: number; className?: string }) {
  return (
    <div className={['placeholder', className].filter(Boolean).join(' ')} aria-busy="true" data-placeholder={label}>
      {/* sem role próprio: a tela que o usa já tem a região aria-live (Métricas) ou a seção com aria-busy (Consumo) */}
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="placeholder-line" style={{ width: `${100 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

/** O board antes do primeiro estado: a barra do topo e três colunas com cards. */
export function BoardPlaceholder() {
  return (
    <div className="placeholder-board" aria-busy="true" data-placeholder={t('Carregando board…')}>
      <span className="sr-only" role="status">
        {t('Carregando board…')}
      </span>
      <Skeleton className="placeholder-topbar" />
      <div className="placeholder-columns">
        {[0, 1, 2].map((col) => (
          <div key={col} className="placeholder-column">
            <Skeleton className="placeholder-line" style={{ width: '45%' }} />
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="placeholder-card" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
