import type { PlayerState } from '../../types/poker';
import { Card } from '../Card';
import { formatChips } from '../../utils/format';
import styles from './PlayerSeat.module.css';

interface PlayerSeatProps {
  player: PlayerState;
  /** Posição horizontal em % do container. */
  left: number;
  /** Posição vertical em % do container. */
  top: number;
  /** Label de posição de poker (ex: "BTN", "SB", "BB", "UTG", "CO"). */
  positionLabel?: string;
  showBBUnits: boolean;
  bigBlind: number;
  isHero?: boolean;
  /** Quando true, mostra cartas viradas (??) mesmo que holeCards existam. */
  hideCards?: boolean;
}

/**
 * Renderiza o assento de um jogador na mesa: cartas, stack, aposta atual,
 * indicadores de all-in, vencedor e botão de dealer.
 */
export function PlayerSeat({ player, left, top, positionLabel, showBBUnits, bigBlind, isHero, hideCards }: PlayerSeatProps) {
  const classes = [
    styles.seat,
    player.folded ? styles.folded : '',
    player.isActive ? styles.active : '',
    player.isWinner ? styles.winner : '',
    player.isAllIn ? styles.allIn : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={{ left: `${left}%`, top: `${top}%` }}>
      <div className={styles.cards}>
        {player.holeCards && !hideCards ? (
          <>
            <Card card={player.holeCards[0]} />
            <Card card={player.holeCards[1]} />
          </>
        ) : (
          <>
            <Card card="??" />
            <Card card="??" />
          </>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.name} title={player.name}>
          {positionLabel && (
            <span className={styles.positionLabel}>{positionLabel}</span>
          )}
          {player.name.length > 12 ? player.name.slice(0, 11) + '…' : player.name}
        </div>
        <div className={styles.bottomRow}>
          {player.bounty !== undefined && (
            <span className={styles.bountyLabel}>
              <svg viewBox="0 0 14 14" width="8" height="8" className={styles.bountyIcon} aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="7" cy="7" r="1.8" fill="currentColor"/>
                <line x1="7" y1="1" x2="7" y2="3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="7" y1="10.8" x2="7" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="1" y1="7" x2="3.2" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="10.8" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              ${player.bounty}
            </span>
          )}
          <span className={styles.stack}>
            {formatChips(player.stack, showBBUnits, bigBlind)}
          </span>
        </div>
      </div>

      {player.isAllIn && !player.folded && (
        <div className={styles.allInBadge}>ALL IN</div>
      )}

      {player.isWinner && (
        <div className={styles.winnerBadge}>WINNER</div>
      )}
    </div>
  );
}
