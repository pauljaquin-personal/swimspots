import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
// Loopback development only. Atomic replacement and serialized mutations survive restarts.
export class LocalSubmissions {
  constructor(path) {
    this.path = path;
    this.pending = Promise.resolve();
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return { records: [], limits: {} };
      throw e;
    }
  }
  async change(fn) {
    const task = this.pending.then(async () => {
      const state = await this.read();
      const result = fn(state);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(state), {
        mode: 0o600,
      });
      await rename(this.path + ".tmp", this.path);
      return result;
    });
    this.pending = task.catch(() => {});
    return task;
  }
  async get(id) {
    await this.pending;
    return (await this.read()).records.find((r) => r.id === id) || null;
  }
  async list(status) {
    await this.pending;
    return (await this.read()).records
      .filter((r) => r.status === status)
      .reverse()
      .slice(0, 500);
  }
  async insert(r) {
    return this.change((s) => {
      const old = s.records.find((x) => x.id === r.id);
      if (old) return old;
      s.records.push(r);
      return r;
    });
  }
  async review(id, status, data, note, reviewedAt) {
    return this.change((s) => {
      const r = s.records.find((x) => x.id === id);
      if (!r || r.status !== "pending") return false;
      Object.assign(r, { status, data, note, reviewedAt });
      return true;
    });
  }
  async quota(key, bucket) {
    return this.change((s) => {
      for (const k of Object.keys(s.limits))
        if (!k.startsWith(bucket + ":")) delete s.limits[k];
      const k = bucket + ":" + key;
      s.limits[k] = (s.limits[k] || 0) + 1;
      return s.limits[k] <= 5;
    });
  }
}
