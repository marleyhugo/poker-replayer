import type { RawAction, StreetData, Street, ParsedHand } from '../types/poker';

// ─── Helpers de parsing de valores e cartas ──────────────────────────────────

/** Remove símbolos de moeda e vírgulas, convertendo para número (ex: "$1,234.56" → 1234.56). */
export function parseAmount(s: string): number {
  return parseFloat(s.replace(/[$,]/g, '')) || 0;
}

/** Normaliza a notação de uma carta (ex: "10h" → "Th"). */
export function parseCard(s: string): string {
  return s.replace('10', 'T').trim();
}

/** Divide uma string de cartas separadas por espaço e normaliza cada uma. */
export function parseCards(s: string): string[] {
  return s.trim().split(/\s+/).map(parseCard).filter(Boolean);
}

/**
 * Extrai exatamente duas cartas de uma string.
 * Retorna null se houver menos de 2 cartas.
 */
export function parseTwoCards(s: string): [string, string] | null {
  const cards = parseCards(s);
  return cards.length >= 2 ? [cards[0], cards[1]] : null;
}

// ─── Máquina de estados para streets ─────────────────────────────────────────

/**
 * Estado mutável usado durante o parse para acumular ações e
 * fazer transições entre streets.
 */
export interface StreetMachine {
  street: Street;
  actions: RawAction[];
  board: string[];
  /** Torna-se true após o início oficial do preflop (hole cards dealt). */
  started: boolean;
}

/** Cria uma máquina de estados inicializada no preflop. */
export function newStreetMachine(): StreetMachine {
  return { street: 'preflop', actions: [], board: [], started: false };
}

/**
 * Finaliza a street atual (adicionando-a a `streets`) e inicia uma nova.
 * Só salva se a street teve algum início ou ação registrada.
 */
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

/**
 * Salva a street atual em `streets` sem iniciar uma nova.
 * Chamado ao atingir o fim do hand history (SUMMARY ou EOF).
 */
export function flushStreet(machine: StreetMachine, streets: StreetData[]): void {
  if (machine.started || machine.actions.length > 0) {
    streets.push({
      street: machine.street,
      board: [...machine.board],
      actions: machine.actions,
    });
  }
}

// ─── Extração de cartas comunitárias ─────────────────────────────────────────

/** Extrai cartas do último par de colchetes `[...]` em uma linha. */
export function extractLastBracket(line: string): string[] {
  const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) return [];
  return parseCards(matches[matches.length - 1][1]);
}

/**
 * Extrai apenas a carta nova do Turn/River no padrão `[board] [newCard]`.
 * Retorna null se não encontrar um segundo par de colchetes.
 */
export function extractNewCard(line: string): string | null {
  const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length < 2) return null;
  const lastContent = matches[matches.length - 1][1].trim();
  const card = parseCard(lastContent);
  return card.length >= 2 ? card : null;
}

// ─── Acumulação de vencedores ─────────────────────────────────────────────────

/**
 * Adiciona um vencedor à lista, somando ao existente se o jogador já apareceu antes.
 * Cobre casos de main pot + side pot para o mesmo jogador.
 */
export function addWinner(
  winners: ParsedHand['winners'],
  player: string,
  amount: number,
): void {
  const existing = winners.find(w => w.player === player);
  if (existing) {
    existing.amount += amount;
  } else {
    winners.push({ player, amount });
  }
}
