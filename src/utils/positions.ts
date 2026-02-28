/**
 * Labels de posição por número de jogadores.
 * O array começa no BTN (índice 0) e segue sentido horário: SB, BB, UTG, ..., CO.
 */
const POSITIONS_BY_COUNT: Record<number, string[]> = {
  2:  ['BTN', 'BB'],
  3:  ['BTN', 'SB', 'BB'],
  4:  ['BTN', 'SB', 'BB', 'UTG'],
  5:  ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6:  ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7:  ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8:  ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9:  ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  10: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP1', 'MP2', 'LJ', 'HJ', 'CO'],
};

/**
 * Calcula a posição de mesa de cada jogador (BTN, SB, BB, UTG, CO, etc.)
 * com base no assento do dealer e na lista de jogadores.
 *
 * Retorna um Map de seatNumber → label de posição.
 *
 * Nota HU (2 jogadores): o BTN posta a SB, portanto recebe o label "BTN".
 */
export function computePositions(
  players: { seat: number }[],
  dealerSeat: number,
): Map<number, string> {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const btnIdx = sorted.findIndex(p => p.seat === dealerSeat);
  if (btnIdx === -1) return new Map();

  // Rotaciona para o BTN ficar no índice 0
  const rotated = [...sorted.slice(btnIdx), ...sorted.slice(0, btnIdx)];
  const n = rotated.length;
  // Fallback genérico para mesas fora do padrão (P0, P1, ...)
  const labels = POSITIONS_BY_COUNT[n] ?? rotated.map((_, i) => `P${i}`);

  const map = new Map<number, string>();
  rotated.forEach((p, i) => map.set(p.seat, labels[i] ?? `P${i}`));
  return map;
}
