import { createFileRoute } from "@tanstack/react-router";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSql } from "@/lib/db";
import { VIDEO_MAX_BYTES, VIDEO_TYPES, blobToken } from "@/lib/vela/video";

/**
 * Hands out short-lived upload tokens so the browser can send videos straight to
 * Vercel Blob (they are too big to pass through a server function). Only adult,
 * non-banned members get one. Needs BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob).
 */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      // Quick check in the browser: /api/upload shows whether video storage is set up.
      GET: () =>
        Response.json({
          videoStorage: blobToken() ? "eingerichtet" : "fehlt",
          hint: blobToken()
            ? undefined
            : "Vercel → Storage → Blob-Speicher mit diesem Projekt verbinden (alle Umgebungen), dann Redeploy.",
        }),
      POST: async ({ request }) => {
        const token = blobToken();
        if (!token) {
          return Response.json(
            { error: "Video-Speicher ist noch nicht eingerichtet." },
            { status: 503 },
          );
        }
        const body = (await request.json()) as HandleUploadBody;
        try {
          const result = await handleUpload({
            body,
            request,
            token,
            onBeforeGenerateToken: async (pathname) => {
              const { getSessionUser } = await import("@/lib/auth/verify.server");
              const user = await getSessionUser();
              if (!user) throw new Error("Bitte zuerst anmelden.");
              const sql = await getSql();
              const rows = await sql<{ ok: boolean }>`
                select (banned_at is null) as ok from profiles where user_id = ${user.id}
              `;
              if (!rows[0]?.ok) throw new Error("Hochladen ist für dein Konto nicht möglich.");
              if (!pathname.startsWith("videos/")) throw new Error("Ungültiger Pfad.");
              return {
                allowedContentTypes: [...VIDEO_TYPES],
                maximumSizeInBytes: VIDEO_MAX_BYTES,
                addRandomSuffix: true,
                tokenPayload: user.id,
              };
            },
          });
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Upload nicht möglich." },
            { status: 400 },
          );
        }
      },
    },
  },
});
