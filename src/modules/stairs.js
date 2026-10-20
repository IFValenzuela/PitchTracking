// Staircase persistence shared by Pitch Lab, Gym and Eye Check.
import { app } from '../app.js';
import { createStaircase, updateStaircase, resumeStaircase } from '../engine/staircase.js';

export class StairBank {
  constructor(defaults = {}) {
    this.defaults = defaults;
    this.cache = new Map();
    this.loadedAt = new Map();
  }

  async get(key, opts = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const row = await app.repo.db.get('staircases', key);
    let s;
    if (row?.state) {
      const idleDays = (Date.now() - (row.updatedAt || Date.now())) / 86400000;
      s = resumeStaircase(row.state, { idleDays });
    } else s = createStaircase({ ...this.defaults, ...opts });
    this.cache.set(key, s);
    this.loadedAt.set(key, s.level);
    return s;
  }

  async update(key, correct) {
    const s = updateStaircase(await this.get(key), correct);
    this.cache.set(key, s);
    await app.repo.saveStaircase(key, s);
    return s;
  }

  startLevel(key) { return this.loadedAt.get(key); }
}
