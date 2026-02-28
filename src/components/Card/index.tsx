import styles from './Card.module.css';

interface CardProps {
  card: string; // e.g. "Ah", "Kd", "??"
  small?: boolean;
}

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const RED_SUITS  = new Set(['h', 'd']);
const FACE_DOWN  = new Set(['??', '?', 'XX']);

export function Card({ card, small }: CardProps) {
  if (!card || FACE_DOWN.has(card)) {
    return (
      <div className={`${styles.card} ${styles.faceDown} ${small ? styles.small : ''}`}>
        <div className={styles.cardBack} />
      </div>
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const isRed = RED_SUITS.has(suit);

  return (
    <div className={`${styles.card} ${isRed ? styles.red : styles.black} ${small ? styles.small : ''}`}>
      <span className={styles.rank}>{rank}</span>
      <span className={styles.suit}>{symbol}</span>
    </div>
  );
}
