import {
  getMove,
  resolvePvpTurn,
  type BattleCreatureState,
  type PvpSide,
  type PvpTurnResult,
  type PvpTurnRng,
} from '@kanto-mmo/shared';

export type PvpMatchStatus = 'ongoing' | 'challenger_win' | 'opponent_win';

/**
 * Stateful (but Colyseus-independent) orchestrator for one PvP match: owns
 * both sides' live `BattleCreatureState`, accepts a move submission per
 * side per turn, and resolves the turn (via `@kanto-mmo/shared`'s
 * `resolvePvpTurn`) once both are in. Kept separate from `PvpBattleRoom`
 * specifically so turn resolution, move-submission validation, and
 * timeout/forfeit logic can be unit tested without any networking/timers.
 */
export class PvpMatch {
  status: PvpMatchStatus = 'ongoing';
  private pendingMoves: Partial<Record<PvpSide, number>> = {};

  constructor(
    readonly challenger: BattleCreatureState,
    readonly opponent: BattleCreatureState,
  ) {}

  /** Returns true if the move was accepted (battle ongoing, valid move for that side, not already submitted this turn). */
  submitMove(side: PvpSide, moveId: number): boolean {
    if (this.status !== 'ongoing') return false;
    if (this.pendingMoves[side] !== undefined) return false;
    const creature = side === 'challenger' ? this.challenger : this.opponent;
    if (!creature.moveIds.includes(moveId)) return false;

    this.pendingMoves[side] = moveId;
    return true;
  }

  get bothSubmitted(): boolean {
    return this.pendingMoves.challenger !== undefined && this.pendingMoves.opponent !== undefined;
  }

  /** Which side(s) have not yet submitted a move this turn ('both' if neither has). Null once both are in. */
  missingSide(): PvpSide | 'both' | null {
    const challengerMissing = this.pendingMoves.challenger === undefined;
    const opponentMissing = this.pendingMoves.opponent === undefined;
    if (challengerMissing && opponentMissing) return 'both';
    if (challengerMissing) return 'challenger';
    if (opponentMissing) return 'opponent';
    return null;
  }

  /** Resolves the turn once both sides have submitted; returns null (no-op) otherwise. */
  resolveTurn(rng: PvpTurnRng = {}): PvpTurnResult | null {
    if (!this.bothSubmitted) return null;

    const challengerMove = getMove(this.pendingMoves.challenger!);
    const opponentMove = getMove(this.pendingMoves.opponent!);
    const result = resolvePvpTurn(this.challenger, this.opponent, challengerMove, opponentMove, rng);

    this.pendingMoves = {};
    if (result.outcome) this.status = result.outcome;
    return result;
  }

  /** Ends the match immediately in the other side's favor (timeout or disconnect). Idempotent if already over. */
  forfeit(side: PvpSide): PvpMatchStatus {
    if (this.status === 'ongoing') {
      this.status = side === 'challenger' ? 'opponent_win' : 'challenger_win';
    }
    return this.status;
  }
}
