import { uploadFolderProject } from "@/lib/projects";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * POST /api/projects/upload — a folder picked in the browser.
 *
 * A route handler, not a server action, on purpose: server actions have a body
 * size limit, and a real code folder is far larger than that. Files arrive as
 * multipart `files[]` with a matching `paths[]` list (the browser's
 * `webkitRelativePath` can't be sent by itself); `name` is the folder's name.
 *
 * Everything is owner-checked here and written by `uploadFolderProject`, which
 * skips binaries, dependency folders, `.env`, `.git` and key material, and caps
 * the total. Nothing is executed.
 */

export const runtime = "nodejs";
/** A big folder takes a moment to write; let the platform allow it. */
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Sign in again to upload a folder." }, { status: 401 });
  }

  const profile = await ensureUserRecord(user);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "That upload couldn't be read." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "");
  const paths = form.getAll("paths").map((value) => String(value));
  const files = form.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return Response.json({ ok: false, error: "That folder had no files to upload." }, { status: 400 });
  }

  const entries = await Promise.all(
    files.map(async (file, index) => ({
      path: paths[index] ?? file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  try {
    const result = await uploadFolderProject(profile.id, name, entries);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[projects] upload route failed", error);
    return Response.json({ ok: false, error: "We couldn't save that folder." }, { status: 500 });
  }
}
