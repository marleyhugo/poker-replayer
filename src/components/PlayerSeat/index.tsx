import type { PlayerState } from '../../types/poker';
import { Card } from '../Card';
import { formatChips } from '../../utils/format';
import styles from './PlayerSeat.module.css';

interface PlayerSeatProps {
  player: PlayerState;
  position: string; // CSS class name for positioning
  showBBUnits: boolean;
  bigBlind: number;
}

export function PlayerSeat({ player, position, showBBUnits, bigBlind }: PlayerSeatProps) {
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
    </div>
  );
}
