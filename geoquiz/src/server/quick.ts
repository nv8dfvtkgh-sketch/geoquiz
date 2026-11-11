// Partie rapide : file d'attente qui associe deux joueurs au hasard dans un nouveau duel.
import type { ClientMsg, Settings } from '../shared/protocol';
import type { Conn } from './rooms';
import { validSettings } from './rooms';

export class QuickQueue {
  waiting: { conn: Conn; settings: Settings }[] = [];

  /** createDuel : crée la salle (en mémoire ou Durable Object) et renvoie son code. */
  constructor(private createDuel: (settings: Settings) => Promise<string> | string) {}

  async handle(conn: Conn, msg: ClientMsg) {
    if (msg.t === 'quick') {
      const settings = validSettings(msg.settings);
      if (!settings) return conn.send({ t: 'error', code: 'settings.invalid' });
      this.remove(conn);
      const other = this.waiting.shift();
      if (!other) {
        this.waiting.push({ conn, settings });
        return conn.send({ t: 'quickWaiting' });
      }
      const code = await this.createDuel(other.settings);
      other.conn.send({ t: 'matched', code });
      conn.send({ t: 'matched', code });
    } else if (msg.t === 'cancelQuick' || msg.t === 'leave') {
      this.remove(conn);
    } else if (msg.t === 'ping') {
      conn.send({ t: 'pong' });
    }
  }

  remove(conn: Conn) {
    this.waiting = this.waiting.filter((w) => w.conn !== conn);
  }
}
