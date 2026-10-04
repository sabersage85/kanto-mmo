import {
  applyMove,
  getMove,
  resolveTurnOrder,
  type ApplyMoveRng,
  type BattleCreatureState,
  type MoveResult,
} from '@kanto-mmo/shared';

export type TrainerBattleStatus = 'ongoing' | 'player_win' | 'trainer_win';

export interface TrainerTurnResult {
  /** Action order for this turn, re-labeled from shared's 'player'/'wild' BattleSide to 'player'/'trainer' for this room's own vocabulary. */
  order: ['player', 'trainer'] | ['trainer', 'player'];
  playerMoveId: number;
  trainerMoveId: number;
  results: { player?: MoveResult; trainer?: MoveResult };
  /** True the instant the trainer's active creature faints this turn (whether or not the whole team is now defeated). */
  trainerCreatureFainted: boolean;
  /** True once the trainer sends out its next team member after a faint (no action happens on the turn it enters). */
  trainerSentOutNext: boolean;
  status: TrainerBattleStatus;
}

export interface TrainerTurnRng {
  tieBreakRoll?: number;
  player?: ApplyMoveRng;
  trainer?: ApplyMoveRng;
  /** Picks the trainer's move index out of its active creature's moveIds (simple "random valid move" AI). */
  trainerMovePick?: number;
}

/**
 * Stateful (but Colyseus-independent) orchestrator for one player-vs-NPC-
 * trainer battle (Milestone 6): the player keeps a single active creature
 * (consistent with the existing PvE/PvP convention — see README/ROADMAP),
 * while the trainer has a fixed multi-creature team that auto-advances to
 * its next living member whenever the active one faints, instead of
 * ending the battle. The trainer "AI" is intentionally simple — it picks a
 * uniformly random move from its active creature's moveset each turn —
 * which keeps this milestone's scope tight while still feeling like a
 * real, harder fight thanks to the team's higher levels (see
 * data/trainers.ts). Kept separate from `TrainerBattleRoom` so turn
 * resolution/team-advancement/outcome logic can be unit tested without
 * any networking/timers, mirroring `pvp/pvpMatch.ts`'s design.
 *
 * Internally this reuses shared's `resolveTurnOrder`/`applyMove`, whose
 * side labels are 'player'/'wild' (the PvE vocabulary); `resolveTurn`
 * below translates that into this module's own 'player'/'trainer' labels
 * before returning a result, so callers never see 'wild'.
 */
export class TrainerBattleEngine {
  status: TrainerBattleStatus = 'ongoing';
  activeIndex = 0;
  /** Set to the trainer creature that just fainted (if any) at the end of the most recent `resolveTurn` call. */
  lastFaintedTrainerCreature: BattleCreatureState | null = null;

  constructor(
    readonly player: BattleCreatureState,
    readonly trainerTeam: BattleCreatureState[],
  ) {
    if (trainerTeam.length === 0) {
      throw new Error('A trainer must have at least one creature on its team.');
    }
  }

  get activeTrainerCreature(): BattleCreatureState {
    return this.trainerTeam[this.activeIndex];
  }

  get trainerTeamRemaining(): number {
    return this.trainerTeam.length - this.activeIndex;
  }

  /** Resolves one full turn: speed order, both moves applied, then faint/team-advance/outcome handling. */
  resolveTurn(playerMoveId: number, rng: TrainerTurnRng = {}): TrainerTurnResult {
    if (this.status !== 'ongoing') {
      throw new Error('This trainer battle has already ended.');
    }
    this.lastFaintedTrainerCreature = null;
    const trainer = this.activeTrainerCreature;
    const movePick = rng.trainerMovePick ?? Math.floor(Math.random() * trainer.moveIds.length);
    const trainerMoveId = trainer.moveIds[Math.min(Math.max(movePick, 0), trainer.moveIds.length - 1)];

    // Shared's resolveTurnOrder/applyMove use the 'player'/'wild' PvE
    // vocabulary; 'wild' here means "the trainer's active creature".
    const order = resolveTurnOrder(this.player.stats.speed, trainer.stats.speed, rng.tieBreakRoll);
    const results: TrainerTurnResult['results'] = {};
    let trainerCreatureFainted = false;
    let battleStatus: TrainerBattleStatus = 'ongoing';

    for (const side of order) {
      const attacker = side === 'player' ? this.player : trainer;
      const defender = side === 'player' ? trainer : this.player;
      if (attacker.currentHp <= 0) continue;

      const moveId = side === 'player' ? playerMoveId : trainerMoveId;
      const move = getMove(moveId);
      const sideRng = side === 'player' ? rng.player : rng.trainer;
      const resultKey = side === 'player' ? 'player' : 'trainer';
      results[resultKey] = applyMove(attacker, defender, move, sideRng ?? {});

      if (this.player.currentHp <= 0) {
        battleStatus = 'trainer_win';
        break;
      }
      if (trainer.currentHp <= 0) {
        trainerCreatureFainted = true;
        break;
      }
    }

    let trainerSentOutNext = false;
    if (battleStatus === 'ongoing' && trainerCreatureFainted) {
      this.lastFaintedTrainerCreature = trainer;
      this.activeIndex += 1;
      if (this.activeIndex >= this.trainerTeam.length) {
        battleStatus = 'player_win';
      } else {
        trainerSentOutNext = true;
      }
    }

    this.status = battleStatus;
    const translatedOrder = order.map((side) => (side === 'player' ? 'player' : 'trainer')) as TrainerTurnResult['order'];
    return {
      order: translatedOrder,
      playerMoveId,
      trainerMoveId,
      results,
      trainerCreatureFainted,
      trainerSentOutNext,
      status: battleStatus,
    };
  }
}
