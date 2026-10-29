import { headers, json, options, settings } from "../../../_shared.js";

function driveFileId(value = "") {
  const source = String(value);
  const pathMatch = source.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = source.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  return queryMatch ? queryMatch[1] : "";
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบไฟล์ใบจองยังตั้งค่าไม่ครบ" }, 503);
  const id = encodeURIComponent(context.params.id);
  const bookingResponse = await fetch(`${url}/rest/v1/rental_bookings?id=eq.${id}&select=drive_url,file_name,booking_no`, { headers: headers(anonKey) });
  if (!bookingResponse.ok) return json({ error: "ไม่พบรายการจอง" }, 404);
  const rows = await bookingResponse.json(), booking = Array.isArray(rows) ? rows[0] : null;
  const driveId = driveFileId(booking?.drive_url);
  if (!driveId) return json({ error: "รายการนี้ไม่มีไฟล์ PDF ที่เปิดได้" }, 422);
  const download = new URL(request.url).searchParams.get("download") === "1";
  // Drive often blocks a server-to-server download even though the same file
  // opens for the signed-in staff member in their browser.  Redirecting to
  // Drive preserves that person's existing Google permission and avoids a
  // misleading "file is not a PDF" error from our dashboard.
  const target = download
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`
    : booking.drive_url;
  return Response.redirect(target, 302);
}
