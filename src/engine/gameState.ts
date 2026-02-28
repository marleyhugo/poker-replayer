import type { ParsedHand, GameState, PlayerState, Street } from '../types/poker';

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map(p => ({ ...p }));
}

function fmt(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// Deducts chips from player, capped at their stack. Returns actual amount deducted.
function deduct(player: PlayerState, requested: number): number {
  const actual = Math.min(Math.max(requested, 0), player.stack);
  player.stack -= actual;
  player.bet += actual;
  player.totalInvested += actual;
  if (player.stack === 0) player.isAllIn = true;
  return actual;
}

export function buildSteps(hand: ParsedHand): GameState[] {
  const steps: GameState[] = [];

  let players: PlayerState[] = hand.players.map(p => ({
    name: p.name,
    seat: p.seat,
    stack: p.stack,
    bet: 0,
    totalInvested: 0,
    holeCards: hand.holeCards[p.name],
    folded: false,
    isDealer: p.seat === hand.dealerSeat,
    isActive: false,
    isWinner: false,
    isAllIn: false,
  }));

  let pot = 0;
  let street: Street = 'preflop';
  let board: string[] = [];
  let step = 0;

  function snapshot(message: string): GameState {
    return {
      step: step++,
      totalSteps: 0,
      street,
      board: [...board],
      players: clonePlayers(players),
      pot,
      message,
    };
  }

  function resetStreetBets() {
    players.forEach(p => { p.bet = 0; p.isActive = false; });
  }

  function setActive(name: string) {
    players.forEach(p => { p.isActive = p.name === name; });
  }

  // Step 0: cards dealt
  steps.push(snapshot('Início da mão'));

  for (const streetData of hand.streets) {
    if (streetData.street === 'showdown') {
      street = 'showdown';
      // Only reveal cards of non-folded players (or those present in holeCards)
      players.forEach(p => {
        if (!p.folded && hand.holeCards[p.name]) {
          p.holeCards = hand.holeCards[p.name];
        }
      });
      steps.push(snapshot('Showdown'));
      continue;
    }

    if (streetData.street !== 'preflop') {
      resetStreetBets();
      street = streetData.street;
      board = [...streetData.board];
      const label = { flop: 'Flop', turn: 'Turn', river: 'River' }[streetData.street] ?? streetData.street;
      steps.push(snapshot(`${label}: [${streetData.board.join(' ')}]`));
    } else {
      street = 'preflop';
    }

    for (const action of streetData.actions) {
      const player = players.find(p => p.name === action.player);
      if (!player) continue;

      setActive(action.player);
      let message = '';

      switch (action.type) {
        case 'post': {
          const paid = deduct(player, action.amount ?? 0);
          pot += paid;
          const label = action.amount === hand.stakes.sb ? 'small blind' : 'big blind';
          message = `${action.player} posta ${label} ${fmt(paid)}`;
          break;
        }
        case 'post-ante': {
          const paid = deduct(player, action.amount ?? 0);
          pot += paid;
          message = `${action.player} posta ante ${fmt(paid)}`;
          break;
        }
        case 'fold': {
          player.folded = true;
          player.isActive = false;
          message = `${action.player} desiste (fold)`;
          break;
        }
        case 'check': {
          message = `${action.player} passa (check)`;
          break;
        }
        case 'call': {
          // Amount to call = difference between current max bet and player's current bet,
          // capped by remaining stack (handles implicit all-in calls).
          const maxBet = Math.max(...players.map(p => p.bet));
          const paid = deduct(player, maxBet - player.bet);
          pot += paid;
          message = `${action.player} paga (call) ${fmt(paid)}`;
          break;
        }
        case 'bet': {
          const paid = deduct(player, action.amount ?? 0);
          pot += paid;
          message = `${action.player} aposta (bet) ${fmt(paid)}`;
          break;
        }
        case 'raise': {
          // raiseTo is the total bet for the street, not the increment.
          const raiseTo = action.amount ?? 0;
          const paid = deduct(player, raiseTo - player.bet);
          pot += paid;
          message = `${action.player} aumenta (raise) para ${fmt(player.bet)}`;
          break;
        }
        case 'allin': {
          // Put all remaining chips in.
          const paid = deduct(player, player.stack);
          pot += paid;
          message = `${action.player} vai all-in ${fmt(paid)}`;
          break;
        }
      }

      steps.push(snapshot(message));
    }
  }

  // Mark winners and credit stacks
  if (hand.winners.length > 0) {
    players.forEach(p => { p.isActive = false; });
    hand.winners.forEach(w => {
      const p = players.find(pl => pl.name === w.player);
      if (p) {
        p.isWinner = true;
        p.stack += w.amount;
      }
    });
    const desc = hand.winners.map(w => `${w.player} (${fmt(w.amount)})`).join(', ');
    steps.push(snapshot(`Vencedor: ${desc}`));
  }

  // Back-fill totalSteps now that we know the count
  const total = steps.length;
  steps.forEach((s, i) => { s.step = i; s.totalSteps = total; });

  return steps;
}
