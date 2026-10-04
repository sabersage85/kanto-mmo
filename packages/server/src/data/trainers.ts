import type { TrainerDefinition } from '@kanto-mmo/shared';

/**
 * NPC trainers across the Milestone 7 world. All names, badge names, and
 * teams below are original creations; species ids reference the original
 * creature roster in packages/shared/src/species.ts.
 *
 * `kind: 'gym'` trainers (Milestone 6) are the three themed town leaders,
 * now relocated one-per-town (Stonehollow/Tidemoor/Cinderfell) as the
 * world expanded from a single map to five. `kind: 'rival'` is the
 * recurring rival (three escalating encounters, one per later map).
 * `kind: 'grunt'` is the "Murk Crew" minor-antagonist group (two path
 * blockers in Fernway Wood, one item-thief in Tidemoor, one organizer in
 * Cinderfell) driving the Milestone 7 light questline — see
 * packages/server/src/quest.ts. Only `kind === 'gym'` wins count toward
 * the client's badge counter; rival/grunt wins are tracked the same way
 * (one-time, via the existing `defeatedTrainers` persistence) but are
 * filtered out of that counter.
 *
 * Difficulty scaling: wild encounters on Fernway Wood roll levels 3-7 (see
 * data/encounters.ts) and every new account starts with a single level-5
 * starter. The Murk Crew grunts blocking the Fernway path are kept
 * deliberately easy (level 4-5, one creature) since they're an early,
 * mandatory-feeling story beat rather than a gym-tier challenge. The three
 * gym leaders keep their Milestone 6 two-creature level 9/11 teams. The
 * rival's team grows across its three encounters (two creatures at level
 * 7, then three at level 12, then three at level 17) to track roughly
 * alongside the player's own likely progress through the three gyms.
 */
export const TRAINERS: TrainerDefinition[] = [
  {
    id: 'stonewarden',
    name: 'Garrick the Stonewarden',
    themeType: 'Rock',
    kind: 'gym',
    mapId: 'stonehollow',
    badgeId: 'stonewake-badge',
    badgeName: 'Stonewake Badge',
    position: { x: 7, y: 3 },
    team: [
      { speciesId: 13, level: 9 }, // Pebblit
      { speciesId: 10, level: 11 }, // Boulderm
    ],
  },
  {
    id: 'tideglass',
    name: 'Lira the Tideglass',
    themeType: 'Water',
    kind: 'gym',
    mapId: 'tidemoor',
    badgeId: 'tidemark-badge',
    badgeName: 'Tidemark Badge',
    position: { x: 7, y: 3 },
    team: [
      { speciesId: 3, level: 9 }, // Pondrake
      { speciesId: 20, level: 11 }, // Shellnap
    ],
  },
  {
    id: 'cinderguard',
    name: 'Kellan the Cinderguard',
    themeType: 'Fire',
    kind: 'gym',
    mapId: 'cinderfell',
    badgeId: 'cinderpeak-badge',
    badgeName: 'Cinderpeak Badge',
    position: { x: 7, y: 3 },
    team: [
      { speciesId: 1, level: 9 }, // Tindle
      { speciesId: 18, level: 11 }, // Cindertail
    ],
  },
  {
    id: 'murk-grunt-1',
    name: 'Murk Crew Lookout',
    themeType: 'Shadow',
    kind: 'grunt',
    mapId: 'fernway',
    badgeId: 'murk-grunt-1-defeated',
    badgeName: 'Fernway Path (West Half)',
    position: { x: 7, y: 5 },
    greeting: "Heh, no further! The Murk Crew's got this path locked down.",
    defeatLine: "H-hey! Fine, fine, go on through. Don't tell the others I folded that easy.",
    team: [{ speciesId: 19, level: 4 }], // Murkling
  },
  {
    id: 'murk-grunt-2',
    name: 'Murk Crew Scout',
    themeType: 'Shadow',
    kind: 'grunt',
    mapId: 'fernway',
    badgeId: 'murk-grunt-2-defeated',
    badgeName: 'Fernway Path (East Half)',
    position: { x: 8, y: 5 },
    greeting: "Lookout went down already?! Fine, I'll finish this myself.",
    defeatLine: 'Ugh. The boss is gonna hear about this one way or the other.',
    team: [{ speciesId: 19, level: 5 }], // Murkling
  },
  {
    id: 'murk-grunt-3',
    name: 'Murk Crew Grunt',
    themeType: 'Shadow',
    kind: 'grunt',
    mapId: 'tidemoor',
    badgeId: 'murk-grunt-3-defeated',
    badgeName: "Fisherman's Lure Recovered",
    position: { x: 3, y: 7 },
    greeting: "This shiny lure? Finders keepers. Not that you'll be taking it from me.",
    defeatLine: 'Alright, alright! Take the dumb lure back. Not worth this hassle.',
    team: [{ speciesId: 19, level: 10 }], // Murkling
  },
  {
    id: 'murk-leader',
    name: 'Shade, the Murk Crew Organizer',
    themeType: 'Shadow',
    kind: 'grunt',
    mapId: 'cinderfell',
    badgeId: 'murk-leader-defeated',
    badgeName: 'Murk Crew Routed',
    position: { x: 11, y: 7 },
    greeting: "So you're the one who's been unraveling my crew's work. That ends here.",
    defeatLine: "...Fine. We're done here. Pack it up, we're moving on to easier territory.",
    team: [
      { speciesId: 19, level: 15 }, // Murkling
      { speciesId: 21, level: 16 }, // Gloomhare
    ],
  },
  {
    id: 'rival-1',
    name: 'Juno',
    themeType: 'Grass',
    kind: 'rival',
    mapId: 'fernway',
    badgeId: 'rival-1-defeated',
    badgeName: 'Rival Battle: Fernway Wood',
    position: { x: 3, y: 2 },
    greeting: "There you are! Figured I'd catch up and see if you've gotten any better.",
    defeatLine: "Ha, not bad! Don't get comfortable though, I'll be back stronger.",
    team: [
      { speciesId: 16, level: 7 }, // Thistlehop
      { speciesId: 22, level: 7 }, // Glimmerwing
    ],
  },
  {
    id: 'rival-2',
    name: 'Juno',
    themeType: 'Grass',
    kind: 'rival',
    mapId: 'tidemoor',
    badgeId: 'rival-2-defeated',
    badgeName: 'Rival Battle: Tidemoor Town',
    position: { x: 3, y: 3 },
    greeting: "Heard you took down Garrick already. Let's see if that badge means anything.",
    defeatLine: 'Still ahead of me, huh. Next time is going to be different.',
    team: [
      { speciesId: 16, level: 12 }, // Thistlehop
      { speciesId: 22, level: 12 }, // Glimmerwing
      { speciesId: 17, level: 12 }, // Driftmoth
    ],
  },
  {
    id: 'rival-3',
    name: 'Juno',
    themeType: 'Grass',
    kind: 'rival',
    mapId: 'cinderfell',
    badgeId: 'rival-3-defeated',
    badgeName: 'Rival Battle: Cinderfell Town',
    position: { x: 3, y: 7 },
    greeting: "Three gyms deep and you're still standing. Alright, I'm done holding back.",
    defeatLine: "...Yeah. You've earned that one. I'll find you again somewhere down the road.",
    team: [
      { speciesId: 16, level: 17 }, // Thistlehop
      { speciesId: 22, level: 17 }, // Glimmerwing
      { speciesId: 17, level: 17 }, // Driftmoth
    ],
  },
];

export function getTrainer(id: string): TrainerDefinition {
  const trainer = TRAINERS.find((t) => t.id === id);
  if (!trainer) {
    throw new Error(`Unknown trainer id: ${id}`);
  }
  return trainer;
}

export function findTrainerAt(mapId: string, x: number, y: number): TrainerDefinition | undefined {
  return TRAINERS.find((t) => t.mapId === mapId && t.position.x === x && t.position.y === y);
}

export function trainersForMap(mapId: string): TrainerDefinition[] {
  return TRAINERS.filter((t) => t.mapId === mapId);
}
