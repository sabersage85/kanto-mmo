import { ArraySchema, Schema, type } from '@colyseus/schema';

/** Networked snapshot of one side's creature in an ongoing battle. */
export class BattleCreatureSchema extends Schema {
  @type('number') speciesId = 0;
  @type('string') name = '';
  @type('number') level = 1;
  @type('number') maxHp = 1;
  @type('number') currentHp = 1;
  @type(['number']) moveIds = new ArraySchema<number>();
}

export class BattleLogEntrySchema extends Schema {
  @type('string') text = '';
}

export type BattleStatus = 'ongoing' | 'won' | 'lost' | 'fled' | 'caught';

/** Root networked state for a BattleRoom (one player vs one wild creature). */
export class BattleState extends Schema {
  @type(BattleCreatureSchema) player = new BattleCreatureSchema();
  @type(BattleCreatureSchema) wild = new BattleCreatureSchema();
  @type('string') status: BattleStatus = 'ongoing';
  @type([BattleLogEntrySchema]) log = new ArraySchema<BattleLogEntrySchema>();
  @type('number') expGained = 0;
  @type('boolean') leveledUp = false;
  @type('number') newLevel = 0;
  /** Set when `status === 'caught'`: whether the caught creature overflowed into storage (party was full). */
  @type('boolean') caughtWentToStorage = false;
}
