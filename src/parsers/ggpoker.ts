import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractNewCard, addWinner,
} from './utils';

function parseLine(line: string): RawAction | null {
  // Case-insensitive: GGPoker sometimes capitalizes action keywords
  if (/: [Ff]olds/.test(line))  return { player: line.split(/: [Ff]olds/)[0], type: 'fold' };
  if (/: [Cc]hecks/.test(line)) return { player: line.split(/: [Cc]hecks/)[0], type: 'check' };
  const call  = line.match(/^(.+): [Cc]alls \$?([\d,.]+)/);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+): [Bb]ets \$?([\d,.]+)/);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount(bet[2]) };
  const raise = line.match(/^(.+): [Rr]aises \$?[\d,.]+ to \$?([\d,.]+)/);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount(raise[2]) };
  const allin = line.match(/^(.+): [Aa]ll-?[Ii]n (?:for )?\$?([\d,.]+)/);
  if (allin) return { player: allin[1], type: 'allin', amount: parseAmount(allin[2]) };
  return null;
}

export function parseGGPoker(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  const header = lines[0];
  const id = header.match(/Hand #(\w+)/)?.[1] ?? '0';
  const sm = header.match(/\(\$?([\d.]+)\/\$?([\d.]+)\)/);
  const stakes = sm ? { sb: parseFloat(sm[1]), bb: parseFloat(sm[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament/i.test(header);
  const dateStr = header.match(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
  const date = dateStr ? new Date(dateStr.replace(/\//g, '-')) : new Date();

  const tableLine = lines.find(l => /^Table ['"]/.test(l)) ?? '';
  const dealerSeat = parseInt(tableLine.match(/Seat #?(\d+) is the button/)?.[1] ?? '1');

  // Seats — single pattern handles both "in chips" and bare amount
  // Use "in chips" form exclusively to avoid false matches; fall back to bare form
  const seenSeats = new Set<number>();
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    if (line.startsWith('*** SUMMARY')) break;
    // Prefer "in chips" form
    const m1 = line.match(/^Seat (\d+): ([^(]+?) \(\$?([\d,.]+) in chips\)/);
    if (m1) {
      const seat = parseInt(m1[1]);
      if (!seenSeats.has(seat)) {
        seenSeats.add(seat);
        players.push({ seat, name: m1[2].trim(), stack: parseAmount(m1[3]) });
      }
      continue;
    }
    // Bare amount form: "Seat 1: PlayerName ($2.00)"
    const m2 = line.match(/^Seat (\d+): ([^(]+?) \(\$?([\d,.]+)\)$/);
    if (m2) {
      const seat = parseInt(m2[1]);
      if (!seenSeats.has(seat)) {
        seenSeats.add(seat);
        players.push({ seat, name: m2[2].trim(), stack: parseAmount(m2[3]) });
      }
    }
  }

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    const dealt = line.match(/^Dealt to (.+?) \[(.+?)\]/);
    if (dealt) {
      heroName = dealt[1];
      const pair = parseTwoCards(dealt[2]);
      if (pair) holeCards[dealt[1]] = pair;
    }
    const show = line.match(/^(.+?): [Ss]hows \[(.+?)\]/);
    if (show) {
      const pair = parseTwoCards(show[2]);
      if (pair) holeCards[show[1]] = pair;
    }
  }

  const streets: ParsedHand['streets'] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    if (/\*\*\* (?:HOLE CARDS|PRE-FLOP) \*\*\*/.test(line)) {
      inAction = true; machine.started = true; continue;
    }
    if (/\*\*\* FLOP \*\*\*/.test(line)) {
      const board = line.match(/\[(.+?)\]/);
      transitionStreet(machine, streets, 'flop', board ? parseCards(board[1]) : []);
      continue;
    }
    if (/\*\*\* TURN \*\*\*/.test(line)) {
      const card = extractNewCard(line);
      transitionStreet(machine, streets, 'turn', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/\*\*\* RIVER \*\*\*/.test(line)) {
      const card = extractNewCard(line);
      transitionStreet(machine, streets, 'river', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/\*\*\* (?:SHOW ?DOWN) \*\*\*/.test(line)) {
      flushStreet(machine, streets);
      streets.push({ street: 'showdown', board: machine.board, actions: [] });
      inAction = false;
      continue;
    }
    if (/\*\*\* SUMMARY \*\*\*/.test(line)) {
      if (inAction) flushStreet(machine, streets);
      break;
    }

    if (!inAction) continue;

    const sb = line.match(/^(.+): posts small blind \$?([\d,.]+)/i);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bb = line.match(/^(.+): posts big blind \$?([\d,.]+)/i);
    if (bb) { machine.actions.push({ player: bb[1], type: 'post', amount: parseAmount(bb[2]) }); continue; }

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  const winners: ParsedHand['winners'] = [];
  let inSummary = false;
  for (const line of lines) {
    if (/\*\*\* SUMMARY \*\*\*/.test(line)) { inSummary = true; continue; }
    if (!inSummary) continue;
    const col = line.match(/^(.+?) collected \$?([\d,.]+)/);
    if (col) addWinner(winners, col[1], parseAmount(col[2]));
  }

  return { id, format: 'ggpoker', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}
