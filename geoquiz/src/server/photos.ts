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
let loaded = false;
let loading: Promise<boolean> | null = null;

export const photosLoaded = () => loaded;
export const photoFor = (id: string) => photos.get(id);
/** Pour les tests. */
export function resetPhotos() { photos.clear(); loaded = false; loading = null; }

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

async function api(fetcher: Fetcher, params: Record<string, string>) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  const init = { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit;
  const r = await fetcher(`${API}?${q}`, init);
  if (!r.ok) throw new Error(`Wikipédia : ${r.status}`);
  return (await r.json()) as any;
}

/** Charge les photos (une seule fois par instance). Renvoie faux si Wikipédia ne répond pas. */
export function ensurePhotos(items: { id: string; wiki: string }[], fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  loading ??= load(items, fetcher).then(
    () => { loaded = true; return true; },
    (e) => { console.error('photos', e); loading = null; return false; },
  );
  return loading;
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

/** Télécharge la photo pour la renvoyer au navigateur (sans révéler son nom). */
export async function fetchPhoto(id: string, fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<Response | null> {
  const p = photos.get(id);
  if (!p) return null;
  const r = await fetcher(p.url, { headers: { 'User-Agent': USER_AGENT }, cf: { cacheTtl: 604800, cacheEverything: true } } as RequestInit);
  return r.ok ? r : null;
}
