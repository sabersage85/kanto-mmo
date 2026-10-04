import { ArraySchema, Schema, type } from '@colyseus/schema';
import { BattleCreatureSchema, BattleLogEntrySchema } from './BattleState.js';

export type PvpBattleStatus = 'waiting' | 'ongoing' | 'challenger_win' | 'opponent_win';

/** Root networked state for a PvpBattleRoom (one human player vs another, Milestone 4). */
export class PvpBattleState extends Schema {
  @type(BattleCreatureSchema) challenger = new BattleCreatureSchema();
  @type(BattleCreatureSchema) opponent = new BattleCreatureSchema();
  @type('string') challengerName = '';
  @type('string') opponentName = '';
  /** sessionId of the client playing each side, so clients can tell "am I the challenger or opponent". */
  @type('string') challengerSessionId = '';
  @type('string') opponentSessionId = '';
  @type('string') status: PvpBattleStatus = 'waiting';
  @type([BattleLogEntrySchema]) log = new ArraySchema<BattleLogEntrySchema>();
  /** Updated lifetime win/loss record for each side once the match ends. */
  @type('number') challengerWins = 0;
  @type('number') challengerLosses = 0;
  @type('number') opponentWins = 0;
  @type('number') opponentLosses = 0;
}
