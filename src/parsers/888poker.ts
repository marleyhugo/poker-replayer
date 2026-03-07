import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCard, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractLastBracket, addWinner,
} from './utils';

// ─── Formato legado (888poker/Pacific Poker cash game) ────────────────────────

/** Extracts the single new card from a turn/river line (last bracketed token). */
function extractNewCard(line: string): string | undefined {
  const cards = extractLastBracket(line);
  return cards.length === 1 ? cards[0] : parseCard(line.match(/\[([^\]]+)\]$/)?.[1] ?? '');
}

/**
 * Converte uma linha de ação do 888poker (legado) em RawAction.
 * O formato legado capitaliza todos os verbos: Folds, Checks, Bets, Calls, Raises, All-In.
 */
function parseLine(line: string): RawAction | null {
  if (/\bFolds\b/.test(line))  { const m = line.match(/^(.+?)\s+Folds/);  return m ? { player: m[1], type: 'fold'  } : null; }
  if (/\bChecks\b/.test(line)) { const m = line.match(/^(.+?)\s+Checks/); return m ? { player: m[1], type: 'check' } : null; }
  const call  = line.match(/^(.+?)\s+Calls \$?([\d,.]+)/);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+?)\s+Bets \$?([\d,.]+)/);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount(bet[2]) };
  const raise = line.match(/^(.+?)\s+Raises \$?[\d,.]+ to \$?([\d,.]+)/);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount(raise[2]) };
  const allin = line.match(/^(.+?)\s+All-In[^$]* \$?([\d,.]+)/);
  if (allin) return { player: allin[1], type: 'allin', amount: parseAmount(allin[2]) };
  return null;
}

function parse888PokerLegacy(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  const id = lines[0].match(/Game (\d+)/)?.[1] ?? '0';
  const stakesMatch = lines[1]?.match(/\$?([\d.]+)\/\$?([\d.]+)/);
  const stakes = stakesMatch ? { sb: parseFloat(stakesMatch[1]), bb: parseFloat(stakesMatch[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament/i.test(text);

  const dm = text.match(/\*\*\* (\d{2}) (\d{2}) (\d{4}) (\d{2}:\d{2}:\d{2})/);
  const date = dm ? new Date(`${dm[3]}-${dm[2]}-${dm[1]}T${dm[4]}`) : new Date();

  const dealerLine = lines.find(l => /[Dd]ealer/.test(l) && /[Ss]eat/.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (\d+)/)?.[1] ?? '1');

  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    const m = line.match(/^Seat (\d+)\s*[-:]\s*(.+?)\s*\(\$?([\d,.]+)\)/);
    if (m) players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount(m[3]) });
  }

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    const recv = line.match(/^(.+?)\s+received cards \[(.+?)\]/);
    if (recv) {
      heroName = recv[1];
      const pair = parseTwoCards(recv[2]);
      if (pair) holeCards[recv[1]] = pair;
    }
    const show = line.match(/^(.+?)\s+shows \[(.+?)\]/i);
    if (show) {
      const pair = parseTwoCards(show[2]);
      if (pair) holeCards[show[1]] = pair;
    }
  }

  const streets: ParsedHand['streets'] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    if (/^\*\*\* BLIND|^-- Dealing down|^\*\* Dealing down/.test(line)) {
      inAction = true; machine.started = true; continue;
    }
    if (/^\*\*\* FLOP|^-- Dealing flop/i.test(line)) {
      transitionStreet(machine, streets, 'flop', extractLastBracket(line));
      continue;
    }
    if (/^\*\*\* TURN|^-- Dealing turn/i.test(line)) {
      const newCard = extractNewCard(line);
      transitionStreet(machine, streets, 'turn', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    if (/^\*\*\* RIVER|^-- Dealing river/i.test(line)) {
      const newCard = extractNewCard(line);
      transitionStreet(machine, streets, 'river', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    if (/^\*\*\* (?:SHOW ?DOWN|SHOWDOWN)/.test(line)) {
      flushStreet(machine, streets);
      streets.push({ street: 'showdown', board: machine.board, actions: [] });
      inAction = false;
      continue;
    }
    if (/^\*\*\* SUMMARY/.test(line)) {
      if (inAction) flushStreet(machine, streets);
      break;
    }
    if (!inAction) continue;

    const sb = line.match(/^(.+?)\s+posts small blind \[\$?([\d,.]+)\]/i);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bbl = line.match(/^(.+?)\s+posts big blind \[\$?([\d,.]+)\]/i);
    if (bbl) { machine.actions.push({ player: bbl[1], type: 'post', amount: parseAmount(bbl[2]) }); continue; }

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  const winners: ParsedHand['winners'] = [];
  let inSummary = false;
  for (const line of lines) {
    if (/^\*\*\* SUMMARY/.test(line)) { inSummary = true; continue; }
    if (!inSummary) continue;
    const col = line.match(/^(.+?)\s+collected \$?([\d,.]+)/i);
    if (col) { addWinner(winners, col[1], parseAmount(col[2])); continue; }
    const wins = line.match(/^(.+?)\s+wins \$?([\d,.]+)/i);
    if (wins) addWinner(winners, wins[1], parseAmount(wins[2]));
  }

  return { id, format: '888poker', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}

// ─── Novo formato (888poker tournament PKO/MTT) ───────────────────────────────

/**
 * Converte valor numérico com ponto como separador de milhar (formato europeu).
 * Ex: "20.000" → 20000, "2.939" → 2939, "720" → 720.
 */
function parseAmount888New(s: string): number {
  const clean = s.replace(/[\[\] ]/g, '');
  if (/^\d+\.\d{3}$/.test(clean)) return parseInt(clean.replace('.', ''), 10);
  return parseFloat(clean) || 0;
}

/**
 * Normaliza carta no formato 888poker.
 * Suporta:
 *   - Notação padrão (inglês): h=hearts, d=diamonds, c=clubs, s=spades
 *   - Notação pt-BR: e=espadas(s), o=ouros(d), p=paus(c)
 *   - Rank '10' → 'T'
 *
 * Nota: 'c' é ambíguo (clubs em inglês, copas em pt-BR).
 * Apenas aplica mapeamento pt-BR quando detecta suits exclusivamente pt-BR (e, o, p).
 */
function normalize888Card(card: string, usePtBR: boolean): string {
  let c = card.trim();
  if (c.length < 2) return c;
  c = c.replace('10', 'T');
  if (usePtBR) {
    c = c.replace(/^D(?=[echops])/i, 'T');
    const suit = c[c.length - 1];
    const suitMap: Record<string, string> = { e: 's', c: 'h', o: 'd', p: 'c' };
    if (suitMap[suit]) c = c.slice(0, -1) + suitMap[suit];
  }
  return c;
}

/** Detecta se as cartas no HH usam notação pt-BR (presença de suits e, o, p). */
function detectPtBRNotation(text: string): boolean {
  const cardMatches = [...text.matchAll(/\[\s*([^\]]+)\s*\]/g)];
  for (const [, content] of cardMatches) {
    const cards = content.split(/[,\s]+/).filter(c => c.length >= 2);
    for (const card of cards) {
      const suit = card[card.length - 1];
      if (suit === 'e' || suit === 'o' || suit === 'p') return true;
    }
  }
  return false;
}

/** Extrai cartas separadas por vírgula e/ou espaço com normalização condicional. */
function parseCards888New(s: string, usePtBR: boolean): string[] {
  return s.split(/[,\s]+/).map(c => normalize888Card(c, usePtBR)).filter(c => c.length >= 2);
}

/** Converte linha de ação do novo formato 888poker em RawAction (verbos lowercase, valores em colchetes). */
function parseLineNew(line: string): RawAction | null {
  if (/^(.+?) folds$/.test(line))  return { player: line.replace(/ folds$/, ''), type: 'fold' };
  if (/^(.+?) checks$/.test(line)) return { player: line.replace(/ checks$/, ''), type: 'check' };
  const call  = line.match(/^(.+?) calls \[([\d.]+)\]/);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount888New(call[2]) };
  const bet   = line.match(/^(.+?) bets \[([\d.]+)\]/);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount888New(bet[2]) };
  const raise = line.match(/^(.+?) raises \[([\d.]+)\]/);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount888New(raise[2]) };
  return null;
}

function parse888PokerNew(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());
  const usePtBR = detectPtBRNotation(text);

  // ID: "#Game No : 738293395"
  const id = lines[0].match(/#Game No\s*:\s*(\d+)/)?.[1] ?? '0';

  // Stakes e data: "40/80 Blinds..." ou "800/1.600 Blinds..." (ponto como milhar)
  const stakesLine = lines.find(l => /Blinds/.test(l)) ?? '';
  const stakesMatch = stakesLine.match(/^([\d.]+)\/([\d.]+) Blinds/);
  const stakes = stakesMatch
    ? { sb: parseAmount888New(stakesMatch[1]), bb: parseAmount888New(stakesMatch[2]) }
    : { sb: 0, bb: 0 };

  const dm = stakesLine.match(/\*\*\* (\d{2}) (\d{2}) (\d{4}) (\d{2}:\d{2}:\d{2})/);
  const date = dm ? new Date(`${dm[3]}-${dm[2]}-${dm[1]}T${dm[4]}`) : new Date();

  const isTournament = /Tournament/i.test(text);

  // Dealer: "Seat 3 is the button"
  const dealerLine = lines.find(l => /is the button/.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (\d+)/)?.[1] ?? '1');

  // Players: "Seat 1: jboyepederse ( 20.000 )"
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    const m = line.match(/^Seat (\d+): (.+?) \( ([\d.]+) \)/);
    if (m) players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount888New(m[3]) });
  }

  // Hole cards e showdowns
  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    // "Dealt to Chaminhas [ 7h, 5s ]"
    const dealt = line.match(/^Dealt to (.+?) \[ (.+?) \]/);
    if (dealt) {
      heroName = dealt[1];
      const cards = parseCards888New(dealt[2], usePtBR);
      if (cards.length >= 2) holeCards[dealt[1]] = [cards[0], cards[1]];
      continue;
    }
    // "Player shows [ Ah, 7c ]" ou "Player mucks [ Ad, Qh ]"
    const show = line.match(/^(.+?) (?:shows|mucks) \[ (.+?) \]/);
    if (show) {
      const cards = parseCards888New(show[2], usePtBR);
      if (cards.length >= 2) holeCards[show[1]] = [cards[0], cards[1]];
    }
  }

  const streets: ParsedHand['streets'] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    // Início do preflop
    if (line === '** Dealing down cards **') {
      inAction = true; machine.started = true; continue;
    }
    // "** First runout **" — marcador de início do board (all-in ou normal), ignorar
    if (line === '** First runout **') continue;

    // Flop: "** Dealing flop ** [ Kh, Qs, 5h ]"
    if (line.startsWith('** Dealing flop **')) {
      const m = line.match(/\[ (.+?) \]/);
      const board = m ? parseCards888New(m[1], usePtBR) : [];
      transitionStreet(machine, streets, 'flop', board);
      continue;
    }
    // Turn: "** Dealing turn ** [ Jd ]"
    if (line.startsWith('** Dealing turn **')) {
      const m = line.match(/\[ (.+?) \]/);
      const newCard = m ? parseCards888New(m[1], usePtBR)[0] : undefined;
      transitionStreet(machine, streets, 'turn', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    // River: "** Dealing river ** [ 3h ]"
    if (line.startsWith('** Dealing river **')) {
      const m = line.match(/\[ (.+?) \]/);
      const newCard = m ? parseCards888New(m[1], usePtBR)[0] : undefined;
      transitionStreet(machine, streets, 'river', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    // Summary
    if (line === '** Summary **') {
      if (inAction) flushStreet(machine, streets);
      inAction = false;
      continue;
    }

    // Antes e blinds podem aparecer ANTES de ** Dealing down cards ** — capturar antes do guard
    const ante = line.match(/^(.+?) posts ante \[([\d.]+)\]/);
    if (ante) { machine.actions.push({ player: ante[1], type: 'post-ante', amount: parseAmount888New(ante[2]) }); continue; }
    const sb = line.match(/^(.+?) posts small blind \[([\d.]+)\]/);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount888New(sb[2]) }); continue; }
    const bb = line.match(/^(.+?) posts big blind \[([\d.]+)\]/);
    if (bb) { machine.actions.push({ player: bb[1], type: 'post', amount: parseAmount888New(bb[2]) }); continue; }

    if (!inAction) continue;

    const action = parseLineNew(line);
    if (action) machine.actions.push(action);
  }

  // Winners: "First runout Player collected [ 720 ]" ou "Player collected [ 1.100 ]"
  const winners: ParsedHand['winners'] = [];
  let inSummary = false;
  for (const line of lines) {
    if (line === '** Summary **') { inSummary = true; continue; }
    if (!inSummary) continue;
    // Com prefixo "First runout" (PKO/bounty)
    const col1 = line.match(/^First runout (.+?) collected \[ ([\d.]+) \]/);
    if (col1) { addWinner(winners, col1[1], parseAmount888New(col1[2])); continue; }
    // Sem prefixo (regular)
    const col2 = line.match(/^(.+?) collected \[ ([\d.]+) \]/);
    if (col2) addWinner(winners, col2[1], parseAmount888New(col2[2]));
  }

  return { id, format: '888poker', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}

// ─── Entrypoint público ───────────────────────────────────────────────────────

/** Detecta o sub-formato e despacha para o parser correto. */
export function parse888Poker(text: string): ParsedHand {
  if (text.includes('#Game No')) return parse888PokerNew(text);
  return parse888PokerLegacy(text);
}
