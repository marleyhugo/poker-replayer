import { formatChips } from '../../utils/format';
import fichaSvg from '../../assets/ficha.svg';
import pilhaSvg from '../../assets/pilha.svg';
import styles from './BetChips.module.css';

interface BetChipsProps {
  betAmount: number;
  anteBet: number;
  betType: 'none' | 'ante' | 'blind' | 'action';
  startingStack: number;
  showBBUnits: boolean;
  bigBlind: number;
}

/**
 * Renderiza fichas visuais proporcionais ao tamanho da aposta.
 * - Ante: sem representação visual
 * - Blind: 1 ficha
 * - Action: baseado no % do stack inicial
 */
export function BetChips({ betAmount, anteBet, betType, startingStack, showBBUnits, bigBlind }: BetChipsProps) {
  // Antes não entram no campo `bet` da engine, então betAmount já exclui antes.
  // Mantemos a checagem de anteBet/betType para garantir que só ante não gera chip visual.
  if (betAmount <= 0 || betType === 'ante' || betType === 'none') return null;

  const label = formatChips(betAmount, showBBUnits, bigBlind);

  if (betType === 'blind') {
    return (
      <div className={styles.container}>
        <div className={styles.images}>
          <img src={fichaSvg} alt="" className={styles.ficha} />
        </div>
        <span className={styles.label}>{label}</span>
      </div>
    );
  }

  // betType === 'action': calcular % do stack inicial
  const pct = startingStack > 0 ? betAmount / startingStack : 1;

  let images: React.ReactNode;
  if (pct <= 0.1) {
    images = <img src={fichaSvg} alt="" className={styles.ficha} />;
  } else if (pct <= 0.4) {
    images = <img src={pilhaSvg} alt="" className={styles.pilha} />;
  } else if (pct <= 0.9) {
    images = (
      <>
        <img src={pilhaSvg} alt="" className={styles.pilha} />
        <img src={pilhaSvg} alt="" className={`${styles.pilha} ${styles.pilhaOffset}`} />
      </>
    );
  } else {
    images = (
      <>
        <img src={pilhaSvg} alt="" className={styles.pilha} />
        <img src={pilhaSvg} alt="" className={`${styles.pilha} ${styles.pilhaOffset}`} />
        <img src={pilhaSvg} alt="" className={`${styles.pilha} ${styles.pilhaOffset2}`} />
      </>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.images}>{images}</div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
