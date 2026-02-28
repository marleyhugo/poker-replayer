import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../types/poker';
import { Board } from '../Board';
import { ChipAnimation } from '../ChipAnimation';
import { PlayerSeat } from '../PlayerSeat';
import { formatChips } from '../../utils/format';
import styles from './PokerTable.module.css';
import logoSrc from '../../assets/logo.png';

const SEAT_POSITIONS = [
  { left: 50, top: 88 },  // seat0
  { left: 22, top: 82 },  // seat1
  { left:  6, top: 60 },  // seat2
  { left: 10, top: 30 },  // seat3
  { left: 30, top: 12 },  // seat4
  { left: 50, top:  8 },  // seat5
  { left: 70, top: 12 },  // seat6
  { left: 90, top: 30 },  // seat7
  { left: 94, top: 60 },  // seat8
  { left: 78, top: 82 },  // seat9
];

// Intermediate positions between each seat and center (45% from center toward seat)
const BET_POSITIONS = SEAT_POSITIONS.map(sp => ({
  left: 50 + 0.45 * (sp.left - 50),
  top:  50 + 0.45 * (sp.top  - 50),
}));

const CENTER = { left: 50, top: 50 };

interface ChipEvent {
  id: string;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  amount: number;
}

interface PokerTableProps {
  state: GameState;
  heroName?: string;
  showBBUnits: boolean;
  bigBlind: number;
}

export function PokerTable({ state, heroName, showBBUnits, bigBlind }: PokerTableProps) {
  // Sort by seat, then rotate so the hero is always at index 0 (bottom center).
  const sortedPlayers = useMemo(() => {
    const sorted = [...state.players].sort((a, b) => a.seat - b.seat);
    if (!heroName) return sorted;
    const heroIdx = sorted.findIndex(p => p.name === heroName);
    if (heroIdx <= 0) return sorted;
    return [...sorted.slice(heroIdx), ...sorted.slice(0, heroIdx)];
  }, [state.players, heroName]);

  // Map seat number → visual position index (0-based, sorted order)
  const positionMap = useMemo(() => {
    const map = new Map<number, number>();
    sortedPlayers.forEach((p, i) => map.set(p.seat, i));
    return map;
  }, [sortedPlayers]);

  const prevStateRef = useRef<GameState | null>(null);
  const [chips, setChips] = useState<ChipEvent[]>([]);

  useEffect(() => {
    const prev = prevStateRef.current;
    if (!prev) { prevStateRef.current = state; return; }

    const newChips: ChipEvent[] = [];

    for (const player of state.players) {
      const prevPlayer = prev.players.find(p => p.seat === player.seat);
      if (!prevPlayer) continue;

      const posIdx = positionMap.get(player.seat) ?? 0;
      const seat   = SEAT_POSITIONS[posIdx] ?? CENTER;
      const betPos = BET_POSITIONS[posIdx]  ?? CENTER;

      // Bet increased → fly from seat to bet zone (stays as stack)
      if (player.bet > prevPlayer.bet) {
        newChips.push({
          id: `bet-${player.seat}-${state.step}`,
          fromLeft: seat.left,   fromTop: seat.top,
          toLeft:   betPos.left, toTop:   betPos.top,
          amount: player.bet - prevPlayer.bet,
        });
      }

      // Bet cleared (> 0 → 0) and not a winner → chips collect to center pot
      if (prevPlayer.bet > 0 && player.bet === 0 && !player.isWinner) {
        newChips.push({
          id: `collect-${player.seat}-${state.step}`,
          fromLeft: betPos.left, fromTop: betPos.top,
          toLeft:   CENTER.left, toTop:   CENTER.top,
          amount: prevPlayer.bet,
        });
      }

      // Player wins → chips fly from center to their seat
      if (player.isWinner && !prevPlayer.isWinner) {
        newChips.push({
          id: `win-${player.seat}-${state.step}`,
          fromLeft: CENTER.left, fromTop: CENTER.top,
          toLeft:   seat.left,   toTop:   seat.top,
          amount: 0,
        });
      }
    }

    if (newChips.length > 0) setChips(prev => [...prev, ...newChips]);
    prevStateRef.current = state;
  }, [state, positionMap]);

  const removeChip = useCallback((id: string) => {
    setChips(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableOuter}>
        <div className={styles.tableInner}>
          <img src={logoSrc} alt="" className={styles.tableLogo} aria-hidden="true" />
          <div className={styles.center}>
            <Board cards={state.board} pot={state.pot} showBBUnits={showBBUnits} bigBlind={bigBlind} />
            <div className={styles.streetBadge}>{state.street.toUpperCase()}</div>
          </div>

          {sortedPlayers.map(player => (
            <PlayerSeat
              key={player.seat}
              player={player}
              position={`seat${positionMap.get(player.seat) ?? 0}`}
              showBBUnits={showBBUnits}
              bigBlind={bigBlind}
            />
          ))}

          {/* Persistent bet stacks — visible while player.bet > 0 */}
          {sortedPlayers.map(player => {
            if (player.bet <= 0) return null;
            const posIdx = positionMap.get(player.seat) ?? 0;
            const betPos = BET_POSITIONS[posIdx] ?? CENTER;
            return (
              <div
                key={`betstack-${player.seat}`}
                className={styles.betStack}
                style={{ left: `${betPos.left}%`, top: `${betPos.top}%` }}
                aria-hidden="true"
              >
                {formatChips(player.bet, showBBUnits, bigBlind)}
              </div>
            );
          })}

          {chips.map(chip => (
            <ChipAnimation key={chip.id} {...chip} onDone={removeChip} />
          ))}
        </div>
      </div>

      <div className={styles.message} aria-live="polite">
        {state.message}
      </div>
    </div>
  );
}
