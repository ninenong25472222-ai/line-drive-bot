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

function driveStatus(error) {
    return Number(error?.response?.status || error?.code || error?.status || 0);
}

async function downloadPublicDrivePdf(fileId, fetchImpl) {
    const urls = [
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`,
    ];
    for (const url of urls) {
        try {
            const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(45000) });
            if (!response.ok) continue;
            const announcedSize = Number(response.headers?.get?.("content-length") || 0);
            if (announcedSize > MAX_PDF_BYTES) throw serviceError("ไฟล์ใหญ่เกิน 40 MB", 413);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > MAX_PDF_BYTES) throw serviceError("ไฟล์ใหญ่เกิน 40 MB", 413);
            if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return bytes;
        } catch (error) {
            if (error.status) throw error;
        }
    }
    return null;
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
        // Files shared as "anyone with the link" may be downloadable even when
        // Drive API metadata lookup is hidden from the OAuth account. Try the
        // public download endpoints before declaring the source unavailable.
        pdf = await downloadPublicDrivePdf(fileId, fetchImpl);
        if (!pdf) {
            const status = driveStatus(error);
            if (status === 404 || status === 403) {
                throw serviceError("ไม่พบไฟล์ต้นฉบับใน Google Drive หรือบัญชีบอตไม่มีสิทธิ์เข้าถึง (Drive " + status + "). ตรวจว่าไฟล์ยังอยู่และเปิดสิทธิ์ให้บัญชีบอตหรือเปิดลิงก์ได้ แล้วลองใหม่", status);
            }
            throw serviceError("ดาวน์โหลดไฟล์จาก Google Drive ไม่สำเร็จ กรุณาตรวจสิทธิ์ไฟล์แล้วลองใหม่", 502);
        }
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
        customer_name: String(booking.customerName || booking.renter || "").trim(),
    };
    const foundCount = Object.values(fields).filter(Boolean).length;
    if (!foundCount) throw serviceError("อ่านไฟล์ได้ แต่ไม่พบชื่อลูกค้าหรือวันและเวลาเช่าที่ระบบรู้จัก", 422);
    return { ...fields, company: String(booking.company || ""), foundCount, usedOcrFallback: Boolean(result.usedOcrFallback), ocrFailed: Boolean(result.ocrFailed) };
}

module.exports = { readBookingPdfFromDrive, driveIdFromUrl, downloadPublicDrivePdf, MAX_PDF_BYTES };
