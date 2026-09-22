export type FeaturedGame = {
  id: number;
  name: string;
};

/** 10 AAA / popular Steam titles shown when search is empty. */
export const FEATURED_GAMES: FeaturedGame[] = [
  { id: 2358720, name: 'Black Myth: Wukong' },
  { id: 1091500, name: 'Cyberpunk 2077' },
  { id: 1245620, name: 'Elden Ring' },
  { id: 271590, name: 'Grand Theft Auto V' },
  { id: 1174180, name: 'Red Dead Redemption 2' },
  { id: 1086940, name: "Baldur's Gate 3" },
  { id: 990080, name: 'Hogwarts Legacy' },
  { id: 292030, name: 'The Witcher 3: Wild Hunt' },
  { id: 730, name: 'Counter-Strike 2' },
  { id: 1593500, name: 'God of War' },
];

export const SEARCH_SUGGESTIONS = [
  'Elden Ring',
  'Cyberpunk 2077',
  'GTA V',
  'Baldur\'s Gate 3',
  'The Witcher 3',
  'CS2',
];

export function steamCapsuleUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`;
}
