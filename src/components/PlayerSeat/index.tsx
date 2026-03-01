import type { PlayerState } from '../../types/poker';
import { Card } from '../Card';
import { formatChips } from '../../utils/format';
import styles from './PlayerSeat.module.css';

interface PlayerSeatProps {
  player: PlayerState;
  /** Nome da classe CSS de posicionamento (ex: "seat0", "seat3"). */
  position: string;
  /** Label de posição de poker (ex: "BTN", "SB", "BB", "UTG", "CO"). */
  positionLabel?: string;
  showBBUnits: boolean;
  bigBlind: number;
}

/**
 * Renderiza o assento de um jogador na mesa: cartas, stack, aposta atual,
 * indicadores de all-in, vencedor e botão de dealer.
 */
export function PlayerSeat({ player, position, positionLabel, showBBUnits, bigBlind }: PlayerSeatProps) {
  // Compõe as classes CSS dinamicamente com base no estado do jogador
  const classes = [
    styles.seat,
    styles[position],
    player.folded ? styles.folded : '',
    player.isActive ? styles.active : '',
    player.isWinner ? styles.winner : '',
    player.isAllIn ? styles.allIn : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {player.isDealer && <div className={styles.dealerBtn}>D</div>}

      <div className={styles.cards}>
        {player.holeCards ? (
          <>
            <Card card={player.holeCards[0]} small />
            <Card card={player.holeCards[1]} small />
          </>
        ) : (
          <>
            <Card card="??" small />
            <Card card="??" small />
          </>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.name} title={player.name}>
          {positionLabel && (
            <span className={styles.positionLabel}>{positionLabel}</span>
          )}
          {/* Trunca nomes longos para não estourar o layout */}
          {player.name.length > 12 ? player.name.slice(0, 11) + '…' : player.name}
        </div>
        <div className={styles.stack}>
          {formatChips(player.stack, showBBUnits, bigBlind)}
        </div>
      </div>

      {player.bet > 0 && !player.folded && (
        <div className={styles.bet}>
          {formatChips(player.bet, showBBUnits, bigBlind)}
        </div>
      )}

      {player.isAllIn && !player.folded && (
        <div className={styles.allInBadge}>ALL IN</div>
      )}

      {player.isWinner && (
        <div className={styles.winnerBadge}>WINNER</div>
      )}

      {player.bounty !== undefined && (
        <div className={styles.bountyBadge}>
          <svg viewBox="0 0 14 14" width="10" height="10" className={styles.bountyIcon} aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="7" cy="7" r="1.8" fill="currentColor"/>
            <line x1="7" y1="1" x2="7" y2="3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="7" y1="10.8" x2="7" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="1" y1="7" x2="3.2" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="10.8" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span>${player.bounty}</span>
        </div>
      )}
    </div>
  );
}
