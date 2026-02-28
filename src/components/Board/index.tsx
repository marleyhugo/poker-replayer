import { Card } from '../Card';
import { formatChips } from '../../utils/format';
import styles from './Board.module.css';

interface BoardProps {
  cards: string[];
  pot: number;
  showBBUnits: boolean;
  bigBlind: number;
}

/**
 * Exibe as 5 cartas comunitárias e o pote total.
 * Slots vazios são renderizados como espaços reservados.
 */
export function Board({ cards, pot, showBBUnits, bigBlind }: BoardProps) {
  const slots = [0, 1, 2, 3, 4]; // sempre 5 slots (flop + turn + river)

  return (
    <div className={styles.boardWrapper}>
      {pot > 0 && (
        <div className={styles.pot}>
          Pot: {formatChips(pot, showBBUnits, bigBlind)}
        </div>
      )}
      <div className={styles.cards}>
        {slots.map(i => (
          <div key={i} className={styles.cardSlot}>
            {cards[i] ? <Card card={cards[i]} /> : <div className={styles.emptySlot} />}
          </div>
        ))}
      </div>
    </div>
  );
}
