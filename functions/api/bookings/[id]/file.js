import { corsHeaders, headers, json, options, settings } from "../../../_shared.js";

function driveFileId(value = "") {
  const source = String(value);
  const pathMatch = source.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = source.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  return queryMatch ? queryMatch[1] : "";
}

function fileName(value = "") {
  return (String(value || "booking").replace(/[^a-zA-Z0-9ก-๙._-]+/g, "-").replace(/\.pdf$/i, "").slice(0, 80) || "booking") + ".pdf";
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
  const source = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`);
  if (!source.ok) return json({ error: "ดาวน์โหลดไฟล์ใบจองไม่สำเร็จ" }, 502);
  // Google Drive can label a real PDF as application/octet-stream. Validate
  // the file signature instead, so valid bookings are not rejected.
  const file = new Uint8Array(await source.arrayBuffer());
  const isPdf = file.length >= 4 && String.fromCharCode(...file.slice(0, 4)) === "%PDF";
  if (!isPdf) return json({ error: "ไฟล์ต้นฉบับไม่ใช่ PDF ที่เปิดได้" }, 422);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = fileName(booking.file_name || booking.booking_no);
  return new Response(file, { headers: { ...corsHeaders, "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "x-content-type-options": "nosniff" } });
}
