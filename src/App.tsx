import { useState } from 'react';
import type { ParsedHand } from './types/poker';
import { useReplay } from './hooks/useReplay';
import { FileUpload } from './components/FileUpload';
import { PokerTable } from './components/PokerTable';
import { ReplayControls } from './components/ReplayControls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Card } from './components/Card';
import './App.css';

function formatStakes(stakes: { sb: number; bb: number }, tableType: string): string {
  const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
  if (tableType === 'tournament') {
    return `${fmt(stakes.sb)}/${fmt(stakes.bb)}`;
  }
  return `$${fmt(stakes.sb)}/$${fmt(stakes.bb)}`;
}

function getHeroSummary(h: ParsedHand) {
  if (!h.heroName || h.stakes.bb === 0) return null;
  const heroPlayer = h.players.find(p => p.name === h.heroName);
  if (!heroPlayer) return null;

  const heroCards = h.holeCards[h.heroName];
  const startStackBB = heroPlayer.stack / h.stakes.bb;

  let totalInvested = 0;
  for (const street of h.streets) {
    for (const action of street.actions) {
      if (action.player === h.heroName && action.amount != null) {
        totalInvested += action.amount;
      }
    }
  }
  const grossWon = h.winners.find(w => w.player === h.heroName)?.amount ?? 0;
  const netBB = (grossWon - totalInvested) / h.stakes.bb;

  return { heroCards, startStackBB, netBB };
}

export default function App() {
  const [hands, setHands] = useState<ParsedHand[]>([]);
  const [hand,  setHand]  = useState<ParsedHand | null>(null);
  const [showBBUnits, setShowBBUnits] = useState(false);
  const replay = useReplay(hand);

  const handleHandsParsed = (hs: ParsedHand[]) => {
    setHands(hs);
    if (hs.length === 1) setHand(hs[0]);
  };
  const handleSelectHand = (h: ParsedHand) => setHand(h);
  const handleBackToList = () => setHand(null);
  const handleReset      = () => { setHands([]); setHand(null); };

  const currentHandIndex = hand ? hands.indexOf(hand) : -1;
  const hasNextHand      = currentHandIndex >= 0 && currentHandIndex < hands.length - 1;
  const hasPrevHand      = currentHandIndex > 0;
  const handleNextHand   = () => { if (hasNextHand) setHand(hands[currentHandIndex + 1]); };
  const handlePrevHand   = () => { if (hasPrevHand) setHand(hands[currentHandIndex - 1]); };

  const showBackBtn = hands.length > 1 && hand !== null;

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">♠ Poker Replayer</h1>
        <div className="headerActions">
          {showBackBtn && (
            <button className="backBtn" onClick={handleBackToList}>
              ← Mãos
            </button>
          )}
          {hands.length > 0 && (
            <button className="resetBtn" onClick={handleReset}>
              Nova mão
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <ErrorBoundary onReset={handleReset}>
          {hands.length === 0 ? (
            <FileUpload onHandsParsed={handleHandsParsed} />
          ) : !hand ? (
            /* Hand list */
            <div className="handListView">
              <h2 className="handListTitle">
                {hands.length} {hands.length === 1 ? 'mão encontrada' : 'mãos encontradas'}
              </h2>
              <ul className="handList">
                {hands.map((h, i) => {
                  const heroCards = h.heroName ? h.holeCards[h.heroName] : undefined;
                  return (
                    <li key={`${h.id}-${i}`}>
                      <button className="handListItem" onClick={() => handleSelectHand(h)}>
                        <span className="formatBadge">{h.format}</span>
                        <span className="handId">#{i + 1}</span>
                        {heroCards && (
                          <span className="handHeroCards">
                            <Card card={heroCards[0]} small />
                            <Card card={heroCards[1]} small />
                          </span>
                        )}
                        <span className="stakes">{formatStakes(h.stakes, h.tableType)}</span>
                        <span className="handDate">
                          {h.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="handPlayers">{h.players.length} jog.</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            /* Replay view — with optional sidebar */
            <div className={hands.length > 1 ? 'layout' : ''}>

              {hands.length > 1 && (
                <aside className="sidebar">
                  <div className="sidebarHeader">{hands.length} mãos</div>
                  <ul className="sidebarList">
                    {hands.map((h, i) => {
                      const hero = getHeroSummary(h);
                      const won = hero ? hero.netBB > 0 : null;
                      return (
                        <li key={`${h.id}-${i}`}>
                          <button
                            className={`sidebarItem${h === hand ? ' sidebarItemActive' : ''}`}
                            onClick={() => handleSelectHand(h)}
                          >
                            <div className="sidebarItemRow">
                              <span className="sidebarItemId">#{i + 1}</span>
                              {hero?.heroCards && (
                                <span className="sidebarItemCards">
                                  <Card card={hero.heroCards[0]} small />
                                  <Card card={hero.heroCards[1]} small />
                                </span>
                              )}
                              {won !== null && (
                                <span className={`sidebarItemResult${won ? ' sidebarItemResultWon' : ' sidebarItemResultLost'}`}>
                                  {won ? 'win' : 'loss'}
                                </span>
                              )}
                            </div>
                            <div className="sidebarItemRow">
                              <span className="sidebarItemStakes">{formatStakes(h.stakes, h.tableType)}</span>
                              {hero && (
                                <span className="sidebarItemStack">
                                  {hero.startStackBB % 1 === 0 ? hero.startStackBB : hero.startStackBB.toFixed(1)}BB
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </aside>
              )}

              {replay.state ? (
                <div className="replayView">
                  <div className="handInfo">
                    <span className="formatBadge">{hand.format}</span>
                    <span className="handId">Mão #{currentHandIndex + 1}</span>
                    <span className="stakes">{formatStakes(hand.stakes, hand.tableType)}</span>
                  </div>

                  <PokerTable
                    state={replay.state}
                    heroName={hand.heroName}
                    showBBUnits={showBBUnits}
                    bigBlind={hand.stakes.bb}
                  />

                  <ReplayControls
                    currentStep={replay.currentStep}
                    totalSteps={replay.totalSteps}
                    onNext={replay.next}
                    onPrev={replay.prev}
                    hasNextHand={hasNextHand}
                    onNextHand={hands.length > 1 ? handleNextHand : undefined}
                    hasPrevHand={hasPrevHand}
                    onPrevHand={hands.length > 1 ? handlePrevHand : undefined}
                    showBBUnits={showBBUnits}
                    onToggleBBUnits={() => setShowBBUnits(v => !v)}
                  />
                </div>
              ) : (
                <div className="loadingMsg">Carregando...</div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
