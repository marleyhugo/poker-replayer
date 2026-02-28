# Parsers

## Detecção de Formato

`parsers/index.ts` → `detectFormat(text)` identifica o formato pelo cabeçalho:

| Formato | String de identificação |
|---|---|
| PokerStars | `PokerStars Hand #` ou `PokerStars Game #` |
| GGPoker | `Poker Hand #HD` ou `GGPoker` ou `Natural8` |
| 888 Poker | `888poker Hand History for Game` ou `Pacific Poker` |
| WPN | `Game #NNN starts` ou `Winning Poker` ou `WPN` |

## Estrutura Comum de um Parser

Cada parser segue o mesmo fluxo:

1. **Header** — extrai ID, stakes, data, tipo (cash/torneio)
2. **Assentos** — extrai `seat`, `name`, `stack` de cada jogador
3. **Dealer** — identifica o `dealerSeat`
4. **Hole cards** — cartas do hero e de showdown
5. **Streets** — itera as ações preflop/flop/turn/river/showdown
6. **Winners** — extrai vencedores e valores do SUMMARY

## Helpers Internos

Cada parser define localmente:

```ts
parseAmount(s)  // "$1,234.56" → 1234.56
parseCard(s)    // "10h" → "Th", normaliza rank
parseCards(s)   // "Ah Kd" → ["Ah", "Kd"]
parseLine(line) // linha de ação → RawAction | null
```

## Formato PokerStars

```
PokerStars Hand #123456789: Hold'em No Limit ($0.01/$0.02 USD) - 2024/01/15 12:00:00 ET
Table 'NomeTabela' 9-max Seat #1 is the button
Seat 1: Player1 ($2.00 in chips)
...
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Player1: raises $0.04 to $0.06
*** FLOP *** [2h 5d 8c]
*** TURN *** [2h 5d 8c] [Js]
*** RIVER *** [2h 5d 8c Js] [Ac]
*** SHOW DOWN ***
*** SUMMARY ***
```

## Formato GGPoker

Semelhante ao PokerStars mas com variações:
- Cabeçalho: `Poker Hand #HD123456789`
- Ações podem ser capitalizadas: `Folds`, `Checks`, `Raises`
- Identificador de pre-flop: `*** PRE-FLOP ***` (além de `*** HOLE CARDS ***`)

## Formato 888 Poker

Diferenças notáveis:
- Assentos: `Seat 1 - PlayerName ($2.50)` (sem "in chips")
- Blinds: `Player posts small blind [$0.01]` (com colchetes)
- Ações capitalizadas: `Folds`, `Checks`, `Bets`, `Raises`
- Board: revelado inline com `-- Dealing flop [Ah Kd 2c]`

## Formato WPN

Diferenças notáveis:
- Cabeçalho: `Game #123456 starts.` seguido de `Game #123456 - Hold'em...`
- Assentos: `Seat 1: PlayerName $2.00` (sem parênteses)
- Raises: `raises to $X` (sem "from" e "to" como PokerStars)
- All-in: `goes all-in for $X`

## Adicionando Novo Formato

1. Crie `src/parsers/novosite.ts` exportando `parseNovoSite(text): ParsedHand`
2. Adicione detecção em `parsers/index.ts` → `detectFormat()`
3. Importe e adicione ao switch em `parseHandHistory()`
4. Adicione na tabela de formatos do README
