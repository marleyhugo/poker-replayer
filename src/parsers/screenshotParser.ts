import type { ParsedHand, RawAction, StreetData, Card } from '../types/poker';
import type { GeminiResponse } from '../services/geminiVision';

type ActionType = RawAction['type'];

const ACTION_MAP: Record<string, ActionType> = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  bet: 'bet',
  raise: 'raise',
  allin: 'allin',
  'all-in': 'allin',
};

/** Normaliza uma carta do Gemini (ex: "Ah", "10h" → "Th"). */
function normalizeCard(c: string): Card {
  if (!c || c.length < 2) return '??';
  const s = c.replace('10', 'T');
  const rank = s[0].toUpperCase();
  const suit = s[s.length - 1].toLowerCase();
  if (!'AKQJT98765432'.includes(rank)) return '??';
  if (!'hdcs'.includes(suit)) return '??';
  return rank + suit;
}

function mapAction(a: { player: string; action: string; amount?: number }): RawAction {
  const type = ACTION_MAP[a.action.toLowerCase()] ?? 'fold';
  return {
    player: a.player,
    type,
    amount: (type !== 'fold' && type !== 'check') ? a.amount : undefined,
  };
}

/** Converte a resposta do Gemini Vision em ParsedHand normalizado. */
export function parseScreenshot(data: GeminiResponse): ParsedHand {
  // Players
  const players = (data.players ?? []).map((p, i) => ({
    seat: p.seat ?? i + 1,
    name: p.name,
    stack: p.stack ?? 20,
  }));

  if (players.length < 2) {
    throw new Error('Gemini detectou menos de 2 jogadores. Verifique a imagem.');
  }

  // Dealer seat
  const dealer = data.players.find(p => p.isDealer);
  const dealerSeat = dealer?.seat ?? players[0].seat;

  // Board
  const boardCards: Card[] = [];
  const flop = data.board?.flop ?? [];
  for (const c of flop) boardCards.push(normalizeCard(c));
  if (data.board?.turn) boardCards.push(normalizeCard(data.board.turn));
  if (data.board?.river) boardCards.push(normalizeCard(data.board.river));

  // Streets
  const streets: StreetData[] = [];

  // Preflop — incluir antes e blinds
  const preflopActions: RawAction[] = [];
  const ante = data.blinds?.ante ?? 0;
  if (ante > 0) {
    for (const p of players) {
      preflopActions.push({ player: p.name, type: 'post-ante', amount: ante });
    }
  }
  if (data.blinds?.sbPlayer) {
    preflopActions.push({ player: data.blinds.sbPlayer, type: 'post', amount: data.blinds.sb ?? 0.5 });
  }
  if (data.blinds?.bbPlayer) {
    preflopActions.push({ player: data.blinds.bbPlayer, type: 'post', amount: data.blinds.bb ?? 1 });
  }
  for (const a of data.actions?.preflop ?? []) {
    preflopActions.push(mapAction(a));
  }
  streets.push({ street: 'preflop', board: [], actions: preflopActions });

  // Flop
  const flopActions = (data.actions?.flop ?? []).map(mapAction);
  if (flop.length > 0 || flopActions.length > 0) {
    streets.push({ street: 'flop', board: boardCards.slice(0, 3), actions: flopActions });
  }

  // Turn
  const turnActions = (data.actions?.turn ?? []).map(mapAction);
  if (data.board?.turn || turnActions.length > 0) {
    streets.push({ street: 'turn', board: boardCards.slice(0, 4), actions: turnActions });
  }

  // River
  const riverActions = (data.actions?.river ?? []).map(mapAction);
  if (data.board?.river || riverActions.length > 0) {
    streets.push({ street: 'river', board: boardCards.slice(0, 5), actions: riverActions });
  }

  // Hole cards
  const holeCards: Record<string, [Card, Card]> = {};
  for (const [name, cards] of Object.entries(data.holeCards ?? {})) {
    if (cards && cards.length >= 2) {
      holeCards[name] = [normalizeCard(cards[0]), normalizeCard(cards[1])];
    }
  }

  // Winner
  const winners: { player: string; amount: number }[] = [];
  if (data.winner?.player && data.winner?.amount > 0) {
    winners.push({ player: data.winner.player, amount: data.winner.amount });
  }

  return {
    id: data.handId ?? `IMG_${Date.now()}`,
    format: 'ggpoker',
    date: new Date(),
    stakes: { sb: 0.5, bb: 1 },
    tableType: 'tournament',
    players,
    dealerSeat,
    heroName: undefined,
    holeCards,
    streets,
    winners,
  };
}
