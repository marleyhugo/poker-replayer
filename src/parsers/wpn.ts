import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCard, parseCards, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractNewCard, addWinner,
} from './utils';

/** Converte uma linha de ação do WPN em RawAction, ou null se não for uma ação. */
function parseLine(line: string): RawAction | null {
  if (/\bfolds\b/i.test(line))  { const m = line.match(/^(.+?)\s+folds/i);  return m ? { player: m[1], type: 'fold'  } : null; }
  if (/\bchecks\b/i.test(line)) { const m = line.match(/^(.+?)\s+checks/i); return m ? { player: m[1], type: 'check' } : null; }
  const call  = line.match(/^(.+?)\s+calls \$?([\d,.]+)/i);
  if (call)  return { player: call[1],  type: 'call',  amount: parseAmount(call[2]) };
  const bet   = line.match(/^(.+?)\s+bets \$?([\d,.]+)/i);
  if (bet)   return { player: bet[1],   type: 'bet',   amount: parseAmount(bet[2]) };
  // "raises X to Y" ou "raises to Y"
  const raise = line.match(/^(.+?)\s+raises (?:[\d,.]+ to )?\$?([\d,.]+)/i);
  if (raise) return { player: raise[1], type: 'raise', amount: parseAmount(raise[2]) };
  const allin = line.match(/^(.+?)\s+(?:goes all[\s-]in|is all-in)(?: (?:for )?\$?([\d,.]+))?/i);
  if (allin) return { player: allin[1], type: 'allin', amount: allin[2] ? parseAmount(allin[2]) : 0 };
  return null;
}

/** Faz o parse de uma mão no formato WPN (Winning Poker Network) e retorna um ParsedHand normalizado. */
export function parseWPN(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Header: "Game Hand #2473041660 - ..." ou "Game #123 - ..."
  const header = lines.find(l => /^Game (?:Hand )?#\d+/.test(l)) ?? '';
  const id = header.match(/Game (?:Hand )?#(\d+)/)?.[1] ?? '0';
  const stakesMatch = header.match(/\((?:\$)?([\d,.]+)\/(?:\$)?([\d,.]+)\)/);
  const stakes = stakesMatch ? { sb: parseAmount(stakesMatch[1]), bb: parseAmount(stakesMatch[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament|Tourney|Sit.n.Go/i.test(text);
  const dateStr = header.match(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
  const date = dateStr ? new Date(dateStr.replace(/\//g, '-')) : new Date();

  const dealerLine = lines.find(l => /is the button/i.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (?:#)?(\d+)/)?.[1] ?? '1');

  // Assentos — "Seat 1: Player (12345.00)" ou "Seat 1: Player $12345"
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    if (/is the button/i.test(line)) continue;
    // Formato com parênteses: "Seat 1: samuelgoes (50000.00)"
    const m1 = line.match(/^Seat (\d+):\s+(.+?)\s+\(([\d,.]+)\)$/);
    if (m1) {
      players.push({ seat: parseInt(m1[1]), name: m1[2].trim(), stack: parseAmount(m1[3]) });
      continue;
    }
    // Formato sem parênteses: "Seat 1: samuelgoes $50000" ou "Seat 1: samuelgoes 50000"
    const m2 = line.match(/^Seat (\d+):\s+(.+?)\s+\$?([\d,.]+)$/);
    if (m2) {
      players.push({ seat: parseInt(m2[1]), name: m2[2].trim(), stack: parseAmount(m2[3]) });
    }
  }

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    // "Dealt to samuelgoes [Td Jd]"
    const dealt = line.match(/^Dealt to (.+?) \[(.+?)\]/);
    if (dealt) {
      heroName = dealt[1];
      const pair = parseTwoCards(dealt[2]);
      if (pair) holeCards[dealt[1]] = pair;
      continue;
    }
    // WPN mostra as cartas do herói como "PlayerName: [Ah Kd]"
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
    if (/^Flop|^\*\*\* FLOP \*\*\*/i.test(line)) {
      const board = line.match(/\[(.+?)\]/);
      transitionStreet(machine, streets, 'flop', board ? parseCards(board[1]) : []);
      continue;
    }
    if (/^Turn|^\*\*\* TURN \*\*\*/i.test(line)) {
      const single = line.match(/Turn card:\s*\[(.+?)\]/i);
      const card = single ? parseCard(single[1]) : extractNewCard(line);
      transitionStreet(machine, streets, 'turn', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/^River|^\*\*\* RIVER \*\*\*/i.test(line)) {
      const single = line.match(/River card:\s*\[(.+?)\]/i);
      const card = single ? parseCard(single[1]) : extractNewCard(line);
      transitionStreet(machine, streets, 'river', card ? [...machine.board, card] : machine.board);
      continue;
    }
    if (/^\*\*\* SHOW ?DOWN \*\*\*|^Show ?[Dd]own|^SHOWDOWN/i.test(line)) {
      flushStreet(machine, streets);
      streets.push({ street: 'showdown', board: machine.board, actions: [] });
      inAction = false;
      continue;
    }
    if (/^\*\*\* SUMMARY \*\*\*|^-{3,} Summary|^Summary|^SUMMARY/i.test(line)) {
      if (inAction) flushStreet(machine, streets);
      break;
    }

    // Antes e blinds aparecem ANTES de *** HOLE CARDS *** no WPN — capturar antes do guard
    const ante = line.match(/^(.+?)\s+posts ante \$?([\d,.]+)/i);
    if (ante) { machine.actions.push({ player: ante[1], type: 'post-ante', amount: parseAmount(ante[2]) }); continue; }
    const sb = line.match(/^(.+?)\s+posts (?:the )?small blind \$?([\d,.]+)/i);
    if (sb) { machine.actions.push({ player: sb[1], type: 'post', amount: parseAmount(sb[2]) }); continue; }
    const bb = line.match(/^(.+?)\s+posts (?:the )?big blind \$?([\d,.]+)/i);
    if (bb) { machine.actions.push({ player: bb[1], type: 'post', amount: parseAmount(bb[2]) }); continue; }

    if (!inAction) continue;

    const action = parseLine(line);
    if (action) machine.actions.push(action);
  }

  // Winners — captura antes da SUMMARY para evitar duplicatas com linhas do summary
  const winners: ParsedHand['winners'] = [];
  for (const line of lines) {
    if (/^\*\*\* SUMMARY \*\*\*|^-{3,} Summary|^Summary|^SUMMARY/i.test(line)) break;
    const wins = line.match(/^(.+?)\s+wins \$?([\d,.]+)/i);
    if (wins) { addWinner(winners, wins[1], parseAmount(wins[2])); continue; }
    const col = line.match(/^(.+?)\s+collected \$?([\d,.]+)/i);
    if (col) { addWinner(winners, col[1], parseAmount(col[2])); continue; }
    // "samuelgoes did not show and won 26400.00"
    const won = line.match(/^(.+?)\s+did not show and won \$?([\d,.]+)/i);
    if (won) addWinner(winners, won[1], parseAmount(won[2]));
  }

  // Fallback: extrai da seção SUMMARY se nenhum winner encontrado acima
  if (winners.length === 0) {
    let inSummary = false;
    for (const line of lines) {
      if (/^\*\*\* SUMMARY \*\*\*|^-{3,} Summary|^Summary|^SUMMARY/i.test(line)) { inSummary = true; continue; }
      if (!inSummary) continue;
      const m = line.match(/^Seat \d+: (.+?) .*(?:collected|won) \$?([\d,.]+)/);
      if (m) addWinner(winners, m[1].trim(), parseAmount(m[2]));
    }
  }

  return { id, format: 'wpn', date, stakes, tableType: isTournament ? 'tournament' : 'cash', players, dealerSeat, heroName, holeCards, streets, winners };
}
