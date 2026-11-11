// Réglages centralisés du découpage des frontières.
// Tracé retenu : Natural Earth, avec le tracé officiel marocain (le Maroc inclut le Sahara).

/** Entités Natural Earth (code ADM0_A3) fusionnées dans un pays (code ISO alpha-2). */
export const MERGE_INTO: Record<string, string> = {
  SAH: 'MA', // Sahara → Maroc
  ESH: 'MA',
  CYN: 'CY', // Chypre du Nord → Chypre
  SOL: 'SO', // Somaliland → Somalie
};

/** Entités ignorées. */
export const DROP_A3 = new Set(['ATA', 'ATF', 'ATC', 'IOA', 'CSI', 'KAB', 'USG', 'WSB', 'ESB', 'SPI', 'BRI', 'CLP', 'SCR', 'PGA', 'BJN', 'SER', 'KAS']);

/**
 * Cartes de régions : on écarte les subdivisions trop éloignées du territoire principal
 * (ex. départements d'outre-mer sur la carte de France). Facteur × la taille du territoire.
 */
export const REGION_MAX_DISTANCE_FACTOR = 1.5;
