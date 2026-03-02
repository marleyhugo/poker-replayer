import type { ParsedHand, RawAction, ActionType } from '../types/poker';
import { addWinner } from './utils';

// ─── Mapeamento de action types do iPoker ────────────────────────────────────
// 0=fold, 1=SB, 2=BB, 3=call, 4=check, 5=bet, 7=allin, 15=ante, 23=raise

const ACTION_MAP: Record<string, ActionType | 'sb' | 'bb'> = {
  '0': 'fold',
  '1': 'post',      // small blind
  '2': 'post',      // big blind
  '3': 'call',
  '4': 'check',
  '5': 'bet',
  '7': 'allin',
  '15': 'post-ante',
  '23': 'raise',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte carta iPoker (ex: "H8" → "8h", "DK" → "Kd", "D10" → "Td", "HA" → "Ah") */
function parseIPokerCard(s: string): string {
  const t = s.trim();
  if (t === 'X') return '??';
  const suitMap: Record<string, string> = { H: 'h', D: 'd', C: 'c', S: 's' };
  const suit = suitMap[t[0]];
  if (!suit) return '??';
  let rank = t.slice(1);
  if (rank === '10') rank = 'T';
  return rank + suit;
}

/** Converte string de chips iPoker (ex: "10,000" → 10000). */
function parseChips(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

// ─── Parsing XML simples (sem dependência de DOMParser pesada) ───────────────

function getAttr(tag: string, attr: string): string {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function getTagContent(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

// ─── Parser principal ────────────────────────────────────────────────────────

/** Faz o parse de uma única <game> do iPoker XML e retorna ParsedHand. */
function parseGame(gameXml: string, heroNick: string): ParsedHand {
  const id = getAttr(gameXml.match(/<game[^>]*>/)?.[0] ?? '', 'gamecode');

  const general = getTagContent(gameXml, 'general');
  const sbVal = parseChips(getTagContent(general, 'smallblind'));
  const bbVal = parseChips(getTagContent(general, 'bigblind'));
  const dateStr = getTagContent(general, 'startdate');
  const date = dateStr ? new Date(dateStr) : new Date();

  // Players
  const players: ParsedHand['players'] = [];
  let dealerSeat = 1;
  const playerTags = [...general.matchAll(/<player\s[^/]*\/>/g)];
  for (const [tag] of playerTags) {
    const seat = parseInt(getAttr(tag, 'seat'));
    const name = getAttr(tag, 'name');
    const chips = parseChips(getAttr(tag, 'chips'));
    const isDealer = getAttr(tag, 'dealer') === '1';
    if (isDealer) dealerSeat = seat;
    players.push({ seat, name, stack: chips });
  }

  // Rounds
  const rounds = [...gameXml.matchAll(/<round no="(\d+)">([\s\S]*?)<\/round>/g)];

  const holeCards: ParsedHand['holeCards'] = {};
  let heroName: string | undefined;
  const streets: ParsedHand['streets'] = [];
  const winMap = new Map<string, number>();

  // Extrair wins dos player tags
  for (const [tag] of playerTags) {
    const win = parseChips(getAttr(tag, 'win'));
    if (win > 0) {
      const name = getAttr(tag, 'name');
      winMap.set(name, (winMap.get(name) ?? 0) + win);
    }
  }

  const streetNames = ['preflop', 'preflop', 'flop', 'turn', 'river'] as const;
  let board: string[] = [];

  for (const [, roundNo, roundContent] of rounds) {
    const rn = parseInt(roundNo);
    const streetName = rn < streetNames.length ? streetNames[rn] : 'river';
    const actions: RawAction[] = [];

    // Cartas comunitárias
    const communityCards = roundContent.match(/<cards type="(Flop|Turn|River)">(.*?)<\/cards>/i);
    if (communityCards) {
      const newCards = communityCards[2].trim().split(/\s+/).map(parseIPokerCard).filter(c => c !== '??');
      board = [...board, ...newCards];
    }

    // Cartas do jogador (Pocket)
    const pocketCards = [...roundContent.matchAll(/<cards player="([^"]*)" type="Pocket">(.*?)<\/cards>/g)];
    for (const [, player, cards] of pocketCards) {
      const parsed = cards.trim().split(/\s+/).map(parseIPokerCard);
      if (parsed.length >= 2 && parsed[0] !== '??' && parsed[1] !== '??') {
        holeCards[player] = [parsed[0], parsed[1]];
      }
      if (player === heroNick) heroName = player;
    }

    // Ações
    const actionTags = [...roundContent.matchAll(/<action\s[^/]*\/>/g)];
    for (const [tag] of actionTags) {
      const player = getAttr(tag, 'player');
      const type = getAttr(tag, 'type');
      const sum = parseChips(getAttr(tag, 'sum'));
      const mapped = ACTION_MAP[type];
      if (!mapped) continue;
      actions.push({ player, type: mapped, amount: sum || undefined });
    }

    // Round 0 = antes + blinds (parte do preflop), round 1 = preflop actions
    if (rn === 0) {
      // Será mesclado com round 1
      streets.push({ street: 'preflop', board: [], actions });
    } else if (rn === 1) {
      // Mescla com round 0 (preflop)
      if (streets.length > 0 && streets[0].street === 'preflop') {
        streets[0].actions.push(...actions);
      } else {
        streets.push({ street: 'preflop', board: [], actions });
      }
    } else {
      streets.push({ street: streetName, board: [...board], actions });
    }
  }

  const winners: ParsedHand['winners'] = [];
  for (const [player, amount] of winMap) {
    addWinner(winners, player, amount);
  }

  return {
    id,
    format: 'ipoker',
    date,
    stakes: { sb: sbVal, bb: bbVal },
    tableType: 'tournament',
    players,
    dealerSeat,
    heroName,
    holeCards,
    streets,
    winners,
  };
}

/** Faz o parse de um arquivo iPoker XML completo (múltiplas <game>). */
export function parseIPoker(text: string): ParsedHand {
  // Extrair nickname do herói do <general> global
  const globalGeneral = text.match(/<root>\s*<general>([\s\S]*?)<\/general>/);
  const heroNick = globalGeneral ? getTagContent(globalGeneral[1], 'nickname') : '';

  // Pega a primeira <game>
  const gameMatch = text.match(/<game\s[^>]*>[\s\S]*?<\/game>/);
  if (!gameMatch) throw new Error('Nenhuma mão encontrada no arquivo iPoker.');
  return parseGame(gameMatch[0], heroNick);
}

/** Divide um arquivo iPoker XML em múltiplas mãos. */
export function splitIPokerGames(text: string): string[] {
  const heroNick = text.match(/<nickname>([^<]*)<\/nickname>/)?.[1] ?? '';
  const games = [...text.matchAll(/<game\s[^>]*>[\s\S]*?<\/game>/g)];
  // Inclui o heroNick como wrapper para cada game
  return games.map(g => `<root><general><nickname>${heroNick}</nickname></general>${g[0]}</root>`);
}
