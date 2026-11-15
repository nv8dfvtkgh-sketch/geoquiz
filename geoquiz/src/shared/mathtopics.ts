// Révisions de maths par notion (« proportionnalité », « puissances », « nombres relatifs »…),
// classe par classe d'après les programmes (France : Éduscol / BO ; États-Unis : Common Core).
// Niveau scolaire : 0 = Kindergarten, 1 = CP / Grade 1 … 12 = Terminale / Grade 12.
export const GRADE: Record<string, number> = { k: 0, cp: 1, ce1: 2, ce2: 3, cm1: 4, cm2: 5, '6e': 6, '5e': 7, '4e': 8, '3e': 9, '2nde': 10, '1re': 11, tle: 12, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`g${i + 1}`, i + 1])) };

export const TOPIC_NAMES: Record<string, { fr: string; en: string }> = {
  compter: { fr: 'Compter', en: 'Counting' }, numeration: { fr: 'Numération', en: 'Place value' }, addition: { fr: 'Addition', en: 'Addition' },
  soustraction: { fr: 'Soustraction', en: 'Subtraction' }, doubles: { fr: 'Doubles et moitiés', en: 'Doubles and halves' }, multiplication: { fr: 'Multiplication', en: 'Multiplication' },
  division: { fr: 'Division', en: 'Division' }, suites: { fr: 'Suites de nombres', en: 'Number patterns' }, mesures: { fr: 'Mesures et durées', en: 'Measurement and time' },
  arrondis: { fr: 'Arrondis', en: 'Rounding' }, fractions: { fr: 'Fractions', en: 'Fractions' }, perimetre: { fr: 'Périmètres', en: 'Perimeter' },
  aires: { fr: 'Aires', en: 'Area' }, conversions: { fr: "Conversions d'unités", en: 'Unit conversions' }, multiples: { fr: 'Multiples et diviseurs', en: 'Multiples and factors' },
  decimaux: { fr: 'Nombres décimaux', en: 'Decimals' }, volumes: { fr: 'Volumes', en: 'Volume' }, pourcentages: { fr: 'Pourcentages', en: 'Percentages' },
  priorites: { fr: 'Priorités de calcul', en: 'Order of operations' }, proportionnalite: { fr: 'Proportionnalité', en: 'Ratios and proportions' },
  litteral: { fr: 'Calcul littéral', en: 'Algebraic expressions' }, arithmetique: { fr: 'Arithmétique', en: 'Number theory' }, relatifs: { fr: 'Nombres relatifs', en: 'Negative numbers' },
  equations: { fr: 'Équations', en: 'Equations' }, angles: { fr: 'Angles et triangles', en: 'Angles and triangles' }, cercle: { fr: 'Cercle et disque', en: 'Circles' },
  probas: { fr: 'Probabilités', en: 'Probability' }, puissances: { fr: 'Puissances', en: 'Exponents' }, pythagore: { fr: 'Théorème de Pythagore', en: 'Pythagorean theorem' },
  fonctions: { fr: 'Fonctions', en: 'Functions' }, racines: { fr: 'Racines carrées', en: 'Square roots' }, scientifique: { fr: 'Notation scientifique', en: 'Scientific notation' },
  vitesses: { fr: 'Vitesses', en: 'Speed' }, trigo: { fr: 'Trigonométrie', en: 'Trigonometry' }, thales: { fr: 'Théorème de Thalès', en: 'Similar triangles' },
  reperage: { fr: 'Géométrie repérée', en: 'Coordinate geometry' }, stats: { fr: 'Statistiques', en: 'Statistics' }, vecteurs: { fr: 'Vecteurs', en: 'Vectors' },
  derivation: { fr: 'Dérivation', en: 'Derivatives' }, 'second-degre': { fr: 'Second degré', en: 'Quadratics' }, 'suites-num': { fr: 'Suites', en: 'Sequences' },
  'produit-scalaire': { fr: 'Produit scalaire', en: 'Dot product' }, logarithme: { fr: 'Logarithme', en: 'Logarithms' }, exponentielle: { fr: 'Exponentielle', en: 'Exponential' },
  integrales: { fr: 'Primitives et intégrales', en: 'Integrals' }, combinatoire: { fr: 'Dénombrement', en: 'Combinatorics' }, limites: { fr: 'Limites', en: 'Limits' },
};

/** Notion de chaque générateur de questions, dans l'ordre (voir server/schoolmath.ts). */
export const MATH_TAGS: string[][] = [
  ['compter', 'addition', 'soustraction', 'compter', 'numeration', 'addition'],
  ['addition', 'soustraction', 'numeration', 'addition', 'doubles', 'numeration', 'numeration'],
  ['addition', 'soustraction', 'multiplication', 'suites', 'numeration', 'doubles', 'mesures'],
  ['multiplication', 'division', 'addition', 'soustraction', 'arrondis', 'fractions', 'perimetre', 'mesures'],
  ['multiplication', 'multiplication', 'division', 'fractions', 'aires', 'conversions', 'multiples', 'decimaux'],
  ['decimaux', 'decimaux', 'decimaux', 'fractions', 'volumes', 'pourcentages', 'priorites', 'proportionnalite'],
  ['pourcentages', 'proportionnalite', 'aires', 'litteral', 'decimaux', 'arithmetique', 'relatifs', 'aires', 'fractions'],
  ['relatifs', 'relatifs', 'equations', 'equations', 'angles', 'cercle', 'probas', 'proportionnalite', 'litteral'],
  ['puissances', 'puissances', 'pythagore', 'equations', 'fonctions', 'racines', 'scientifique', 'litteral', 'fractions', 'vitesses', 'relatifs', 'proportionnalite'],
  ['litteral', 'litteral', 'equations', 'fonctions', 'pourcentages', 'trigo', 'thales', 'equations', 'probas', 'stats', 'arithmetique'],
  ['equations', 'reperage', 'reperage', 'stats', 'pourcentages', 'vecteurs', 'fonctions', 'stats'],
  ['derivation', 'second-degre', 'suites-num', 'suites-num', 'produit-scalaire', 'logarithme', 'second-degre', 'derivation'],
  ['exponentielle', 'logarithme', 'integrales', 'combinatoire', 'limites', 'logarithme', 'integrales', 'exponentielle'],
];

/** Mots-clés pour ranger les questions écrites à la main dans une notion. */
export const TOPIC_KEYWORDS: Record<string, RegExp> = {
  fractions: /fraction|\d\/\d|moitié|quart|tiers|half|quarter/i, pourcentages: /%|pour ?cent|percent/i,
  decimaux: /décimal|dixième|centième|decimal|\d,\d|\d\.\d/i, relatifs: /relatif|opposé|négatif|negative|absolute|valeur absolue|−\d|-\d/i,
  puissances: /puissance|exposant|exponent|10⁻|[²³⁴⁵⁰]|\^/i, pythagore: /pythagore|hypoténuse|hypotenuse|right triangle/i, equations: /résous|solve|équation|equation/i,
  litteral: /développe|factorise|réduis|expand|factor|simplify|expression/i, aires: /aire|area/i, volumes: /volume|cm³|dm³/i, perimetre: /périmètre|perimeter|circumference/i,
  angles: /angle|triangle|°/i, cercle: /cercle|disque|circle|π|rayon|diamètre|radius|diameter/i, probas: /probabilit|probability|dé |dice|pile/i,
  multiplication: /×|multipli|produit|tables?/i, division: /÷|divis|quotient|reste|partage/i, addition: /\+|somme|add/i, soustraction: /−|reste-t-il|left|soustra|subtract/i,
  conversions: /combien de (cm|mm|m|g|kg|ml|l|minutes|centimes)|how many (inches|ounces|cents|milliliters|minutes)|convert/i, mesures: /heure|minute|jour|semaine|mois|clock|time|hour|cents|€|\$/i,
  numeration: /dizaine|centaine|chiffre|unités|plus grand|plus petit|greater|value of the|tens|ones|s'écrit|place/i, arithmetique: /premier|prime|pgcd|gcf|diviseur|factor of|multiple/i,
  multiples: /multiple|diviseur|divisible|factor of|prime/i, fonctions: /fonction|function|f\(x\)|pente|slope|droite|line|intercept/i, trigo: /sin|cos|tan/i, thales: /thalès|similar/i,
  stats: /moyenne|médiane|étendue|mean|median|range|standard deviation|écart/i, derivation: /dérivée|derivative|f'/i, 'second-degre': /Δ|discriminant|x²|quadratic|parabol/i,
  'suites-num': /suite|sequence/i, 'produit-scalaire': /scalaire|orthogon|dot product/i, logarithme: /ln|log/i, exponentielle: /e[ˣ^]|exponenti/i, integrales: /primitive|intégr|integral|∫/i,
  combinatoire: /façons|parmi|ways|factorial|!|combination|ranger/i, limites: /limite|limit|→ ?[+∞]|∞/i, racines: /√|racine|square root|irrational/i, scientifique: /scientifi/i,
  vitesses: /vitesse|km\/h|m\/s|speed|velocity/i, compter: /combien|how many|count/i, doubles: /double|moitié|half/i, suites: /, \?, |count by/i, arrondis: /arrondi|round/i,
  priorites: /\(.*\)\s*[×+]|priorit|evaluate|order of operations/i, vecteurs: /vecteur|vector/i, reperage: /coordonnée|milieu|distance|midpoint|coordinate|repère|origin/i,
  proportionnalite: /proportion|ratio|unit rate|recette|recipe|pour \d+ /i,
};

/** Notions d'une classe (dans l'ordre du programme), avec ses questions de maths. */
export function topicsOf(level: string): string[] {
  const g = GRADE[level];
  return g === undefined ? [] : [...new Set(MATH_TAGS[g] ?? [])];
}
/** Range une question écrite dans une notion de sa classe (ou aucune). */
export function topicFor(level: string, question: string): string | undefined {
  for (const t of topicsOf(level)) if (TOPIC_KEYWORDS[t]?.test(question)) return t;
  return undefined;
}
