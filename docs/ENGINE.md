# Engine

## `buildSteps(hand: ParsedHand): GameState[]`

Converte uma `ParsedHand` em um array de snapshots `GameState[]`,
um snapshot por evento relevante da mão.

## Sequência de Passos Gerados

| Evento | Mensagem |
|---|---|
| Início da mão | `"Início da mão"` |
| Post de blind | `"Player posta small blind $0.01"` |
| Post de ante | `"Player posta ante $0.05"` |
| Fold | `"Player desiste (fold)"` |
| Check | `"Player passa (check)"` |
| Call | `"Player paga (call) $0.06"` |
| Bet | `"Player aposta (bet) $0.10"` |
| Raise | `"Player aumenta (raise) para $0.30"` |
| All-in | `"Player vai all-in $1.20"` |
| Reveal de flop/turn/river | `"Flop: [Ah Kd 2c]"` |
| Showdown | `"Showdown"` |
| Vencedor | `"Vencedor: Player ($1.50)"` |

## Invariantes Mantidas

- `pot >= 0` em todos os passos
- `player.stack >= 0` (fichas nunca ficam negativas)
- `player.bet` é zerado no início de cada nova street
- `isAllIn` fica `true` permanentemente quando `stack === 0`
- `isWinner` é definido apenas no último passo

## Cálculo de Call

O valor do call é calculado como:
```
toCall = min(maxBetDaStreet - player.bet, player.stack)
```
Isso garante que um jogador não pague mais do que tem (all-in implícito).

## Limitações Conhecidas

- **Side pots não são calculados explicitamente.** O `pot` é um único número.
  Em situações de all-in múltiplos, o pot total está correto, mas não há divisão
  visual entre pot principal e side pots.
- **Cartas de jogadores foldados** são ocultadas exceto quando fornecidas pelo parser
  (ex: RunItTwice, exposição voluntária).
