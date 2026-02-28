import type { ParsedHand } from '../types/poker';

/** Erro lançado quando uma mão parseada não passa na validação estrutural. */
export class HandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandValidationError';
  }
}

/**
 * Valida a integridade estrutural de uma mão parseada.
 * Lança `HandValidationError` se encontrar inconsistências.
 * Problemas leves (ex: dealer sem assento correspondente) são corrigidos silenciosamente.
 */
export function validateHand(hand: ParsedHand): void {
  if (hand.players.length < 2) {
    throw new HandValidationError(
      `Mão inválida: apenas ${hand.players.length} jogador(es) encontrado(s). Mínimo 2.`
    );
  }

  for (const p of hand.players) {
    if (p.stack < 0) {
      throw new HandValidationError(
        `Jogador "${p.name}" tem stack negativo (${p.stack}). Arquivo pode estar corrompido.`
      );
    }
    if (!p.name.trim()) {
      throw new HandValidationError(`Assento ${p.seat} tem nome de jogador vazio.`);
    }
  }

  const seats = hand.players.map(p => p.seat);
  const uniqueSeats = new Set(seats);
  if (uniqueSeats.size !== seats.length) {
    throw new HandValidationError('Dois jogadores no mesmo assento. Verifique o arquivo.');
  }

  if (!hand.players.some(p => p.seat === hand.dealerSeat)) {
    // Correção suave: ajusta para o primeiro jogador em vez de lançar erro
    hand.dealerSeat = hand.players[0].seat;
  }

  if (hand.streets.length === 0) {
    throw new HandValidationError('Nenhuma street encontrada. O formato pode não ser suportado.');
  }

  const firstStreet = hand.streets[0];
  if (firstStreet.street !== 'preflop') {
    throw new HandValidationError(
      `A primeira street deveria ser "preflop", mas encontrou "${firstStreet.street}".`
    );
  }
}
