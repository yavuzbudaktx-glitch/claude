import Database from "better-sqlite3";

// Local sync state. `files` records what we last synced for each path so we can
// detect local changes (hash differs) and remote changes (version differs).
// `meta` holds the device sync cursor. SQLite (not a JSON file) so a crash
// mid-sync leaves a consistent, resumable state.
export interface FileState {
  path: string;
  hash: string;
  mtime: number;
  size: number;
  version: number;
  doc_id: string;
}

export class State {
  private db: Database.Database;

  constructor(statePath: string) {
    this.db = new Database(statePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      create table if not exists files (
        path text primary key,
        hash text not null,
        mtime integer not null,
        size integer not null,
        version integer not null,
        doc_id text not null
      );
      create table if not exists meta (key text primary key, value text not null);
    `);
  }

  getCursor(): number {
    const row = this.db.prepare("select value from meta where key = 'cursor'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : 0;
  }

  setCursor(cursor: number): void {
    this.db
      .prepare("insert into meta(key, value) values('cursor', ?) on conflict(key) do update set value = ?")
      .run(String(cursor), String(cursor));
  }

  get(path: string): FileState | undefined {
    return this.db.prepare("select * from files where path = ?").get(path) as FileState | undefined;
  }

  all(): FileState[] {
    return this.db.prepare("select * from files").all() as FileState[];
  }

  put(f: FileState): void {
    this.db
      .prepare(
        `insert into files(path, hash, mtime, size, version, doc_id)
         values(@path, @hash, @mtime, @size, @version, @doc_id)
         on conflict(path) do update set
           hash = @hash, mtime = @mtime, size = @size, version = @version, doc_id = @doc_id`,
      )
      .run(f);
  }

  remove(path: string): void {
    this.db.prepare("delete from files where path = ?").run(path);
  }
}
