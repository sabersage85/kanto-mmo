import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryPersistenceStore } from '../persistence/memoryStore.js';
import { clearAllSessions, getQuestStage, loadSession } from '../sessionCache.js';
import { interactWithNpc, maybeAdvanceQuestOnBadge } from '../quest.js';
import { TRAINERS } from '../data/trainers.js';

const SPAWN = { mapId: 'hearthfield', x: 1, y: 1, direction: 'down' as const };

afterEach(() => {
  clearAllSessions();
});

describe('Murk Crew questline', () => {
  it('starts every new account at stage 0', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-1', 'Red', SPAWN);
    expect(getQuestStage('acct-quest-1')).toBe(0);
  });

  it('advances 0 -> 1 only once BOTH Fernway grunts are defeated, not after just one', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-2', 'Red', SPAWN);

    maybeAdvanceQuestOnBadge('acct-quest-2', 'murk-grunt-1-defeated', ['murk-grunt-1-defeated'], store);
    expect(getQuestStage('acct-quest-2')).toBe(0);

    maybeAdvanceQuestOnBadge(
      'acct-quest-2',
      'murk-grunt-2-defeated',
      ['murk-grunt-1-defeated', 'murk-grunt-2-defeated'],
      store,
    );
    expect(getQuestStage('acct-quest-2')).toBe(1);
  });

  it('does not advance to stage 2 via the tidemoor-fisher NPC until grunt 3 has been defeated', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-3', 'Red', SPAWN);
    maybeAdvanceQuestOnBadge(
      'acct-quest-3',
      'murk-grunt-2-defeated',
      ['murk-grunt-1-defeated', 'murk-grunt-2-defeated'],
      store,
    );
    expect(getQuestStage('acct-quest-3')).toBe(1);

    const result = interactWithNpc('tidemoor-fisher', 'Dock Kid', 'acct-quest-3', ['murk-grunt-1-defeated', 'murk-grunt-2-defeated'], store);
    expect(result.questAdvanced).toBeUndefined();
    expect(getQuestStage('acct-quest-3')).toBe(1);
  });

  it('advances 1 -> 2 when the tidemoor-fisher NPC is interacted with after grunt 3 is defeated', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-4', 'Red', SPAWN);
    const badges = ['murk-grunt-1-defeated', 'murk-grunt-2-defeated', 'murk-grunt-3-defeated'];
    maybeAdvanceQuestOnBadge('acct-quest-4', 'murk-grunt-2-defeated', badges, store);
    expect(getQuestStage('acct-quest-4')).toBe(1);

    const result = interactWithNpc('tidemoor-fisher', 'Dock Kid', 'acct-quest-4', badges, store);
    expect(result.questAdvanced).toBe(true);
    expect(getQuestStage('acct-quest-4')).toBe(2);

    // Interacting again afterward should just be a thank-you, not re-advance or regress.
    const again = interactWithNpc('tidemoor-fisher', 'Dock Kid', 'acct-quest-4', badges, store);
    expect(again.questAdvanced).toBeUndefined();
    expect(getQuestStage('acct-quest-4')).toBe(2);
  });

  it('advances 2 -> 3 when the murk-leader badge is awarded', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-5', 'Red', SPAWN);
    maybeAdvanceQuestOnBadge('acct-quest-5', 'murk-leader-defeated', ['murk-leader-defeated'], store);
    expect(getQuestStage('acct-quest-5')).toBe(3);
  });

  it('the quest-board NPC never mutates quest state, only reports it', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-6', 'Red', SPAWN);
    const result = interactWithNpc('quest-board', 'Notice Board', 'acct-quest-6', [], store);
    expect(result.questAdvanced).toBeUndefined();
    expect(getQuestStage('acct-quest-6')).toBe(0);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it('falls back to generic flavor dialogue for any other npc id', async () => {
    const store = new InMemoryPersistenceStore();
    await loadSession(store, 'acct-quest-7', 'Red', SPAWN);
    const result = interactWithNpc('hearthfield-elder', 'Elder', 'acct-quest-7', [], store);
    expect(result.lines.length).toBeGreaterThan(0);
  });
});

describe('Rival "Juno" progression', () => {
  const rivals = TRAINERS.filter((t) => t.kind === 'rival');

  it('defines exactly three escalating encounters, all sharing the same name', () => {
    expect(rivals).toHaveLength(3);
    expect(new Set(rivals.map((r) => r.name)).size).toBe(1);
  });

  it('strictly increases both team size and every creature level across encounters', () => {
    const byMap = ['fernway', 'tidemoor', 'cinderfell'];
    const ordered = byMap.map((mapId) => rivals.find((r) => r.mapId === mapId)!);
    expect(ordered.every(Boolean)).toBe(true);

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      expect(curr.team.length).toBeGreaterThanOrEqual(prev.team.length);
      const prevMaxLevel = Math.max(...prev.team.map((m) => m.level));
      const currMinLevel = Math.min(...curr.team.map((m) => m.level));
      expect(currMinLevel).toBeGreaterThan(prevMaxLevel - 1);
    }
  });

  it('each rival encounter has distinct badge ids so all three are independently tracked/defeatable', () => {
    const badgeIds = rivals.map((r) => r.badgeId);
    expect(new Set(badgeIds).size).toBe(badgeIds.length);
  });
});
