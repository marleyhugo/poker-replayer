import type { GameState } from '../types/poker';

export interface PotOddsInfo {
  amountToCall: number;
  percentage: number;
  ratio: string;
}

/**
 * Calcula pot odds da perspectiva do herói.
 * Retorna null quando não há aposta a pagar ou o herói não pode agir.
 */
export function calcPotOdds(state: GameState, heroName: string): PotOddsInfo | null {
  if (state.street === 'showdown') return null;

  const hero = state.players.find(p => p.name === heroName);
  if (!hero || hero.folded || hero.isAllIn) return null;

  const maxBet = Math.max(...state.players.map(p => p.bet));
  const amountToCall = maxBet - hero.bet;
  if (amountToCall <= 0) return null;

  const totalPotAfterCall = state.pot + amountToCall;
  const percentage = (amountToCall / totalPotAfterCall) * 100;
  const ratioValue = (state.pot) / amountToCall;
  const ratio = `${ratioValue % 1 === 0 ? ratioValue : ratioValue.toFixed(1)}:1`;

  return { amountToCall, percentage, ratio };
}
