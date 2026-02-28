import styles from './ReplayControls.module.css';

interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onNextHand?: () => void;
  hasNextHand: boolean;
  onPrevHand?: () => void;
  hasPrevHand: boolean;
  showBBUnits: boolean;
  onToggleBBUnits: () => void;
}

/**
 * Barra de controles do replay: navegação por passo (◀/▶),
 * navegação entre mãos e toggle de unidade de exibição (fichas vs BB).
 */
export function ReplayControls({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onNextHand,
  hasNextHand,
  onPrevHand,
  hasPrevHand,
  showBBUnits,
  onToggleBBUnits,
}: ReplayControlsProps) {
  const atStart = currentStep === 0;
  const atEnd   = currentStep === totalSteps - 1;

  return (
    <div className={styles.controls}>
      <div className={styles.transport}>
        {onPrevHand && (
          <button
            className={`${styles.btn} ${styles.handNavBtn}`}
            onClick={onPrevHand}
            disabled={!hasPrevHand}
            title="Mão anterior"
          >
            ⏮ Mão anterior
          </button>
        )}

        <button
          className={styles.btn}
          onClick={onPrev}
          disabled={atStart}
          title="Ação anterior"
        >◀</button>

        <span className={styles.stepCounter}>
          {currentStep + 1} / {totalSteps}
        </span>

        <button
          className={styles.btn}
          onClick={onNext}
          disabled={atEnd}
          title="Próxima ação"
        >▶</button>

        {onNextHand && (
          <button
            className={`${styles.btn} ${styles.handNavBtn}`}
            onClick={onNextHand}
            disabled={!hasNextHand}
            title="Próxima mão"
          >
            Próxima mão ⏭
          </button>
        )}
      </div>

      <div className={styles.bbToggle}>
        <button
          className={`${styles.btn} ${styles.bbToggleBtn}${showBBUnits ? ` ${styles.bbToggleActive}` : ''}`}
          onClick={onToggleBBUnits}
          title="Alternar entre fichas e BB"
        >
          {showBBUnits ? 'BB' : 'Fichas'}
        </button>
      </div>
    </div>
  );
}
