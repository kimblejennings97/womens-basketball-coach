// Multiple save slots in IndexedDB (a save is ~1.5-3 MB, too big for localStorage). Index of slots cached in memory.
const DB = 'wbbCoach', STORE = 'saves', ACTIVE_KEY = 'wbbCoach.active';
let db = null, index = [], writing = Promise.resolve();
export const MAX_SLOTS = 30;

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
const idbPut = (k, v) => tx('readwrite', s => s.put(v, k));
const idbGet = k => tx('readonly', s => s.get(k));
const idbDel = k => tx('readwrite', s => s.delete(k));
const queue = fn => (writing = writing.then(fn).catch(e => console.warn('save failed', e)));
const meta = G => {
  const c = G.coaches[G.user.coach], t = c.team && G.teams[c.team];
  return { id: G.slot, name: G.slotName || `${c.name} · ${t ? t.name : 'unemployed'}`, team: t ? t.id : null, tname: t ? t.name : '-', season: G.season, day: G.day, ts: Date.now() };
};
const saveIndex = () => queue(() => idbPut('index', index));

export async function initSaves() {
  try { if (typeof indexedDB === 'undefined' || !indexedDB) throw 0; db = await open(); index = (await idbGet('index')) || []; } catch (e) { db = null; index = []; }
  return index;
}
export const listSaves = () => [...index].sort((a, b) => b.ts - a.ts);
const activeSlot = () => { try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; } };
const setActive = id => { try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ } };
export async function loadLast() {
  const id = activeSlot(), m = index.find(x => x.id === id) || listSaves()[0];
  return m ? loadSlot(m.id).catch(() => null) : null;
}
export async function loadSlot(id) {
  if (!db) return null;
  const s = await idbGet(id); if (!s) return null;
  const G = JSON.parse(s); G.slot = id; setActive(id); return G;
}
export function saveGame(G) {
  if (!db) return false;
  if (!G.slot) G.slot = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const m = meta(G), i = index.findIndex(x => x.id === G.slot);
  if (i >= 0) index[i] = m; else index.push(m);
  const json = JSON.stringify(G), slot = G.slot; setActive(slot);
  queue(() => idbPut(slot, json)); saveIndex();
  return true;
}
export function deleteSlot(id) {
  index = index.filter(x => x.id !== id); saveIndex(); queue(() => idbDel(id));
  if (activeSlot() === id) setActive(null);
}
export function renameSlot(id, name) { const m = index.find(x => x.id === id); if (!m) return; m.name = name; saveIndex(); }
export const flushSaves = () => writing;
