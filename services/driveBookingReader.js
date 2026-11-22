const { readBookingDocument } = require("./bookingDocumentService");

const MAX_PDF_BYTES = 40 * 1024 * 1024;

function serviceError(message, status = 502) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function driveIdFromUrl(value) {
    let url;
    try { url = new URL(String(value || "")); } catch { return ""; }
    if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com", "drive.usercontent.google.com"].includes(url.hostname.toLowerCase())) return "";
    return url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get("id") || "";
}

async function readBookingPdfFromDrive({ id, token, drive, supabaseUrl, anonKey, fetchImpl = fetch, readDocument = readBookingDocument }) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) throw serviceError("รหัสรายการจองไม่ถูกต้อง", 400);
    if (!token) throw serviceError("กรอกรหัสผู้ดูแลเพื่ออ่านไฟล์", 403);
    if (!drive || !supabaseUrl || !anonKey) throw serviceError("ระบบอ่านไฟล์ยังตั้งค่าไม่ครบ", 503);

    const headers = { apikey: anonKey, "x-booking-edit-token": token };
    if (anonKey.startsWith("eyJ")) headers.Authorization = `Bearer ${anonKey}`;
    let metadataResponse;
    try {
        metadataResponse = await fetchImpl(`${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/rental-admin/bookings/${encodeURIComponent(id)}/file`, { headers, signal: AbortSignal.timeout(20000) });
    } catch {
        throw serviceError("เชื่อมต่อระบบยืนยันไฟล์ไม่สำเร็จ กรุณาลองใหม่", 503);
    }
    const metadata = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok) throw serviceError(metadata.error || "ยืนยันสิทธิ์อ่านไฟล์ไม่สำเร็จ", metadataResponse.status);
    const fileId = driveIdFromUrl(metadata.url);
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw serviceError("ไม่พบรหัสไฟล์ใน Google Drive", 422);

    let pdf;
    try {
        const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream", timeout: 45000 });
        const chunks = [];
        let size = 0;
        for await (const chunk of response.data) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.length;
            if (size > MAX_PDF_BYTES) {
                response.data.destroy?.();
                throw serviceError("ไฟล์ใหญ่เกิน 40 MB", 413);
            }
            chunks.push(bytes);
        }
        pdf = Buffer.concat(chunks, size);
    } catch (error) {
        if (error.status) throw error;
        throw serviceError("ดาวน์โหลดไฟล์จาก Google Drive ไม่สำเร็จ กรุณาตรวจสิทธิ์ไฟล์แล้วลองใหม่", 502);
    }
    if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw serviceError("ไฟล์จาก Google Drive ไม่ใช่ PDF ที่อ่านได้", 422);

    let result;
    try {
        result = await readDocument(pdf);
    } catch (error) {
        throw serviceError(`อ่านข้อความใน PDF ไม่สำเร็จ: ${String(error?.message || "ข้อผิดพลาด OCR").slice(0, 180)}`, 422);
    }
    if (result?.scheduleIssue === "pickup_after_return") {
        throw serviceError("วันหรือเวลาในใบจองไม่เรียงกัน (วันคืนรถต้องอยู่หลังวันส่งรถ) ระบบไม่บันทึกวันเวลาเพื่อป้องกันคิวผิด กรุณาตรวจไฟล์ต้นฉบับ", 422);
    }
    const booking = result?.booking || {};
    const fields = {
        pickup_date: String(booking.pickupDate || ""),
        pickup_time: String(booking.pickupTime || ""),
        return_date: String(booking.returnDate || ""),
        return_time: String(booking.returnTime || ""),
    };
    const foundCount = Object.values(fields).filter(Boolean).length;
    if (!foundCount) throw serviceError("อ่านไฟล์ได้ แต่ไม่พบวันและเวลาเช่าที่ระบบรู้จัก", 422);
    return { ...fields, company: String(booking.company || ""), foundCount, usedOcrFallback: Boolean(result.usedOcrFallback), ocrFailed: Boolean(result.ocrFailed) };
}

module.exports = { readBookingPdfFromDrive, driveIdFromUrl, MAX_PDF_BYTES };
