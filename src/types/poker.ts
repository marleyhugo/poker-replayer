export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = string; // e.g. "Ah", "Kd", "??" for unknown/face-down

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'post' | 'post-ante';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PokerFormat = 'pokerstars' | 'ggpoker' | '888poker' | 'wpn';

export interface RawAction {
  player: string;
  type: ActionType;
  amount?: number;
}

export interface StreetData {
  street: Street;
  board: Card[]; // [] for preflop, [c1,c2,c3] for flop, etc.
  actions: RawAction[];
}

export interface ParsedHand {
  id: string;
  format: PokerFormat;
  date: Date;
  stakes: { sb: number; bb: number };
  tableType: 'cash' | 'tournament';
  players: { seat: number; name: string; stack: number }[];
  dealerSeat: number;
  heroName?: string;
  holeCards: Record<string, [Card, Card]>; // playerName → [card1, card2]
  streets: StreetData[];
  winners: { player: string; amount: number; description?: string }[];
}

export interface PlayerState {
  name: string;
  seat: number;
  stack: number;
  bet: number;           // current street bet
  totalInvested: number; // total chips in pot
  holeCards?: [Card, Card];
  folded: boolean;
  isDealer: boolean;
  isActive: boolean;     // their turn to act
  isWinner: boolean;
  isAllIn: boolean;
}

export interface GameState {
  step: number;
  totalSteps: number;
  street: Street;
  board: Card[];
  players: PlayerState[];
  pot: number;
  message: string;
}
