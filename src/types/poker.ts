// ─── Primitivos ────────────────────────────────────────────────────────────────

/** Naipe de uma carta: hearts, diamonds, clubs, spades. */
export type Suit = 'h' | 'd' | 'c' | 's';

/** Valor de uma carta. 'T' representa o 10. */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

/** Carta representada como string (ex: "Ah", "Kd", "??" para desconhecida/virada). */
export type Card = string;

/** Tipo de ação que um jogador pode executar. */
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'post' | 'post-ante';

/** Fase da mão. */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

/** Formato de hand history suportado. */
export type PokerFormat = 'pokerstars' | 'ggpoker' | '888poker' | 'wpn' | 'ipoker' | 'partypoker';

// ─── Estruturas de dados do parser ─────────────────────────────────────────────

/** Uma ação bruta extraída do hand history. */
export interface RawAction {
  player: string;
  type: ActionType;
  /** Valor em fichas/dinheiro da ação (undefined para fold/check). */
  amount?: number;
}

/** Dados de uma fase (street) da mão: cartas comunitárias e ações ocorridas. */
export interface StreetData {
  street: Street;
  /** Cartas comunitárias vigentes nessa fase ([] no preflop, [c1,c2,c3] no flop, etc.). */
  board: Card[];
  actions: RawAction[];
}

/** Representação normalizada de uma mão, independente do formato de origem. */
export interface ParsedHand {
  id: string;
  format: PokerFormat;
  date: Date;
  stakes: { sb: number; bb: number };
  tableType: 'cash' | 'tournament';
  players: { seat: number; name: string; stack: number; bounty?: number }[];
  /** Assento do jogador com o botão (dealer). */
  dealerSeat: number;
  /** Nome do herói (perspectiva do jogador local), se disponível. */
  heroName?: string;
  /** Mapa nome do jogador → [carta1, carta2]. */
  holeCards: Record<string, [Card, Card]>;
  streets: StreetData[];
  winners: { player: string; amount: number; description?: string }[];
}

// ─── Estado do jogo (engine) ───────────────────────────────────────────────────

/** Snapshot do estado de um jogador em um passo específico do replay. */
export interface PlayerState {
  name: string;
  seat: number;
  stack: number;
  /** Aposta feita na street atual (zerada no início de cada nova fase). */
  bet: number;
  /** Total de fichas investidas ao longo de toda a mão. */
  totalInvested: number;
  holeCards?: [Card, Card];
  folded: boolean;
  isDealer: boolean;
  /** Indica que é a vez deste jogador agir no passo atual. */
  isActive: boolean;
  isWinner: boolean;
  isAllIn: boolean;
  /** Tipo da aposta atual: ante, blind (SB/BB) ou action (call/bet/raise/allin). */
  betType: 'none' | 'ante' | 'blind' | 'action';
  /** Parcela da aposta atual que é de ante (para excluir da representação visual). */
  anteBet: number;
  bounty?: number;
}

/** Snapshot completo da mesa em um passo do replay. */
export interface GameState {
  /** Índice do passo atual (0-based). */
  step: number;
  /** Número total de passos na mão. */
  totalSteps: number;
  street: Street;
  board: Card[];
  players: PlayerState[];
  pot: number;
  /** Mensagem descritiva da ação que gerou este estado (ex: "Hero posta big blind $1"). */
  message: string;
}
