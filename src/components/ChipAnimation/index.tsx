import styles from './ChipAnimation.module.css';

interface ChipProps {
  id: string;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  amount: number;
  onDone: (id: string) => void;
}

export function ChipAnimation({ id, fromLeft, fromTop, toLeft, toTop, amount, onDone }: ChipProps) {
  return (
    <div
      className={styles.chip}
      style={{
        '--from-left': `${fromLeft}%`,
        '--from-top':  `${fromTop}%`,
        '--to-left':   `${toLeft}%`,
        '--to-top':    `${toTop}%`,
      } as React.CSSProperties}
      onAnimationEnd={() => onDone(id)}
      aria-hidden="true"
    >
      {amount > 0 ? `$${amount.toFixed(2)}` : ''}
    </div>
  );
}
