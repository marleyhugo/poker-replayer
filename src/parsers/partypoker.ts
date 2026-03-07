import type { ParsedHand, RawAction, StreetData } from '../types/poker';
import {
  parseAmount, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  addWinner,
} from './utils';

// ─── Regex patterns para linhas de ação ─────────────────────────────────────

const RE_FOLDS  = /^(.+?)\s+folds/i;
const RE_CHECKS = /^(.+?)\s+checks/i;
const RE_CALLS  = /^(.+?)\s+calls\s+\(?[\$]?([\d,.]+)\)?/i;
const RE_BETS   = /^(.+?)\s+bets\s+\(?[\$]?([\d,.]+)\)?/i;
// "Hero raises 828305 to 888305" — captura o valor final (to)
const RE_RAISES = /^(.+?)\s+raises\s+[\d,.]+ to \$?([\d,.]+)/i;

// ─── Regex patterns para estrutura do hand history ──────────────────────────

const RE_HAND_ID       = /Hand History [Ff]or Game (\S+)/;
const RE_STAKES_LINE   = /^\d+\/\d+.*(?:Tourney|Texas|Holdem)/i;
const RE_STAKES_VALUES = /^(\d+)\/(\d+)/;
const RE_TOURNAMENT    = /Tournament|Tourney|MTT|Sit.n.Go/i;
const RE_DAY_OF_WEEK   = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/;
const RE_DATE_PARTS    = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\w+)\s+(\d+)\s+([\d:]+)\s+\w+\s+(\d{4})/;
const RE_DEALER_SEAT   = /Seat (?:#)?(\d+)/;
const RE_SEAT_LINE     = /^Seat (\d+):\s+(.+?)\s+\(([\d,.]+)\)\s*$/;
const RE_DEALT_TO      = /^Dealt to (.+?) \[\s*(.+?)\s*\]/;
const RE_SHOWDOWN_HAND = /^(.+?)\s+balance\s+[\d,]+,.*\[\s*([A-Za-z0-9]+)\s*,\s*([A-Za-z0-9]+)\s*\]/;

// ─── Regex patterns para streets e blinds ───────────────────────────────────

const RE_DEALING_DOWN  = /^\*\* Dealing down cards \*\*/i;
const RE_DEALING_FLOP  = /^\*\* Dealing Flop \*\*/i;
const RE_DEALING_TURN  = /^\*\* Dealing Turn \*\*/i;
const RE_DEALING_RIVER = /^\*\* Dealing River \*\*/i;
const RE_SUMMARY       = /^\*\* Summary \*\*/i;
const RE_ANTE          = /^(.+?)\s+posts ante\s+\(?([\d,.]+)\)?/i;
const RE_SMALL_BLIND   = /^(.+?)\s+posts small blind\s+\(?([\d,.]+)\)?/i;
const RE_BIG_BLIND     = /^(.+?)\s+posts big blind\s+\(?([\d,.]+)\)?/i;
const RE_ALL_IN        = /is all-in/i;
const RE_CREATING_POT  = /^Creating /i;
const RE_BRACKET_CARDS = /\[\s*(.+?)\s*\]/;

// Regex para extração de vencedores no summary
const RE_WINNER_LINE   = /^(.+?)\s+balance\s+[\d,]+,\s*bet\s+[\d,]+,\s*collected\s+([\d,]+)/;

// ─── Mapa de meses para parsing de data ─────────────────────────────────────

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// ─── Parsing de linha de ação ───────────────────────────────────────────────

/**
 * Converte uma linha de ação do PartyPoker em RawAction.
 *
 * Formatos suportados:
 *   "Player folds"
 *   "Player checks"
 *   "Player calls (120000)" ou "Player calls 120000"
 *   "Player bets (360000)" ou "Player bets 360000"
 *   "Player raises X to Y"
 *
 * Retorna null se a linha não corresponder a nenhuma ação reconhecida.
 */
function parseLine(line: string): RawAction | null {
  const foldMatch = line.match(RE_FOLDS);
  if (foldMatch) return { player: foldMatch[1].trim(), type: 'fold' };

  const checkMatch = line.match(RE_CHECKS);
  if (checkMatch) return { player: checkMatch[1].trim(), type: 'check' };

  const callMatch = line.match(RE_CALLS);
  if (callMatch) return { player: callMatch[1].trim(), type: 'call', amount: parseAmount(callMatch[2]) };

  const betMatch = line.match(RE_BETS);
  if (betMatch) return { player: betMatch[1].trim(), type: 'bet', amount: parseAmount(betMatch[2]) };

  const raiseMatch = line.match(RE_RAISES);
  if (raiseMatch) return { player: raiseMatch[1].trim(), type: 'raise', amount: parseAmount(raiseMatch[2]) };

  return null;
}

// ─── Helpers de extração ────────────────────────────────────────────────────

/** Extrai o ID da mão a partir do header. */
function parseHandId(text: string): string {
  const match = text.match(RE_HAND_ID);
  return match ? match[1] : '0';
}

/** Extrai os valores de small blind e big blind a partir das linhas. */
function parseStakes(lines: string[]): { sb: number; bb: number } {
  const stakesLine = lines.find(l => RE_STAKES_LINE.test(l)) ?? '';
  const match = stakesLine.match(RE_STAKES_VALUES);
  return match
    ? { sb: parseInt(match[1], 10), bb: parseInt(match[2], 10) }
    : { sb: 0, bb: 0 };
}

/**
 * Extrai a data da mão.
 * Formato PartyPoker: "Mon Sep 15 17:46:17 EDT 2025"
 */
function parseDate(lines: string[]): Date {
  const dateLine = lines.find(l => RE_DAY_OF_WEEK.test(l)) ?? '';
  const match = dateLine.match(RE_DATE_PARTS);
  if (!match) return new Date();

  const mon = MONTHS[match[1]] ?? '01';
  const day = match[2].padStart(2, '0');
  return new Date(`${match[4]}-${mon}-${day}T${match[3]}`);
}

/** Extrai o número do seat do dealer (button). */
function parseDealerSeat(lines: string[]): number {
  const dealerLine = lines.find(l => /is the button/i.test(l)) ?? '';
  return parseInt(dealerLine.match(RE_DEALER_SEAT)?.[1] ?? '1');
}

/** Extrai a lista de jogadores com seat, nome e stack. */
function parsePlayers(lines: string[]): ParsedHand['players'] {
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    // Ignora a linha que identifica o button (também contém "Seat")
    if (/is the button/i.test(line)) continue;

    const match = line.match(RE_SEAT_LINE);
    if (match) {
      players.push({
        seat: parseInt(match[1]),
        name: match[2].trim(),
        stack: parseAmount(match[3]),
      });
    }
  }
  return players;
}

/**
 * Extrai as hole cards dos jogadores.
 *
 * Duas fontes:
 * 1. "Dealt to Hero [ Qh, Ah ]" — cartas distribuídas ao herói
 * 2. Summary: "Player5 balance ..., collected ...[ 8d, 8h ]" — cartas reveladas no showdown
 */
function parseHoleCards(lines: string[]): { holeCards: ParsedHand['holeCards']; heroName?: string } {
  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;

  for (const line of lines) {
    // Cartas distribuídas ao herói
    const dealt = line.match(RE_DEALT_TO);
    if (dealt) {
      heroName = dealt[1];
      const cards = dealt[2].split(/[,\s]+/).filter(Boolean);
      const pair = parseTwoCards(cards.join(' '));
      if (pair) holeCards[dealt[1]] = pair;
      continue;
    }

    // Cartas reveladas no showdown (seção summary)
    const showMatch = line.match(RE_SHOWDOWN_HAND);
    if (showMatch) {
      const name = showMatch[1].trim();
      const pair = parseTwoCards(`${showMatch[2]} ${showMatch[3]}`);
      if (pair && !holeCards[name]) holeCards[name] = pair;
    }
  }

  return { holeCards, heroName };
}

/**
 * Extrai as cartas de dentro de colchetes, removendo vírgulas.
 * Ex: "[ 7s, Ks, 8s ]" → ["7s", "Ks", "8s"]
 */
function extractBracketCards(line: string): string[] {
  const match = line.match(RE_BRACKET_CARDS);
  return match ? parseCards(match[1].replace(/,/g, ' ')) : [];
}

/**
 * Processa as linhas da mão para construir as streets (preflop, flop, turn, river).
 *
 * Utiliza uma máquina de estados (StreetMachine) que acumula ações e faz
 * transições ao encontrar marcadores de street ("** Dealing Flop **", etc.).
 *
 * No PartyPoker, antes e blinds aparecem ANTES de "** Dealing down cards **",
 * por isso são capturados fora do guard `inAction`.
 */
function parseStreets(lines: string[]): StreetData[] {
  const streets: StreetData[] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    // ── Marcadores de street ──

    // Início do preflop: distribuição das hole cards
    if (RE_DEALING_DOWN.test(line)) {
      inAction = true;
      machine.started = true;
      continue;
    }

    // Transição para o flop: "** Dealing Flop ** [ 7s, Ks, 8s ]"
    if (RE_DEALING_FLOP.test(line)) {
      const board = extractBracketCards(line);
      transitionStreet(machine, streets, 'flop', board);
      continue;
    }

    // Transição para o turn: "** Dealing Turn ** [ Qd ]"
    if (RE_DEALING_TURN.test(line)) {
      const newCard = extractBracketCards(line)[0];
      transitionStreet(machine, streets, 'turn', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }

    // Transição para o river: "** Dealing River ** [ 3c ]"
    if (RE_DEALING_RIVER.test(line)) {
      const newCard = extractBracketCards(line)[0];
      transitionStreet(machine, streets, 'river', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }

    // Fim das ações: flush da street atual
    if (RE_SUMMARY.test(line)) {
      if (inAction) flushStreet(machine, streets);
      inAction = false;
      continue;
    }

    // ── Antes e blinds (aparecem antes do preflop) ──

    const ante = line.match(RE_ANTE);
    if (ante) {
      machine.actions.push({ player: ante[1].trim(), type: 'post-ante', amount: parseAmount(ante[2]) });
      continue;
    }

    const sbMatch = line.match(RE_SMALL_BLIND);
    if (sbMatch) {
      machine.actions.push({ player: sbMatch[1].trim(), type: 'post', amount: parseAmount(sbMatch[2]) });
      continue;
    }

    const bbMatch = line.match(RE_BIG_BLIND);
    if (bbMatch) {
      machine.actions.push({ player: bbMatch[1].trim(), type: 'post', amount: parseAmount(bbMatch[2]) });
      continue;
    }

    // Só processa ações após o início do preflop
    if (!inAction) continue;

    // ── Linhas ignoradas durante a ação ──

    // "Player is all-In." — valor já capturado na ação anterior (raise/call/bet)
    if (RE_ALL_IN.test(line)) continue;

    // "Creating Main Pot with ..." — informação interna, ignorar
    if (RE_CREATING_POT.test(line)) continue;

    // ── Ação padrão (fold, check, call, bet, raise) ──

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  return streets;
}

/**
 * Extrai os vencedores da seção ** Summary **.
 * Formato: "Player5 balance 7770469, bet 903305, collected 2001610, net +1098305"
 */
function parseWinners(lines: string[]): ParsedHand['winners'] {
  const winners: ParsedHand['winners'] = [];
  let inSummary = false;

  for (const line of lines) {
    if (RE_SUMMARY.test(line)) {
      inSummary = true;
      continue;
    }
    if (!inSummary) continue;

    const match = line.match(RE_WINNER_LINE);
    if (match) addWinner(winners, match[1].trim(), parseAmount(match[2]));
  }

  return winners;
}

// ─── Função principal ───────────────────────────────────────────────────────

/**
 * Faz o parse completo de uma mão no formato PartyPoker.
 *
 * Fluxo:
 * 1. Extrai metadados do header (ID, stakes, data, tipo de mesa)
 * 2. Identifica jogadores e suas posições
 * 3. Extrai hole cards (dealt + showdown)
 * 4. Percorre as linhas construindo as streets com ações
 * 5. Extrai vencedores da seção summary
 *
 * Retorna um ParsedHand normalizado compatível com o replay engine.
 */
export function parsePartyPoker(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  const id = parseHandId(text);
  const stakes = parseStakes(lines);
  const isTournament = RE_TOURNAMENT.test(text);
  const date = parseDate(lines);
  const dealerSeat = parseDealerSeat(lines);
  const players = parsePlayers(lines);
  const { holeCards, heroName } = parseHoleCards(lines);
  const streets = parseStreets(lines);
  const winners = parseWinners(lines);

  return {
    id,
    format: 'partypoker',
    date,
    stakes,
    tableType: isTournament ? 'tournament' : 'cash',
    players,
    dealerSeat,
    heroName,
    holeCards,
    streets,
    winners,
  };
}
