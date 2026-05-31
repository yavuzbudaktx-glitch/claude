export type VaultKind = "folder" | "link" | "note" | "secret" | "file";

export interface VaultItem {
  id: string;
  parent_id: string | null;
  kind: VaultKind;
  title: string;
  url: string | null;
  body: string | null;
  secret_ciphertext: string | null;
  storage_key: string | null;
  mime: string | null;
  size: number;
  favorite: boolean;
  hidden: boolean;
  updated_at: string;
}

export function formatSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
