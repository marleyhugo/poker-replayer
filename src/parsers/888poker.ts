import type { ParsedHand, RawAction } from '../types/poker';
import {
  parseAmount, parseCard, parseTwoCards,
  newStreetMachine, transitionStreet, flushStreet,
  extractLastBracket, addWinner,
} from './utils';

/** Extracts the single new card from a turn/river line (last bracketed token). */
function extractNewCard(line: string): string | undefined {
  const cards = extractLastBracket(line);
  return cards.length === 1 ? cards[0] : parseCard(line.match(/\[([^\]]+)\]$/)?.[1] ?? '');
}

/**
 * Converte uma linha de ação do 888poker em RawAction, ou null se não for uma ação.
 * O 888poker capitaliza todos os verbos: Folds, Checks, Bets, Calls, Raises, All-In.
 */
function parseLine(line: string): RawAction | null {
  // 888 Poker capitaliza os verbos de ação: Folds, Checks, Bets, Calls, Raises, All-In
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

/** Faz o parse de uma mão no formato 888poker/Pacific Poker e retorna um ParsedHand normalizado. */
export function parse888Poker(text: string): ParsedHand {
  const lines = text.split('\n').map(l => l.trim());

  const id = lines[0].match(/Game (\d+)/)?.[1] ?? '0';
  // Stakes ficam na segunda linha (ex: "$0.01/$0.02 NL Hold'em")
  const stakesMatch = lines[1]?.match(/\$?([\d.]+)\/\$?([\d.]+)/);
  const stakes = stakesMatch ? { sb: parseFloat(stakesMatch[1]), bb: parseFloat(stakesMatch[2]) } : { sb: 0, bb: 0 };
  const isTournament = /Tournament/i.test(text);

  // Data no formato "*** DD MM YYYY HH:MM:SS" (dia/mês/ano, diferente dos outros formatos)
  const dm = text.match(/\*\*\* (\d{2}) (\d{2}) (\d{4}) (\d{2}:\d{2}:\d{2})/);
  const date = dm ? new Date(`${dm[3]}-${dm[2]}-${dm[1]}T${dm[4]}`) : new Date();

  // Dealer: pode aparecer como "Dealer: Seat X" ou "Seat X is the Dealer"
  const dealerLine = lines.find(l => /[Dd]ealer/.test(l) && /[Ss]eat/.test(l)) ?? '';
  const dealerSeat = parseInt(dealerLine.match(/Seat (\d+)/)?.[1] ?? '1');

  // Assentos no formato "Seat 1 - PlayerName ($2.50)" (usa hífen ou dois-pontos)
  const players: ParsedHand['players'] = [];
  for (const line of lines) {
    const m = line.match(/^Seat (\d+)\s*[-:]\s*(.+?)\s*\(\$?([\d,.]+)\)/);
    if (m) players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseAmount(m[3]) });
  }

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  for (const line of lines) {
    // "Player received cards [Ah Kd]"
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
    // Marcadores de início do preflop (varies por versão do software)
    if (/^\*\*\* BLIND|^-- Dealing down|^\*\* Dealing down/.test(line)) {
      inAction = true; machine.started = true; continue;
    }
    if (/^\*\*\* FLOP|^-- Dealing flop/i.test(line)) {
      const board = extractLastBracket(line);
      transitionStreet(machine, streets, 'flop', board);
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

    // 888poker usa colchetes para o valor dos blinds: "Player posts small blind [$0.01]"
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
