import { MURK_CREW_QUEST_STAGES } from '@kanto-mmo/shared';
import { advanceQuestStage, getQuestStage } from './sessionCache.js';
import type { PersistenceStore } from './persistence/types.js';

/**
 * Server-authoritative Murk Crew questline transitions (Milestone 7).
 * Kept intentionally tiny (a handful of named stage-advance calls) rather
 * than a generic quest-engine, matching the brief's "simple state
 * tracking, not a full quest engine" scope.
 *
 * Stage meanings (see packages/shared/src/quest.ts for display text):
 *   0 -> 1: both Fernway Wood grunts defeated (auto, via trainer-badge hook)
 *   1 -> 2: the recovered lure is handed back to the Tidemoor quest NPC
 *           (explicit `interactNpc` round-trip — NOT automatic on grunt-3's
 *           defeat, so the player has to actually walk it over and turn it in)
 *   2 -> 3: the Murk Crew leader is defeated in Cinderfell (auto, via
 *           trainer-badge hook)
 */

const GRUNT_1_BADGE = 'murk-grunt-1-defeated';
const GRUNT_2_BADGE = 'murk-grunt-2-defeated';
const GRUNT_3_BADGE = 'murk-grunt-3-defeated';
const LEADER_BADGE = 'murk-leader-defeated';

/** Called after every trainer-battle win; advances the questline if this badge is one of its auto-advance triggers. */
export function maybeAdvanceQuestOnBadge(accountId: string, badgeId: string, badges: string[], store: PersistenceStore): void {
  if (badgeId === GRUNT_1_BADGE || badgeId === GRUNT_2_BADGE) {
    if (badges.includes(GRUNT_1_BADGE) && badges.includes(GRUNT_2_BADGE)) {
      advanceQuestStage(accountId, 1, store);
    }
  } else if (badgeId === LEADER_BADGE) {
    advanceQuestStage(accountId, 3, store);
  }
}

/** Returns true if grunt 3 (the item thief) has been defeated — required before the Tidemoor turn-in NPC will accept the lure. */
export function hasRecoveredLure(badges: string[]): boolean {
  return badges.includes(GRUNT_3_BADGE);
}

export interface NpcDialogueResult {
  name: string;
  lines: string[];
  questAdvanced?: boolean;
}

/**
 * Static flavor dialogue, keyed by npc id. Quest-bearing NPCs are handled
 * separately in `interactWithNpc` below since their lines depend on
 * server-side state (quest stage / badges), not just the npc id.
 */
const FLAVOR_LINES: Record<string, string[]> = {
  'hearthfield-elder': [
    "Welcome to Hearthfield! It's a quiet town, but the roads out east have gotten livelier lately.",
  ],
  'hearthfield-dockhand': ["Careful out on Fernway Wood — folks say a rough crowd's been loitering on the path."],
  'stonehollow-miner': ["Garrick's tougher than he looks. Don't let the quiet voice fool you."],
  'tidemoor-kid': ['My dad lost his favorite lure to some creep in a dark coat. Hope somebody gets it back for him.'],
  'cinderfell-smith': ["Kellan trains here most mornings. If you hear fire-type battle cries, that's him."],
};

/**
 * Resolves the dialogue lines for bumping into an NPC. `questBoard` is a
 * special id (Hearthfield's notice board) that always reflects the
 * player's current quest stage; `tidemoor-fisher` is the lure turn-in NPC
 * and can mutate quest state (stage 1 -> 2) when interacted with after
 * grunt 3 has been defeated.
 */
export function interactWithNpc(
  npcId: string,
  npcName: string,
  accountId: string,
  badges: string[],
  store: PersistenceStore,
): NpcDialogueResult {
  if (npcId === 'quest-board') {
    const stage = getQuestStage(accountId);
    const info = MURK_CREW_QUEST_STAGES[Math.min(stage, MURK_CREW_QUEST_STAGES.length - 1)];
    return { name: npcName, lines: [info.title, info.description] };
  }

  if (npcId === 'tidemoor-fisher') {
    const stage = getQuestStage(accountId);
    if (stage >= 2) {
      return { name: npcName, lines: ['Thanks again for getting my lure back. Tight lines out there!'] };
    }
    if (!hasRecoveredLure(badges)) {
      return {
        name: npcName,
        lines: ['Some Murk Crew grunt swiped my favorite lure somewhere out past here. Would you track it down?'],
      };
    }
    advanceQuestStage(accountId, 2, store);
    return { name: npcName, lines: ['Is that... my lure? You got it back! Thank you so much.'], questAdvanced: true };
  }

  return { name: npcName, lines: FLAVOR_LINES[npcId] ?? ["..."] };
}
