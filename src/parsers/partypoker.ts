import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  addWinner,
} from './utils';

/**
 * Converte uma linha de ação do PartyPoker em RawAction.
 * Formatos:
 *   "Player folds"
 *   "Player checks"
 *   "Player calls (120000)" ou "Player calls 120000"
 *   "Player bets (360000)" ou "Player bets 360000"
 *   "Player raises X to Y"
 *   "Player is all-In."
 */
function parseLine(line: string): RawAction | null {
  if (/\bfolds\b/i.test(line))  { const m = line.match(/^(.+?)\s+folds/i);  return m ? { player: m[1].trim(), type: 'fold'  } : null; }
  if (/\bchecks\b/i.test(line)) { const m = line.match(/^(.+?)\s+checks/i); return m ? { player: m[1].trim(), type: 'check' } : null; }
  const call  = line.match(/^(.+?)\s+calls\s+\(?[\$]?([\d,.]+)\)?/i);
  if (call)  return { player: call[1].trim(),  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+?)\s+bets\s+\(?[\$]?([\d,.]+)\)?/i);
  if (bet)   return { player: bet[1].trim(),   type: 'bet',   amount: parseAmount(bet[2]) };
  // "Hero raises 828305 to 888305"
  const raise = line.match(/^(.+?)\s+raises\s+[\d,.]+ to \$?([\d,.]+)/i);
  if (raise) return { player: raise[1].trim(), type: 'raise', amount: parseAmount(raise[2]) };
  return null;
}

/** Faz o parse de uma mão no formato PartyPoker e retorna um ParsedHand normalizado. */
export function parsePartyPoker(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  // ID: "Hand History For Game 17579728157270a89blj9qtwg"
  const idMatch = text.match(/Hand History For Game (\S+)/);
  const id = idMatch ? idMatch[1] : '0';

  // Stakes: "60000/120000 Tourney Texas Holdem Game Table (NL)"
  const stakesLine = lines.find(l => /^\d+\/\d+.*(?:Tourney|Texas|Holdem)/i.test(l)) ?? '';
  const stakesMatch = stakesLine.match(/^(\d+)\/(\d+)/);
  const stakes = stakesMatch
    ? { sb: parseInt(stakesMatch[1], 10), bb: parseInt(stakesMatch[2], 10) }
    : { sb: 0, bb: 0 };

  const isTournament = /Tournament|Tourney|MTT|Sit.n.Go/i.test(text);

  // Data: "Mon Sep 15 17:46:17 EDT 2025"
  const dateLine = lines.find(l => /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(l)) ?? '';
  const dateMatch = dateLine.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\w+)\s+(\d+)\s+([\d:]+)\s+\w+\s+(\d{4})/);
  let date = new Date();
  if (dateMatch) {
    const months: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const mon = months[dateMatch[1]] ?? '01';
    date = new Date(`${dateMatch[4]}-${mon}-${dateMatch[2].padStart(2,'0')}T${dateMatch[3]}`);
  }

  // Dealer: "Seat 5 is the button"
  const dealerLine = lines.find(l => /is the button/i.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (?:#)?(\d+)/)?.[1] ?? '1');

  // Players: "Seat 1: Player1 (3891102)"
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    if (/is the button/i.test(line)) continue;
    const m = line.match(/^Seat (\d+):\s+(.+?)\s+\(([\d,.]+)\)\s*$/);
    if (m) players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount(m[3]) });
  }

  // Hole cards
  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    // "Dealt to Hero [ Qh, Ah ]"
    const dealt = line.match(/^Dealt to (.+?) \[\s*(.+?)\s*\]/);
    if (dealt) {
      heroName = dealt[1];
      const cards = dealt[2].split(/[,\s]+/).filter(Boolean);
      const pair = parseTwoCards(cards.join(' '));
      if (pair) holeCards[dealt[1]] = pair;
      continue;
    }
  }

  // Showdown cards from summary: "Player5 balance ..., collected ...[ 8d, 8h ] [ description ]"
  for (const line of lines) {
    const showMatch = line.match(/^(.+?)\s+balance\s+[\d,]+,.*\[\s*([A-Za-z0-9]+)\s*,\s*([A-Za-z0-9]+)\s*\]/);
    if (showMatch) {
      const name = showMatch[1].trim();
      const pair = parseTwoCards(`${showMatch[2]} ${showMatch[3]}`);
      if (pair && !holeCards[name]) holeCards[name] = pair;
    }
  }

  // Streets
  const streets: ParsedHand['streets'] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    // "** Dealing down cards **"
    if (/^\*\* Dealing down cards \*\*/i.test(line)) {
      inAction = true; machine.started = true; continue;
    }
    // "** Dealing Flop ** :  [ 7s, Ks, 8s ]" ou "** Dealing Flop ** [ 7s, Ks, 8s ]"
    if (/^\*\* Dealing Flop \*\*/i.test(line)) {
      const m = line.match(/\[\s*(.+?)\s*\]/);
      const board = m ? parseCards(m[1].replace(/,/g, ' ')) : [];
      transitionStreet(machine, streets, 'flop', board);
      continue;
    }
    if (/^\*\* Dealing Turn \*\*/i.test(line)) {
      const m = line.match(/\[\s*(.+?)\s*\]/);
      const newCard = m ? parseCards(m[1].replace(/,/g, ' '))[0] : undefined;
      transitionStreet(machine, streets, 'turn', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    if (/^\*\* Dealing River \*\*/i.test(line)) {
      const m = line.match(/\[\s*(.+?)\s*\]/);
      const newCard = m ? parseCards(m[1].replace(/,/g, ' '))[0] : undefined;
      transitionStreet(machine, streets, 'river', newCard ? [...machine.board, newCard] : machine.board);
      continue;
    }
    if (/^\*\* Summary \*\*/i.test(line)) {
      if (inAction) flushStreet(machine, streets);
      inAction = false;
      continue;
    }

    // Antes e blinds aparecem ANTES de ** Dealing down cards ** no PartyPoker — capturar antes do guard
    const ante = line.match(/^(.+?)\s+posts ante\s+\(?([\d,.]+)\)?/i);
    if (ante) { machine.actions.push({ player: ante[1].trim(), type: 'post-ante', amount: parseAmount(ante[2]) }); continue; }
    const sb = line.match(/^(.+?)\s+posts small blind\s+\(?([\d,.]+)\)?/i);
    if (sb) { machine.actions.push({ player: sb[1].trim(), type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bb = line.match(/^(.+?)\s+posts big blind\s+\(?([\d,.]+)\)?/i);
    if (bb) { machine.actions.push({ player: bb[1].trim(), type: 'post', amount: parseAmount(bb[2]) }); continue; }

    if (!inAction) continue;

    // "Player is all-In." — capturar antes de testar parseLine
    if (/is all-in/i.test(line)) {
      // Valor já foi capturado na ação anterior (raise/call), pular duplicata
      continue;
    }

    // "Creating Main Pot with ..." — ignorar
    if (/^Creating /i.test(line)) continue;

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  // Winners from summary: "Player5 balance 7770469, bet 903305, collected 2001610, net +1098305"
  const winners: ParsedHand['winners'] = [];
  let inSummary = false;
  for (const line of lines) {
    if (/^\*\* Summary \*\*/i.test(line)) { inSummary = true; continue; }
    if (!inSummary) continue;
    const col = line.match(/^(.+?)\s+balance\s+[\d,]+,\s*bet\s+[\d,]+,\s*collected\s+([\d,]+)/);
    if (col) addWinner(winners, col[1].trim(), parseAmount(col[2]));
  }

  return { id, format: 'partypoker', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}
