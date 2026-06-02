export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number | null;
  webViewLink: string;
  iconLink?: string;
}

interface RawFile {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}

// Most-recently-modified files from the user's Drive (not trashed). Needs the
// drive.metadata.readonly (or drive.readonly) scope on the OAuth consent.
export async function fetchRecentDriveFiles(accessToken: string, max = 20): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    pageSize: String(max),
    orderBy: "modifiedTime desc",
    q: "trashed = false",
    fields: "files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)",
    spaces: "drive",
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { files?: RawFile[] };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name ?? "(untitled)",
    mimeType: f.mimeType ?? "",
    modifiedTime: f.modifiedTime ?? "",
    size: f.size ? Number(f.size) : null,
    webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    iconLink: f.iconLink,
  }));
}
