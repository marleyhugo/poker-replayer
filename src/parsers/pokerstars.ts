import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractNewCard, addWinner,
} from './utils';

/** Converte uma linha de ação do PokerStars em RawAction, ou null se não for uma ação. */
function parseLine(line: string): RawAction | null {
  if (/: folds/.test(line))  return { player: line.split(': folds')[0], type: 'fold' };
  if (/: checks/.test(line)) return { player: line.split(': checks')[0], type: 'check' };
  const call  = line.match(/^(.+): calls \$?([\d,.]+)/);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+): bets \$?([\d,.]+)/);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount(bet[2]) };
  const raise = line.match(/^(.+): raises \$?[\d,.]+ to \$?([\d,.]+)/);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount(raise[2]) };
  return null;
}

/** Faz o parse de uma mão no formato PokerStars e retorna um ParsedHand normalizado. */
export function parsePokerStars(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  const header = lines[0];
  const id = header.match(/Hand #(\d+)/)?.[1] ?? '0';
  const stakesMatch = header.match(/\(\$?([\d.]+)\/\$?([\d.]+)/);
  const stakes = stakesMatch ? { sb: parseFloat(stakesMatch[1]), bb: parseFloat(stakesMatch[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament/i.test(header);
  const dateStr = header.match(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
  const date = dateStr ? new Date(dateStr.replace(/\//g, '-')) : new Date();

  const tableLine = lines.find(l => /^Table ['"]/.test(l)) ?? '';
  const dealerSeat = parseInt(tableLine.match(/Seat #(\d+) is the button/)?.[1] ?? '1');

  // Assentos — usa padrão "in chips" para evitar falsos matches nas linhas de summary
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    if (line.startsWith('*** SUMMARY')) break;
    const m = line.match(/^Seat (\d+): ([^(]+?) \(\$?([\d,.]+) in chips(?:,\s*\$?([\d,.]+) bounty)?\)/);
    if (m) players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount(m[3]), bounty: m[4] ? parseAmount(m[4]) : undefined });
  }

  // Cartas na mão: herói (dealt to), revelações no showdown e mucks
  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    const dealt = line.match(/^Dealt to (.+?) \[(.+?)\]/);
    if (dealt) {
      heroName = dealt[1];
      const pair = parseTwoCards(dealt[2]);
      if (pair) holeCards[dealt[1]] = pair;
    }
    const show = line.match(/^(.+?): shows \[(.+?)\]/);
    if (show) {
      const pair = parseTwoCards(show[2]);
      if (pair) holeCards[show[1]] = pair;
    }
    const muck = line.match(/^(.+?): mucks hand$/);
    if (muck && !holeCards[muck[1]]) holeCards[muck[1]] = ['??', '??'];
  }

  // Streets — percorre as linhas fazendo transições com a máquina de estados
  const streets: ParsedHand['streets'] = [];
  const machine = newStreetMachine();
  let inAction = false;

  for (const line of lines) {
    if (line.startsWith('*** HOLE CARDS ***')) {
      inAction = true; machine.started = true; continue;
    }
    if (line.startsWith('*** FLOP ***')) {
      const board = line.match(/\[(.+?)\]/);
      transitionStreet(machine, streets, 'flop', board ? parseCards(board[1]) : []);
      continue;
    }
    if (line.startsWith('*** TURN ***')) {
      const card = extractNewCard(line);
      transitionStreet(machine, streets, 'turn', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (line.startsWith('*** RIVER ***')) {
      const card = extractNewCard(line);
      transitionStreet(machine, streets, 'river', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/^\*\*\* SHOW ?DOWN \*\*\*/.test(line)) {
      flushStreet(machine, streets);
      streets.push({ street: 'showdown', board: machine.board, actions: [] });
      inAction = false;
      continue;
    }
    if (line.startsWith('*** SUMMARY ***')) {
      if (inAction) flushStreet(machine, streets);
      break;
    }

    if (!inAction) continue;

    const sb = line.match(/^(.+): posts small blind \$?([\d,.]+)/);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bb = line.match(/^(.+): posts big blind \$?([\d,.]+)/);
    if (bb) { machine.actions.push({ player: bb[1], type: 'post', amount: parseAmount(bb[2]) }); continue; }
    const ante = line.match(/^(.+): posts the ante \$?([\d,.]+)/);
    if (ante) { machine.actions.push({ player: ante[1], type: 'post-ante', amount: parseAmount(ante[2]) }); continue; }

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  // Vencedores — passagem única pela seção SUMMARY, deduplicação via addWinner
  const winners: ParsedHand['winners'] = [];
  let inSummary = false;
  for (const line of lines) {
    if (line.startsWith('*** SUMMARY ***')) { inSummary = true; continue; }
    if (!inSummary) continue;
    // Ex: "PlayerX collected $1.00 from main pot"
    const col = line.match(/^(.+?) collected \$?([\d,.]+) from/);
    if (col) { addWinner(winners, col[1], parseAmount(col[2])); continue; }
    // Ex: "Seat N: Player collected ($X)" ou "showed [...] and won ($X)"
    const seat = line.match(/^Seat \d+: (.+?) (?:collected|showed .+ and won) \(\$?([\d,.]+)\)/);
    if (seat) addWinner(winners, seat[1].trim(), parseAmount(seat[2]));
  }

  return { id, format: 'pokerstars', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}
