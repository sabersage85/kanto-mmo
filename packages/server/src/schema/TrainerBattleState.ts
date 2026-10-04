import { ArraySchema, Schema, type } from '@colyseus/schema';
import { BattleCreatureSchema, BattleLogEntrySchema } from './BattleState.js';

export type TrainerBattleStatus = 'ongoing' | 'won' | 'lost';

/**
 * Root networked state for a TrainerBattleRoom (Milestone 6): one player
 * vs. one NPC trainer's multi-creature team. Reuses `BattleCreatureSchema`/
 * `BattleLogEntrySchema` from the PvE `BattleState` since the per-creature
 * shape is identical; only the trainer-specific team bookkeeping and the
 * badge-award outcome are new here.
 */
export class TrainerBattleState extends Schema {
  @type(BattleCreatureSchema) player = new BattleCreatureSchema();
  /** The trainer's currently-active creature (auto-advances on faint). */
  @type(BattleCreatureSchema) trainer = new BattleCreatureSchema();
  @type('string') trainerId = '';
  @type('string') trainerName = '';
  @type('number') trainerTeamSize = 0;
  /** Includes the currently-active creature, i.e. counts down to 1 before the final KO. */
  @type('number') trainerTeamRemaining = 0;
  @type('string') status: TrainerBattleStatus = 'ongoing';
  @type([BattleLogEntrySchema]) log = new ArraySchema<BattleLogEntrySchema>();
  @type('number') expGained = 0;
  @type('boolean') leveledUp = false;
  @type('number') newLevel = 0;
  /** Set true only on a win the first time this trainer's badge is earned (false on a loss, or if already earned before). */
  @type('boolean') badgeAwarded = false;
  @type('string') badgeName = '';
}
