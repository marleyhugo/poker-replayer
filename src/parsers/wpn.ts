import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCard, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractNewCard, addWinner,
} from './utils';

function parseLine(line: string): RawAction | null {
  if (/\bfolds\b/i.test(line))  { const m = line.match(/^(.+?)\s+folds/i);  return m ? { player: m[1], type: 'fold'  } : null; }
  if (/\bchecks\b/i.test(line)) { const m = line.match(/^(.+?)\s+checks/i); return m ? { player: m[1], type: 'check' } : null; }
  const call  = line.match(/^(.+?)\s+calls \$?([\d,.]+)/i);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+?)\s+bets \$?([\d,.]+)/i);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount(bet[2]) };
  const raise = line.match(/^(.+?)\s+raises to \$?([\d,.]+)/i);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount(raise[2]) };
  const allin = line.match(/^(.+?)\s+goes all[\s-]in(?: for)? \$?([\d,.]+)/i);
  if (allin) return { player: allin[1], type: 'allin', amount: parseAmount(allin[2]) };
  return null;
}

export function parseWPN(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const header = lines.find(l => /^Game #\d+ -/.test(l)) ?? '';
  const id = header.match(/Game #(\d+)/)?.[1] ?? '0';
  const sm = header.match(/\(\$?([\d.]+)\/\$?([\d.]+)\)/);
  const stakes = sm ? { sb: parseFloat(sm[1]), bb: parseFloat(sm[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament|Sit.n.Go/i.test(text);
  const dateStr = header.match(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
  const date = dateStr ? new Date(dateStr.replace(/\//g, '-')) : new Date();

  const dealerLine = lines.find(l => /is the button/i.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (\d+)/)?.[1] ?? '1');

  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    const m = line.match(/^Seat (\d+):\s+(.+?)\s+\$?([\d,.]+)$/);
    if (m && !/is the button/i.test(line)) {
      players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount(m[3]) });
    }
  }

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    const m = line.match(/^(.+?):\s+\[(.+?)\]$/);
    if (m) {
      const pair = parseTwoCards(m[2]);
      if (pair) { holeCards[m[1]] = pair; heroName = heroName ?? m[1]; }
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
    if (/^-{3,} Dealing|^\*\*\* HOLE CARDS \*\*\*|^Pre-flop/i.test(line)) {
      inAction = true; machine.started = true; continue;
    }
    if (/^Flop|^\*\*\* FLOP/i.test(line)) {
      const board = line.match(/\[(.+?)\]/);
      transitionStreet(machine, streets, 'flop', board ? parseCards(board[1]) : []);
      continue;
    }
    if (/^Turn|^\*\*\* TURN/i.test(line)) {
      const single = line.match(/Turn card:\s*\[(.+?)\]/i);
      const card = single ? parseCard(single[1]) : extractNewCard(line);
      transitionStreet(machine, streets, 'turn', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/^River|^\*\*\* RIVER/i.test(line)) {
      const single = line.match(/River card:\s*\[(.+?)\]/i);
      const card = single ? parseCard(single[1]) : extractNewCard(line);
      transitionStreet(machine, streets, 'river', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/^Show ?[Dd]own|^SHOWDOWN/i.test(line)) {
      flushStreet(machine, streets);
      streets.push({ street: 'showdown', board: machine.board, actions: [] });
      inAction = false;
      continue;
    }
    if (/^-{3,} Summary|^Summary|^SUMMARY/i.test(line)) {
      if (inAction) flushStreet(machine, streets);
      break;
    }

    if (!inAction) continue;

    const sb = line.match(/^(.+?)\s+posts small blind \$?([\d,.]+)/i);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bb = line.match(/^(.+?)\s+posts big blind \$?([\d,.]+)/i);
    if (bb) { machine.actions.push({ player: bb[1], type: 'post', amount: parseAmount(bb[2]) }); continue; }

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  const winners: ParsedHand['winners'] = [];
  for (const line of lines) {
    const wins = line.match(/^(.+?)\s+wins \$?([\d,.]+)/i);
    if (wins) { addWinner(winners, wins[1], parseAmount(wins[2])); continue; }
    const col = line.match(/^(.+?)\s+collected \$?([\d,.]+)/i);
    if (col) addWinner(winners, col[1], parseAmount(col[2]));
  }

  return { id, format: 'wpn', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}
