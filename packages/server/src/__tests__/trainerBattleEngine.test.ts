import { createBattleCreature, getSpecies } from '@kanto-mmo/shared';
import { describe, expect, it } from 'vitest';
import { TrainerBattleEngine } from '../trainer/trainerBattleEngine.js';

describe('TrainerBattleEngine', () => {
  it('throws when constructed with an empty trainer team', () => {
    const player = createBattleCreature(getSpecies(1), 10);
    expect(() => new TrainerBattleEngine(player, [])).toThrow();
  });

  it('auto-advances to the trainer\u2019s next team member on faint instead of ending the battle', () => {
    const player = createBattleCreature(getSpecies(1), 50); // big level gap so the trainer's team faints quickly
    const trainerTeam = [createBattleCreature(getSpecies(5), 2), createBattleCreature(getSpecies(9), 2)];
    const engine = new TrainerBattleEngine(player, trainerTeam);

    expect(engine.trainerTeamRemaining).toBe(2);

    let turns = 0;
    let sawSentOutNext = false;
    while (engine.status === 'ongoing' && turns < 50) {
      const result = engine.resolveTurn(player.moveIds[0], { tieBreakRoll: 0, trainerMovePick: 0 });
      if (result.trainerSentOutNext) sawSentOutNext = true;
      turns++;
    }

    expect(sawSentOutNext).toBe(true);
    expect(engine.status).toBe('player_win');
    expect(engine.trainerTeamRemaining).toBe(0);
  });

  it('ends the battle (trainer_win) once the player faints, without touching remaining trainer team state', () => {
    const player = createBattleCreature(getSpecies(5), 2);
    const trainerTeam = [createBattleCreature(getSpecies(1), 60)];
    const engine = new TrainerBattleEngine(player, trainerTeam);

    let turns = 0;
    while (engine.status === 'ongoing' && turns < 50) {
      engine.resolveTurn(player.moveIds[0], { tieBreakRoll: 1, trainerMovePick: 0 });
      turns++;
    }

    expect(engine.status).toBe('trainer_win');
    expect(engine.trainerTeamRemaining).toBe(1);
  });

  it('sets lastFaintedTrainerCreature only on the turn the active trainer creature actually faints', () => {
    const player = createBattleCreature(getSpecies(1), 50);
    const trainerTeam = [createBattleCreature(getSpecies(5), 2), createBattleCreature(getSpecies(9), 2)];
    const engine = new TrainerBattleEngine(player, trainerTeam);

    const first = engine.resolveTurn(player.moveIds[0], { tieBreakRoll: 0, trainerMovePick: 0 });
    if (!first.trainerCreatureFainted) {
      expect(engine.lastFaintedTrainerCreature).toBeNull();
    } else {
      expect(engine.lastFaintedTrainerCreature).not.toBeNull();
    }
  });

  it('throws if resolveTurn is called again after the battle has already ended', () => {
    const player = createBattleCreature(getSpecies(1), 60);
    const trainerTeam = [createBattleCreature(getSpecies(5), 2)];
    const engine = new TrainerBattleEngine(player, trainerTeam);

    let turns = 0;
    while (engine.status === 'ongoing' && turns < 50) {
      engine.resolveTurn(player.moveIds[0], { tieBreakRoll: 0, trainerMovePick: 0 });
      turns++;
    }
    expect(engine.status).toBe('player_win');
    expect(() => engine.resolveTurn(player.moveIds[0])).toThrow();
  });

  it('activeTrainerCreature reflects the currently-battling team member', () => {
    const player = createBattleCreature(getSpecies(1), 50);
    const trainerTeam = [createBattleCreature(getSpecies(5), 2), createBattleCreature(getSpecies(9), 2)];
    const engine = new TrainerBattleEngine(player, trainerTeam);

    expect(engine.activeTrainerCreature).toBe(trainerTeam[0]);

    let turns = 0;
    while (engine.activeIndex === 0 && engine.status === 'ongoing' && turns < 50) {
      engine.resolveTurn(player.moveIds[0], { tieBreakRoll: 0, trainerMovePick: 0 });
      turns++;
    }

    if (engine.status === 'ongoing') {
      expect(engine.activeTrainerCreature).toBe(trainerTeam[1]);
    }
  });
});
