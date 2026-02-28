import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ParsedHand, GameState } from '../types/poker';
import { buildSteps } from '../engine/gameState';

/**
 * Gerencia o estado do replay de uma mão de poker.
 * Gera os passos via `buildSteps` e expõe navegação passo a passo.
 *
 * @returns `state` - snapshot atual da mesa (null se não há mão carregada)
 * @returns `next` / `prev` - avança ou retrocede um passo
 */
export function useReplay(hand: ParsedHand | null) {
  const steps = useMemo<GameState[]>(() => (hand ? buildSteps(hand) : []), [hand]);
  const [currentStep, setCurrentStep] = useState(0);

  // Reseta para o passo 0 sempre que a mão muda
  useEffect(() => {
    setCurrentStep(0);
  }, [hand]);

  const next = useCallback(() => {
    setCurrentStep(s => Math.min(s + 1, steps.length - 1));
  }, [steps.length]);

  const prev = useCallback(() => {
    setCurrentStep(s => Math.max(s - 1, 0));
  }, []);

  return {
    state: steps[currentStep] ?? null,
    currentStep,
    totalSteps: steps.length,
    next,
    prev,
  };
}
