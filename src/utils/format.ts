export function formatChips(amount: number, showBB: boolean, bigBlind: number): string {
  if (showBB && bigBlind > 0) {
    const bb = amount / bigBlind;
    return (bb % 1 === 0 ? String(bb) : bb.toFixed(1)) + 'BB';
  }
  return amount % 1 === 0 ? String(amount) : amount.toFixed(2);
}
