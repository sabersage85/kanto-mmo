/**
 * Milestone 7's single light questline: a recurring minor-antagonist
 * group called the "Murk Crew" (original name/motif — small-time creature
 * poachers, no copyrighted names/characters). Quest progress is a simple
 * integer stage (0-3), server-authoritative and persisted per account —
 * see `packages/server/src/quest.ts` for the transition logic. This file
 * only holds the shared, display-oriented stage metadata so client and
 * server render identical quest-log text.
 */
export const MURK_CREW_QUEST_ID = 'murk-crew';

export interface QuestStageInfo {
  stage: number;
  title: string;
  description: string;
}

export const MURK_CREW_QUEST_STAGES: QuestStageInfo[] = [
  {
    stage: 0,
    title: 'Whispers of the Murk Crew',
    description:
      "Folks in Hearthfield mutter about a band of creature poachers calling themselves the Murk Crew, " +
      'last seen causing trouble somewhere out along the Fernway Wood path.',
  },
  {
    stage: 1,
    title: 'Path Cleared',
    description: 'You chased off the two Murk Crew grunts blocking the Fernway Wood path. The way onward is clear.',
  },
  {
    stage: 2,
    title: 'Lure Returned',
    description:
      "You recovered a Tidemoor fisherman's stolen lure from a Murk Crew grunt and returned it. " +
      'Word is their local organizer is holed up somewhere near Cinderfell.',
  },
  {
    stage: 3,
    title: 'Murk Crew Routed',
    description: "You defeated the Murk Crew's organizer in Cinderfell, breaking up their operation for good.",
  },
];

export function getQuestStageInfo(stage: number): QuestStageInfo {
  const clamped = Math.max(0, Math.min(stage, MURK_CREW_QUEST_STAGES.length - 1));
  return MURK_CREW_QUEST_STAGES[clamped];
}
