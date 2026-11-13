// Aperçu des liens partagés (WhatsApp, réseaux) : un défi /defi/CODE montre qui défie, sur quel jeu,
// et le score à battre, au lieu de la description générale du site.
import fr from '../client/locales/fr.json';
import { revName } from '../shared/school';
import type { ChallengeEntry, Settings } from '../shared/protocol';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gameName = (cat: string) => (fr as Record<string, string>)[`cat.${cat}`] ?? revName(cat) ?? 'Quizellige';

export function challengeMeta(d: { settings: Settings; by: string; first: ChallengeEntry }, code: string, origin: string) {
  const who = (d.by || d.first?.name || 'Un ami').slice(0, 24);
  const score = d.first ? `${d.first.correct}/${d.first.total}` : '';
  return {
    title: `${who} te défie${score ? ` : ${score}` : ''} · ${gameName(d.settings.category)}`,
    description: `Fais mieux que ${who} sur Quizellige ! Mêmes questions, à toi de jouer. Gratuit, sans installation.`,
    url: `${origin}/defi/${code}`,
  };
}

/** Remplace le titre, la description et l'adresse de la page d'accueil. */
export function withMeta(html: string, m: { title: string; description: string; url: string }): string {
  const t = esc(m.title), d = esc(m.description), u = esc(m.url);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${t}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${u}`);
}
