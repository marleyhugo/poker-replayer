import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ParsedHand, GameState } from '../types/poker';
import { buildSteps } from '../engine/gameState';

export function useReplay(hand: ParsedHand | null) {
  const steps = useMemo<GameState[]>(() => (hand ? buildSteps(hand) : []), [hand]);
  const [currentStep, setCurrentStep] = useState(0);

  // Reset when hand changes
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
