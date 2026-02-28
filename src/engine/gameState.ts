import type { ParsedHand, GameState, PlayerState, Street } from '../types/poker';

/** Cria uma cópia rasa de cada PlayerState para isolar snapshots de estado. */
function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map(p => ({ ...p }));
}

/** Formata um valor monetário: inteiros sem decimais (ex: $5), frações com 2 casas (ex: $1.50). */
function fmtAmount(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

/**
 * Desconta fichas do jogador, limitado ao stack disponível.
 * Atualiza `stack`, `bet`, `totalInvested` e marca `isAllIn` se o stack zerar.
 * Retorna o valor efetivamente descontado.
 */
function deduct(player: PlayerState, requested: number): number {
  const actual = Math.min(Math.max(requested, 0), player.stack);
  player.stack -= actual;
  player.bet += actual;
  player.totalInvested += actual;
  if (player.stack === 0) player.isAllIn = true;
  return actual;
}

/**
 * Transforma uma mão parseada em uma sequência de GameState (um por ação).
 * Cada estado é um snapshot completo da mesa naquele momento do replay.
 */
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

  /** Cria um snapshot imutável do estado atual da mesa com a mensagem fornecida. */
  function snapshot(message: string): GameState {
    return {
      step: step++,
      totalSteps: 0, // preenchido ao final com back-fill
      street,
      board: [...board],
      players: clonePlayers(players),
      pot,
      message,
    };
  }

  /** Zera as apostas da street e desmarca o jogador ativo (início de nova fase). */
  function resetStreetBets() {
    players.forEach(p => { p.bet = 0; p.isActive = false; });
  }

  /** Marca apenas o jogador `name` como ativo (vez de agir). */
  function setActive(name: string) {
    players.forEach(p => { p.isActive = p.name === name; });
  }

  // Passo 0: estado inicial com cartas distribuídas
  steps.push(snapshot('Início da mão'));

  for (const streetData of hand.streets) {
    if (streetData.street === 'showdown') {
      street = 'showdown';
      // Revela as cartas apenas de jogadores que não deram fold (e que têm holeCards registradas)
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
          message = `${action.player} posta ${label} ${fmtAmount(paid)}`;
          break;
        }
        case 'post-ante': {
          const paid = deduct(player, action.amount ?? 0);
          pot += paid;
          message = `${action.player} posta ante ${fmtAmount(paid)}`;
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
          // Valor a pagar = diferença entre a maior aposta da mesa e a aposta atual do jogador,
          // limitado pelo stack (trata calls implícitos de all-in).
          const maxBet = Math.max(...players.map(p => p.bet));
          const paid = deduct(player, maxBet - player.bet);
          pot += paid;
          message = `${action.player} paga (call) ${fmtAmount(paid)}`;
          break;
        }
        case 'bet': {
          const paid = deduct(player, action.amount ?? 0);
          pot += paid;
          message = `${action.player} aposta (bet) ${fmtAmount(paid)}`;
          break;
        }
        case 'raise': {
          // raiseTo é o total da aposta na street, não o incremento adicional.
          const raiseTo = action.amount ?? 0;
          const paid = deduct(player, raiseTo - player.bet);
          pot += paid;
          message = `${action.player} aumenta (raise) para ${fmtAmount(player.bet)}`;
          break;
        }
        case 'allin': {
          // Coloca todas as fichas restantes no pote.
          const paid = deduct(player, player.stack);
          pot += paid;
          message = `${action.player} vai all-in ${fmtAmount(paid)}`;
          break;
        }
      }

      steps.push(snapshot(message));
    }
  }

  // Marca vencedores e credita o valor ganho ao stack de cada um
  if (hand.winners.length > 0) {
    players.forEach(p => { p.isActive = false; });
    hand.winners.forEach(w => {
      const p = players.find(pl => pl.name === w.player);
      if (p) {
        p.isWinner = true;
        p.stack += w.amount;
      }
    });
    const desc = hand.winners.map(w => `${w.player} (${fmtAmount(w.amount)})`).join(', ');
    steps.push(snapshot(`Vencedor: ${desc}`));
  }

  // Back-fill: preenche totalSteps em todos os passos agora que o total é conhecido
  const total = steps.length;
  steps.forEach((s, i) => { s.step = i; s.totalSteps = total; });

  return steps;
}
