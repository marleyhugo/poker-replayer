import fichaSvg from '../../assets/ficha.svg';
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

/**
 * Anima uma ficha se movendo de uma posição para outra na mesa.
 * Usa CSS custom properties (`--from-*` / `--to-*`) para controlar a trajetória.
 * Chama `onDone(id)` ao fim da animação para remover o elemento da lista.
 */
export function ChipAnimation({ id, fromLeft, fromTop, toLeft, toTop, onDone }: ChipProps) {
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
      <img src={fichaSvg} alt="" className={styles.chipImg} />
    </div>
  );
}
