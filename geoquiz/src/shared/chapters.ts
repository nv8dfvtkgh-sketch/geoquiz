// Révisions par chapitre pour toutes les matières (hors maths, voir mathtopics.ts) :
// grandes parties des programmes (Éduscol / BO ; Common Core, NGSS, cadre C3).
// Une question écrite est rangée d'après son énoncé (mots-clés, dans l'ordre) ou par un
// en-tête « ### chapitre » dans data/school/<système>/<classe>.txt.
export interface Chapter { id: string; fr: string; en: string; kw: RegExp }

const C = (id: string, fr: string, en: string, kw: RegExp): Chapter => ({ id, fr, en, kw });

export const CHAPTERS: Record<string, Chapter[]> = {
  francais: [
    C('conjugaison', 'Conjugaison', 'Verb tenses', /conjug|présent|imparfait|futur|passé (simple|composé)|plus-que-parfait|conditionnel|subjonctif|impératif|infinitif|participe|groupe|temps :|au (présent|futur)|complète.*«.*(je|tu|il|nous|vous|ils|elles) /i),
    C('sons', 'Lecture et sons', 'Phonics', /\bson\b|\[\w+\]|syllabe|lettre|alphabet|rime|commence par/i),
    C('orthographe', 'Orthographe et accords', 'Spelling and agreement', /pluriel|féminin|masculin|accord|homophone|« (a|à|et|est|son|sont|ces|ses|c'est|s'est|leur|leurs|on|ont|s'en|sans) »|écrit correctement|s muet/i),
    C('grammaire', 'Grammaire', 'Grammar', /sujet|verbe|nom\b|adjectif|adverbe|déterminant|pronom|préposition|conjonction|complément|COD|COI|attribut|épithète|proposition|subordonnée|phrase|nature|fonction|voix passive|signe|ponctuation|virgule|guillemets|majuscule/i),
    C('vocabulaire', 'Vocabulaire', 'Vocabulary', /synonyme|contraire|antonyme|préfixe|suffixe|radical|famille|sens|signifie|expression|polysémique|veut dire|dictionnaire/i),
    C('litterature', 'Littérature', 'Literature', /écrit|auteur|roman|poème|poésie|théâtre|conte|fable|récit|héros|personnage|figure|métaphore|comparaison|hyperbole|litote|oxymore|anaphore|vers|sonnet|alexandrin|mouvement|narrateur|registre|épopée|nouvelle|tragédie|comédie|didascalie|monologue|lettre ouverte|autobiographie|engagé|satire|apologue/i),
  ],
  anglais: [
    C('verbes', 'Verbes et temps', 'Verbs and tenses', /prétérit|participe passé|complète|present perfect|passif|passive|would|will|since|for|wish|used to|going to|must|should|can\b|mustn't/i),
    C('grammaire', 'Grammaire', 'Grammar', /pluriel|comparatif|superlatif|pronom|bonne (phrase|question|place)|phrase.*correcte|correcte|place de/i),
    C('civilisation', 'Culture et civilisation', 'Culture', /capitale|fête|nationalité|royaume|united|états-unis|thanksgiving|4 juillet|qui a écrit|auteur|discours|premier ministre|parlement|écosse|irlande|nhs|brexit|rosa parks|king/i),
    C('vocabulaire', 'Vocabulaire', 'Vocabulary', /veut dire|comment dit-on|que signifie/i),
  ],
  qlm: [
    C('corps', 'Le corps et la santé', 'Human body and health', /corps|dent|cœur|poumon|respir|sens\b|odorat|ouïe|vue|toucher|goût|os\b|muscle|aliment|repas|manger|brosse|santé|sommeil/i),
    C('vivant', 'Le vivant', 'Living things', /animal|animaux|plante|graine|petit de|pond|insecte|araignée|abeille|mammifère|carnivore|herbivore|chaîne alimentaire|racine|feuille|hiberne|chenille|têtard|germination|poisson|oiseau/i),
    C('matiere', 'La matière et les objets', 'Matter and objects', /eau|glace|vapeur|état|fusion|évaporation|aimant|électri|circuit|lampe|conduit|matériau|objet|thermomètre|balance|mesure|température/i),
    C('espace-temps', "L'espace et le temps", 'Space and time', /saison|mois|semaine|siècle|heure|horloge|jour|nuit|soleil|terre|continent|océan|carte|plan|planisphère|nord|grands-parents|transport|lampes|200 ans|tri|déchet|rue|urgence/i),
  ],
  sciences: [
    C('corps', 'Le corps humain et la santé', 'Human body and health', /corps|os\b|muscle|digestion|sang|cœur|rein|puberté|respir|santé|microbe/i),
    C('vivant', 'Le vivant et la biodiversité', 'Living things', /plante|animal|vivant|cellule|classification|vertébr|photosynthèse|décomposeur|métamorphose|fossile|habitat|chlorophyll|chaîne/i),
    C('matiere', 'La matière', 'Matter', /matière|mélange|état|dissout|filtration|air|masse volumique|solide|liquide|gaz/i),
    C('energie', "L'énergie et l'électricité", 'Energy and electricity', /énergie|électri|circuit|interrupteur|isolant|tension|ampèremètre|pile|éolienne|barrage|renouvelable|fossile.*énergie|charbon/i),
    C('terre-univers', 'La Terre et l’Univers', 'Earth and space', /planète|soleil|lune|terre|saison|éclipse|volcan|séisme|roche|érosion|cycle de l'eau|couche|pesanteur|lave/i),
    C('technologie', 'Objets techniques et programmation', 'Technology', /objet technique|algorithme|programm|robot|capteur|boucle|levier/i),
  ],
  svt: [
    C('genetique', 'Génétique et évolution', 'Genetics and evolution', /ADN|gène|chromosome|allèle|mitose|méiose|mutation|évolution|sélection|darwin|mendel|caryotype|spéciation|dérive|brassage|crossing|phénotype|hérédit|domestication/i),
    C('corps', 'Corps humain et santé', 'Human body and health', /poumon|respir|digest|intestin|enzyme|bile|sang|cœur|rythme|nerv|réflexe|cerveau|muscle|immun|lymphocyte|vaccin|antibiotique|anticorps|phagocyt|inflammat|insuline|glycémie|diabète|hormone|stress|sport|fécondation|testicule|ovaire|IST|puberté|olfactif|microbiote|cancer/i),
    C('geologie', 'La Terre et les roches', 'Earth sciences', /roche|plaque|séisme|volcan|lithosphère|subduction|dorsale|magma|basalte|granite|glacier|sédiment|érosion|trait de côte|fossile|datation|radiochronologie|superposition|orogen|climat|GIEC|CO₂|serre|sol\b|humus/i),
    C('ecologie', 'Écosystèmes et biodiversité', 'Ecosystems and biodiversity', /écosystème|biodiversité|pollinis|agrosystème|espèce|population|chaîne|photosynthèse|chloroplaste|stomate|service écosystémique|reproduction|plante/i),
  ],
  physique: [
    C('chimie', 'Matière et transformations chimiques', 'Matter and chemistry', /atome|molécule|ion|formule|H₂O|CO₂|réaction|combustion|mole|avancement|concentration|dilution|pH|acide|base|corps pur|mélange|état|fusion|solidification|liquéfaction|isotope|électron|proton|neutron|catalyseur|ester|oxydant|chlorure|eau de chaux|masse.*conserve|changement d'état|gaz parfait|polarité|réactif/i),
    C('electricite', 'Électricité', 'Electricity', /électri|circuit|tension|intensité|volt|ampère|ohm|résistance|court-circuit|série|condensateur|RC|farad/i),
    C('mouvement', 'Mouvements, forces et gravitation', 'Forces and motion', /force|newton|vitesse|poids|masse|gravitation|pesanteur|inertie|mouvement|projectile|kepler|archimède|orbite/i),
    C('ondes', 'Lumière et son', 'Light and sound', /lumière|son\b|sonore|onde|fréquence|réfraction|diffraction|prisme|lentille|photon|doppler|spectre|couleur|oscilloscope|hertz|ultrason|photoélectrique|longueur d'onde/i),
    C('energie', 'Énergie', 'Energy', /énergie|puissance|joule|watt|centrale|photovoltaïque|thermodynamique|radioacti|demi-vie|nucléaire/i),
  ],
  histgeo: [
    C('antiquite', 'Préhistoire et Antiquité', 'Prehistory and Antiquity', /préhistoire|lascaux|gaulois|vercingétorix|alésia|mésopotamie|égypt|pharaon|hiéroglyphe|cunéiforme|grec|athènes|olymp|zeus|rome|romain|romulus|auguste|césar|hébreux|constantin|caracalla|périclès|ecclésia|antiquité|av\. J\.-C/i),
    C('moyen-age', 'Le Moyen Âge', 'Middle Ages', /clovis|charlemagne|saint louis|louis ix|moyen âge|seigneur|vassal|hommage|paysans|croisade|islam|mahomet|mohammed|hégire|byzant|constantinople|abbassides|bagdad|1453/i),
    C('temps-modernes', 'Temps modernes (XVIe – XVIIIe s.)', 'Early modern era', /renaissance|léonard|gutenberg|imprimerie|réforme|luther|colomb|1492|magellan|vasco|copernic|françois ier|henri iv|édit de nantes|fontainebleau|louis xiv|roi-soleil|versailles|monarchie absolue|lumières|montesquieu|voltaire|diderot|traite|glorieuse|chambord|18e|xviiie/i),
    C('revolution', 'Révolution et XIXe siècle', 'Revolution and 19th century', /révolution|bastille|1789|1793|terreur|déclaration des droits|napoléon|empire|code civil|waterloo|restauration|1848|esclavage|schœlcher|commune|iiie république|1870|ferry|dreyfus|1905|industri|machine à vapeur|charbon|colonis|exode rural|bismarck|risorgimento|second empire/i),
    C('xxe', 'Guerres mondiales (1914 – 1945)', 'World Wars (1914–1945)', /guerre mondiale|1914|1918|poilus|verdun|somme|armistice|11 novembre|union sacrée|génocide arménien|versailles|révolution russe|bolchevik|staline|hitler|totalitaire|1929|krach|new deal|front populaire|1939|1940|1944|1945|de gaulle|résistance|jean moulin|shoah|débarquement|hiroshima|nuremberg|8 mai/i),
    C('monde-actuel', 'Le monde depuis 1945', 'The world since 1945', /guerre froide|berlin|onu|plan marshall|cuba|urss disparaît|1991|algérie|ve république|1958|traité de rome|maastricht|union européenne|euro\b|mitterrand|veil|ivg|droit de vote des femmes|1944.*vote|décolonisation/i),
    C('geographie', 'Géographie', 'Geography', /fleuve|montagne|sommet|mer|océan|continent|région|ville|métropole|mégapole|urbain|rural|littoral|habitant|peupl|densit|migr|mondialisation|transport|tourisme|ressource|eau potable|développement durable|transition|risque|aire d'attraction|périurbain|ultramarin|outre-mer|ZEE|mer territoriale|zone économique|espace|puissance|chine|atelier|aéroport|câble|écoquartier|stress hydrique/i),
    C('emc', 'Citoyenneté et institutions', 'Civics', /devise|maire|république|liberté, égalité|élu|commune|citoyen|soft power|acteur transnational|laïque/i),
  ],
  ses: [
    C('economie', 'Économie', 'Economics', /PIB|valeur ajoutée|marché|prix|demande|monnaie|euro|banque|agents économiques|INSEE/i),
    C('sociologie', 'Sociologie', 'Sociology', /socialisation|famille|école|chômage|population active|diplôme|insertion/i),
    C('politique', 'Science politique', 'Political science', /opinion|sondage|vote|politique/i),
  ],
  philo: [
    C('sujet', 'Le sujet : conscience, inconscient, bonheur', 'The self', /cogito|pense, donc|inconscient|conscience|épicur|stoïc|bonheur|ataraxie|existence précède|sisyphe|naît pas femme|connais-toi|désir|temps|mémoire/i),
    C('politique', 'Morale et politique : liberté, État, justice', 'Ethics and politics', /contrat social|hobbes|animal politique|impératif|libert|devoir|justice|l['’]état|banalité du mal|\bloi\b|moral|travail|démocratie/i),
    C('connaissance', 'La connaissance : raison, vérité, science', 'Knowledge', /caverne|démonstration|doxa|relativisme|vérité|science|raison|sais rien|pensées|pari|expérience|hypothèse|preuve|langage/i),
    C('culture', 'La culture : art, technique, religion', 'Culture', /\bart\b|œuvre|beau|goût|technique|outil|religion|croyance|sacré|nature|culture|génie/i),
  ],
  ela: [
    C('phonics', 'Phonics and reading', 'Phonics and reading', /sound|rhyme|letter|syllable|blend|vowel|short|long ".*" sound|sight word|uppercase|lowercase/i),
    C('grammar', 'Grammar and punctuation', 'Grammar and punctuation', /noun|verb|adjective|adverb|pronoun|plural|past tense|contraction|sentence|clause|phrase|punctuation|comma|period|apostrophe|semicolon|colon|dash|quotation|ellipsis|capital|tense|gerund|infinitive|modifier|voice|mood|conjunction|interjection|parentheses|modal|correct\b|capitalized/i),
    C('vocabulary', 'Vocabulary', 'Vocabulary', /synonym|antonym|prefix|suffix|root|mean|meaning|idiom|connotation|denotation|homophone|abc order|spelled|opposite/i),
    C('literature', 'Literature', 'Literature', /wrote|author|illustrator|story|character|setting|theme|poem|poet|stanza|novel|play|narrator|point of view|simile|metaphor|personification|hyperbole|alliteration|onomatopoeia|irony|flashback|foreshadowing|climax|fable|moral|soliloquy|tragic|epic|allegory|dystopia|archetype|satire|sonnet|romanticism|stream of consciousness|iambic|shakespeare|hamlet|macbeth|gatsby|odyssey|cover|book/i),
    C('writing', 'Reading and writing skills', 'Reading and writing skills', /claim|evidence|argument|thesis|source|plagiarism|summary|main idea|central idea|fact|opinion|persuasive|rhetoric|logos|pathos|ethos|fallacy|works cited|synthesis|tone|text structure|glossary|rebuttal|herring|ad hominem|slippery/i),
  ],
  science: [
    C('life', 'Life science', 'Life science', /plant|animal|cell|organ|DNA|gene|trait|allele|mitosis|meiosis|protein|enzyme|habitat|ecosystem|food (chain|web)|predator|producer|decomposer|species|evolution|natural selection|fossil|offspring|life cycle|photosynthesis|respiration|homeostasis|vaccine|immune|brain|heart|biodiversity|population|symbiosis|pollen|bee|seed|nest|fur|shell|carrying capacity|invasive|punnett|darwin|mendel|watson/i),
    C('earth', 'Earth and space science', 'Earth and space science', /earth|sun|moon|star|planet|galaxy|orbit|season|day and night|shadow|weather|climate|rain|cloud|water cycle|rock|plate|earthquake|volcano|erosion|weathering|landform|ocean|glacier|atmosphere|greenhouse|ozone|carbon cycle|fossil fuel|renewable|flood|tornado|front|big bang|sky|constellation|eclipse|fresh water|sustainability|acidification|radiometric|anemometer|thermometer|recycl/i),
    C('physical', 'Physical science', 'Physical science', /force|push|pull|motion|magnet|gravity|energy|wave|light|sound|vibrat|matter|solid|liquid|gas|melt|dissolve|mixture|atom|element|molecule|reaction|chemical|periodic|mole|pH|acid|bond|isotope|newton|velocity|acceleration|momentum|ohm|circuit|electric|frequency|refraction|joule|watt|kinetic|potential|heat|catalyst|sodium|NaCl|H₂O/i),
  ],
  social: [
    C('civics', 'Civics and government', 'Civics and government', /government|branch|congress|senate|house of representatives|president|supreme court|justice|constitution|amendment|bill of rights|law|vote|voting|election|electoral|veto|judicial|federalism|citizen|right|freedom|mayor|governor|rules|pledge|checks and balances|filibuster|lobbying|miranda|civil liberties|primary|leader|tax/i),
    C('economics', 'Economics', 'Economics', /money|goods|services|producer|consumer|supply|demand|need|want|trade|scarce|resource|gdp|inflation|federal reserve|opportunity cost|fiscal|monopoly|buy/i),
    C('geography', 'Geography', 'Geography', /map|compass|continent|ocean|river|mountain|lake|state|region|equator|latitude|longitude|peninsula|island|urban|rural|suburban|country|populous|largest|community|neighborhood|home|immigration|urbanization/i),
    C('history', 'History', 'History', /.*/),
  ],
};

export function chaptersOf(subject: string): Chapter[] { return CHAPTERS[subject] ?? []; }
/** Range une question dans le premier chapitre dont les mots-clés correspondent. */
export function chapterFor(subject: string, question: string, answer = ''): string | undefined {
  const text = `${question} ${answer}`;
  for (const c of chaptersOf(subject)) if (c.kw.test(text)) return c.id;
  return undefined;
}
