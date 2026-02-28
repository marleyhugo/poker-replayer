import type { RawAction, StreetData, Street, ParsedHand } from '../types/poker';

// ─── Helpers básicos ────────────────────────────────────────────────────────

export function parseAmount(s: string): number {
  return parseFloat(s.replace(/[$,]/g, '')) || 0;
}

export function parseCard(s: string): string {
  return s.replace('10', 'T').trim();
}

export function parseCards(s: string): string[] {
  return s.trim().split(/\s+/).map(parseCard).filter(Boolean);
}

export function parseTwoCards(s: string): [string, string] | null {
  const cards = parseCards(s);
  return cards.length >= 2 ? [cards[0], cards[1]] : null;
}

// ─── Máquina de estados para streets ────────────────────────────────────────

export interface StreetMachine {
  street: Street;
  actions: RawAction[];
  board: string[];
  started: boolean;
}

export function newStreetMachine(): StreetMachine {
  return { street: 'preflop', actions: [], board: [], started: false };
}

export function transitionStreet(
  machine: StreetMachine,
  streets: StreetData[],
  nextStreet: Street,
  board: string[],
): void {
  if (machine.started || machine.actions.length > 0) {
    streets.push({
      street: machine.street,
      board: [...machine.board],
      actions: machine.actions,
    });
  }
  machine.street = nextStreet;
  machine.board = board;
  machine.actions = [];
  machine.started = true;
}

export function flushStreet(machine: StreetMachine, streets: StreetData[]): void {
  if (machine.started || machine.actions.length > 0) {
    streets.push({
      street: machine.street,
      board: [...machine.board],
      actions: machine.actions,
    });
  }
}

// ─── Extração de placa de board ─────────────────────────────────────────────

/** Extrai cartas do último par de colchetes `[...]` em uma linha. */
export function extractLastBracket(line: string): string[] {
  const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) return [];
  return parseCards(matches[matches.length - 1][1]);
}

/** Extrai apenas a carta extra (Turn/River) do padrão `[board] [newCard]`. */
export function extractNewCard(line: string): string | null {
  const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length < 2) return null;
  const lastContent = matches[matches.length - 1][1].trim();
  const card = parseCard(lastContent);
  return card.length >= 2 ? card : null;
}

// ─── Deduplica winners ──────────────────────────────────────────────────────

export function addWinner(
  winners: ParsedHand['winners'],
  player: string,
  amount: number,
): void {
  const existing = winners.find(w => w.player === player);
  if (existing) {
    // Se o mesmo jogador ganhou dois pots (ex: main pot + side pot), some
    existing.amount += amount;
  } else {
    winners.push({ player, amount });
  }
}
