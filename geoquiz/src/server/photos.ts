// Photos libres de Wikimedia Commons pour le jeu Monuments.
// Pour chaque monument, on demande à Wikipédia (en anglais) l'image principale de l'article,
// uniquement si elle est sous licence libre (pilicense=free), puis l'auteur et la licence
// pour les crédits. Le navigateur ne voit jamais l'adresse de la photo (son nom de fichier
// donnerait la réponse) : elle passe par /api/img/<jeton>.
export interface Photo { url: string; credit: string }

const API = 'https://en.wikipedia.org/w/api.php';
export const USER_AGENT = 'Quizellige/1.0 (https://geoquiz.bdyfyngg9c.workers.dev; quiz de géographie éducatif)';
const THUMB = 960; // largeur standard des vignettes Wikimedia

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const photos = new Map<string, Photo>();
const loaded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

/** Jeux d'images : « monuments », « stadiums »… (chargés séparément, une fois chacun). */
export const photosLoaded = (group = 'monuments') => loaded.has(group);
export const photoFor = (id: string) => photos.get(id);
/** Pour les tests. */
export function resetPhotos() { photos.clear(); sounds.clear(); loaded.clear(); loading.clear(); }

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

async function api(fetcher: Fetcher, params: Record<string, string>) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  const init = { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit;
  const r = await fetcher(`${API}?${q}`, init);
  if (!r.ok) throw new Error(`Wikipédia : ${r.status}`);
  return (await r.json()) as any;
}

/** Charge les photos (une seule fois par instance). Renvoie faux si Wikipédia ne répond pas. */
export function ensurePhotos(items: { id: string; wiki: string }[], fetcher: Fetcher = (u, i) => fetch(u, i), group = 'monuments'): Promise<boolean> {
  return once(group, () => load(items, fetcher));
}

function once(group: string, job: () => Promise<void>): Promise<boolean> {
  if (loaded.has(group)) return Promise.resolve(true);
  let p = loading.get(group);
  if (!p) {
    p = job().then(
      () => { loaded.add(group); return true; },
      (e) => { console.error('médias', group, e); loading.delete(group); return false; },
    );
    loading.set(group, p);
  }
  return p;
}

async function load(items: { id: string; wiki: string }[], fetcher: Fetcher) {
  // 1. Image principale libre de chaque article (par paquets de 40 titres).
  const fileOf = new Map<string, { file: string; thumb: string }>(); // id → fichier
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const j = await api(fetcher, {
      action: 'query', prop: 'pageimages', piprop: 'name|thumbnail', pithumbsize: String(THUMB), pilicense: 'free',
      redirects: '1', titles: batch.map((b) => b.wiki).join('|'),
    });
    // Titre demandé → titre final (normalisation, redirections).
    const final = new Map<string, string>();
    for (const b of batch) final.set(b.wiki, b.wiki);
    const follow = (list: { from: string; to: string }[] | undefined) => {
      for (const { from, to } of list ?? []) for (const [k, v] of final) if (v === from) final.set(k, to);
    };
    follow(j.query?.normalized);
    follow(j.query?.redirects);
    const pages = new Map<string, any>((j.query?.pages ?? []).map((p: any) => [p.title, p]));
    for (const b of batch) {
      const p = pages.get(final.get(b.wiki)!);
      if (p?.pageimage && p.thumbnail?.source) fileOf.set(b.id, { file: p.pageimage, thumb: p.thumbnail.source });
    }
  }
  // 2. Auteur et licence de chaque fichier.
  const files = [...new Set([...fileOf.values()].map((f) => f.file))];
  const credit = new Map<string, string>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const j = await api(fetcher, {
      action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName',
      titles: batch.map((f) => `File:${f}`).join('|'),
    });
    const norm = new Map<string, string>((j.query?.normalized ?? []).map((n: any) => [n.to, n.from]));
    for (const p of j.query?.pages ?? []) {
      const meta = p.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      const asked = (norm.get(p.title) ?? p.title).replace(/^File:/, '');
      const artist = stripHtml(meta.Artist?.value ?? '') || '?';
      const lic = stripHtml(meta.LicenseShortName?.value ?? '');
      const c = `${artist.slice(0, 80)} · ${lic || 'licence libre'} · Wikimedia Commons`;
      credit.set(asked, c);
      credit.set(asked.replace(/ /g, '_'), c);
      credit.set(asked.replace(/_/g, ' '), c);
    }
  }
  for (const [id, f] of fileOf) photos.set(id, { url: f.thumb, credit: credit.get(f.file) ?? 'Wikimedia Commons' });
}

// ------------------------------------------------------------------ cris d'animaux
// Pour chaque animal, une recherche dans les fichiers audio de Wikimedia Commons ; on garde
// le premier enregistrement court sous licence libre. Les navigateurs qui ne lisent pas l'Ogg
// (Safari) reçoivent la version MP3 que Commons fabrique pour chaque fichier audio.
export interface Sound { url: string; mp3: string; credit: string }
const sounds = new Map<string, Sound>();
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
export const soundFor = (id: string) => sounds.get(id);
export const soundsLoaded = () => loaded.has('sounds');

export function ensureSounds(items: { id: string; q: string }[], fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<boolean> {
  return once('sounds', async () => {
    const found = await Promise.all(items.map((it) => findSound(it.q, fetcher).catch(() => null)));
    items.forEach((it, i) => { if (found[i]) sounds.set(it.id, found[i]!); });
    if (!sounds.size) throw new Error('aucun son trouvé');
  });
}

/** Adresse de la version MP3 d'un fichier audio de Commons. */
export function mp3Of(url: string): string {
  if (/\.mp3$/i.test(url)) return url;
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/([^/]+)$/);
  return m ? `${m[1]}/transcoded/${m[2]}/${m[3]}/${m[3]}.mp3` : url;
}

async function findSound(q: string, fetcher: Fetcher): Promise<Sound | null> {
  const params = new URLSearchParams({
    format: 'json', formatversion: '2', origin: '*', action: 'query', generator: 'search',
    gsrsearch: `${q} filetype:audio`, gsrnamespace: '6', gsrlimit: '8',
    prop: 'imageinfo', iiprop: 'url|size|mediatype|extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const init = { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit;
  const r = await fetcher(`${COMMONS}?${params}`, init);
  if (!r.ok) throw new Error(`Commons : ${r.status}`);
  const j = (await r.json()) as any;
  const pages = ((j.query?.pages ?? []) as any[]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii?.url || (ii.mediatype && ii.mediatype !== 'AUDIO')) continue;
    if (!/\.(ogg|oga|opus|mp3|wav|flac)$/i.test(ii.url)) continue;
    // Un cri, pas un documentaire : entre 1 et 40 secondes.
    if (ii.duration !== undefined && (ii.duration < 1 || ii.duration > 40)) continue;
    const meta = ii.extmetadata ?? {};
    const lic = stripHtml(meta.LicenseShortName?.value ?? '');
    if (!lic || /fair use|non-free/i.test(lic)) continue;
    const artist = stripHtml(meta.Artist?.value ?? '') || '?';
    return { url: ii.url, mp3: mp3Of(ii.url), credit: `${artist.slice(0, 80)} · ${lic} · Wikimedia Commons` };
  }
  return null;
}

/** Télécharge la photo (ou le son) pour la renvoyer au navigateur, sans révéler son nom. */
export async function fetchPhoto(id: string, fetcher: Fetcher = (u, i) => fetch(u, i), variant = ''): Promise<Response | null> {
  const s = sounds.get(id.replace(/^snd:/, ''));
  const url = id.startsWith('snd:') ? (s ? (variant === 'mp3' ? s.mp3 : s.url) : null) : photos.get(id)?.url;
  if (!url) return null;
  const r = await fetcher(url, { headers: { 'User-Agent': USER_AGENT }, cf: { cacheTtl: 604800, cacheEverything: true } } as RequestInit);
  return r.ok ? r : null;
}
