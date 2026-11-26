require("dotenv").config();

const { readBookingDocument } = require("./services/bookingDocumentService");
const { readBookingPdfFromDrive } = require("./services/driveBookingReader");
const { savePartnerUpload } = require("./services/rentalProService");
const { syncAppSheetBookings } = require("./services/appSheetSyncService");
const { repairAppSheetPdfLinks } = require("./services/appSheetPdfLinkService");
const { syncCombinedSpreadsheet } = require("./services/combinedSheetService");
const { queueExpiredBookings } = require("./services/bookingLifecycleService");
const { claimLineEvent, finishLineEvent } = require("./services/lineEventReceiptService");
const { enqueueSyncJob, updateSyncState, updateDriveSharingAudit, nextSyncJobs, setSyncJob, claimSyncJob } = require("./services/syncJobService");
const {
    getEventGroupId,
    getAllowedSourceGroupIds,
    isAllowedSourceGroup,
    canSendToDestination
} = require("./services/lineRouting");

const express = require("express");
const { messagingApi, middleware } = require("@line/bot-sdk");
const { downloadLineFile, lineFileErrorMessage } = require("./services/lineFileService");
const { google } = require("googleapis");
const stream = require("stream");
const crypto = require("crypto");

const app = express();
const maxLineFileBytes = Math.min(
    Math.max(Number(process.env.MAX_LINE_FILE_BYTES) || 25 * 1024 * 1024, 1024 * 1024),
    50 * 1024 * 1024
);

// ============================
// LINE CONFIG
// ============================

const lineConfig = {
    channelSecret: process.env.CHANNEL_SECRET
};

const client =
    new messagingApi.MessagingApiClient({
        channelAccessToken:
            process.env.CHANNEL_ACCESS_TOKEN
    });

// ============================
// GOOGLE CONFIG
// ============================

const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
    refresh_token:
        process.env.GOOGLE_REFRESH_TOKEN
});

// ============================
// HELPER
// ============================

function cleanText(value = "") {
    return String(value)
        .replace(/\u0000/g, "")
        .replace(/\u00A0/g, " ")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/[\r\n]+/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim();
}

function formatDate(value = "") {
    const date = cleanText(value);

    return date || "-";
}

function shortText(
    value = "",
    maximumLength = 80
) {
    const text = cleanText(value);

    if (!text) {
        return "-";
    }

    if (text.length <= maximumLength) {
        return text;
    }

    return `${text.slice(
        0,
        maximumLength
    )}...`;
}

// ============================
// LINE GROUP ROUTING
// ============================

function getLineSpreadsheetId() { return cleanText(process.env.GOOGLE_SHEET_ID || ""); }
function getAppSheetSpreadsheetId() { return cleanText(process.env.APPSHEET_SPREADSHEET_ID || ""); }
function getCombinedSpreadsheetId() { return cleanText(process.env.COMBINED_SPREADSHEET_ID || ""); }

async function sendResultMessage(event, text) {
    const destinationGroupId =
        cleanText(
            process.env.DESTINATION_GROUP_ID ||
            ""
        );

    const sourceGroupId =
        getEventGroupId(event);

    if (canSendToDestination(event, destinationGroupId)) {
        try {
            await client.pushMessage({
                to: destinationGroupId,
                messages: [
                    {
                        type: "text",
                        text
                    }
                ]
            });

            console.log("LINE_RESULT_SENT_TO_DESTINATION_GROUP");
            return;
        } catch (error) {
            console.error("LINE_RESULT_DESTINATION_PUSH_FAILED", error?.response?.status || error?.code || "unknown_error");
        }
    }

    // Keep customer details and Drive links out of the source group. When the
    // destination is missing or cannot receive messages, return only a generic
    // notice while the LINE reply token is still available instead of failing
    // silently.
    if (event?.replyToken) {
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: "text",
                text: "⚠️ ระบบรับไฟล์แล้ว แต่ส่งผลการประมวลผลไปยังกลุ่มปลายทางไม่ได้ กรุณาแจ้งผู้ดูแลให้ตรวจสอบการตั้งค่ากลุ่ม LINE"
            }]
        });
        console.warn("LINE_RESULT_ROUTING_FALLBACK_SENT", {
            hasDestinationGroup: Boolean(destinationGroupId),
            matchesSourceGroup: Boolean(destinationGroupId && destinationGroupId === sourceGroupId)
        });
        return;
    }

    console.error(
        "LINE_RESULT_NOT_SENT_NO_REPLY_TOKEN",
        {
            hasDestinationGroup: Boolean(destinationGroupId),
            matchesSourceGroup: Boolean(
                destinationGroupId &&
                destinationGroupId === sourceGroupId
            )
        }
    );
}

async function queueSyncRetry({ target, booking, fileName, fileHash, driveFileId, driveUrl, sheetTitle, eventId }) {
    const payload = { booking, fileName, fileHash, driveFileId, driveUrl, sheetTitle };
    try {
        const queued = await enqueueSyncJob({ target, idempotencyKey: `${target}:${fileHash}`, payload, eventId });
        if (!queued) throw new Error("SYNC_QUEUE_NOT_CONFIGURED");
        await updateSyncState({ fileHash, target, state: "queued", error: "รอลองซิงก์อัตโนมัติ" });
        console.warn("SYNC_RETRY_QUEUED", { target, fileHash: String(fileHash || "").slice(0, 10) });
        return true;
    } catch (error) {
        console.error("SYNC_RETRY_QUEUE_FAILED", target, error?.response?.status || error?.code || "unknown_error");
        await updateSyncState({ fileHash, target, state: "failed", error: error?.response?.status || error?.code || error?.message || "ไม่สามารถเพิ่มงานเข้าคิวลองซ้ำได้" }).catch(() => {});
        return false;
    }
}

async function ensureSheetTab(
    sheets,
    spreadsheetId,
    title
) {
    const sheetInfo =
        await sheets.spreadsheets.get({
            spreadsheetId,

            fields:
                "sheets(properties(sheetId,title))"
        });

    const existingSheet =
        (sheetInfo.data.sheets || [])
            .find(
                (sheet) =>
                    sheet.properties?.title ===
                    title
            );

    if (
        existingSheet?.properties?.sheetId !==
        undefined
    ) {
        return existingSheet.properties.sheetId;
    }

    let createdSheet;

    try {
        const created =
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,

                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title
                                }
                            }
                        }
                    ]
                }
            });

        createdSheet =
            created.data.replies?.[0]
                ?.addSheet?.properties;
    } catch (error) {
        // Another event may create the tab at the same time.
        if (error?.response?.status !== 400) {
            throw error;
        }
    }

    const finalSheetInfo =
        await sheets.spreadsheets.get({
            spreadsheetId,

            fields:
                "sheets(properties(sheetId,title))"
        });

    const finalSheet =
        (finalSheetInfo.data.sheets || [])
            .find(
                (sheet) =>
                    sheet.properties?.title ===
                    title
            );

    const sheetId =
        createdSheet?.sheetId ??
        finalSheet?.properties?.sheetId;

    if (sheetId === undefined) {
        throw new Error(
            `SHEET_TAB_CREATE_FAILED:${title}`
        );
    }

    // Reuse the Booking header so both tabs have the same layout.
    const bookingHeader =
        await sheets.spreadsheets.values.get({
            spreadsheetId,

            range:
                "Booking!A1:N1"
        });

    if (
        (bookingHeader.data.values || [])
            .length
    ) {
        await sheets.spreadsheets.values.update({
            spreadsheetId,

            range:
                `${title}!A1:N1`,

            valueInputOption:
                "RAW",

            requestBody: {
                values:
                    bookingHeader.data.values
            }
        });
    }

    return sheetId;
}

async function backfillSheetRowIfMissing({
    sheets,
    spreadsheetId,
    sheetTitle,
    booking,
    fileName,
    link
}) {
    const existingRows =
        await sheets.spreadsheets.values.get({
            spreadsheetId,

            range:
                `${sheetTitle}!A2:N`
        });

    const normalizedFileName =
        cleanText(fileName).toLowerCase();

    const normalizedLink =
        cleanText(link);

    const alreadyInSheet =
        (existingRows.data.values || [])
            .some((row) => {
                const rowFileName =
                    cleanText(row?.[12]).toLowerCase();

                const rowLink =
                    cleanText(row?.[13]);

                return (
                    rowLink === normalizedLink ||
                    rowFileName === normalizedFileName
                );
            });

    if (alreadyInSheet) {
        console.log(
            `SHEET_BACKFILL: already exists in ${sheetTitle}`
        );

        return false;
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId,

        range:
            `${sheetTitle}!A:N`,

        valueInputOption:
            "USER_ENTERED",

        requestBody: {
            values: [[
                new Date()
                    .toISOString(),

                booking.company,

                booking.bookingNo,

                booking.customerName,

                booking.customerPhone,

                booking.pickupDate,

                booking.pickupTime,

                booking.pickupLocation,

                booking.returnDate,

                booking.returnTime,

                booking.returnLocation,

                booking.car,

                fileName,

                link
            ]]
        }
    });

    console.log(
        `SHEET_BACKFILL: added missing row to ${sheetTitle}`
    );

    return true;
}

async function syncLineBookingToAppSheet({ booking, fileHash, fileName, driveUrl }) {
    const spreadsheetId = getAppSheetSpreadsheetId();
    if (!spreadsheetId) {
        console.warn("APPSHEET_LINE_SYNC_SKIPPED: AppSheet spreadsheet is not configured");
        return { skipped: true };
    }
    if (!booking?.customerName || !booking?.pickupDate || !booking?.returnDate) {
        console.log("APPSHEET_LINE_SYNC_SKIPPED: incomplete booking data");
        return { skipped: true };
    }
    try {
        const sheetTitle = process.env.APPSHEET_BOOKING_SHEET || "Bookings";
        const sheets = google.sheets({ version: "v4", auth });
        const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetTitle + "!A:Z" });
        const [headers = [], ...rows] = result.data.values || [];
        const normalize = (value) => String(value ?? "").toLowerCase().replace(/[\s_\-./()]+/g, "").trim();
        const findColumn = (candidates) => headers.findIndex((header) => candidates.some((candidate) => normalize(header) === normalize(candidate) || normalize(header).includes(normalize(candidate))));
        const idIndex = findColumn(["BookingID", "ID"]);
        const requiredColumns = [["bookingsource", "ประเภทบุกกิง"], ["customername", "ชื่อลูกค้า"], ["pickupdate", "วันส่งรถ", "วันที่รับรถ"], ["returndate", "วันคืนรถ", "วันที่คืนรถ"]];
        if (idIndex < 0 || requiredColumns.some((candidates) => findColumn(candidates) < 0)) throw new Error("APPSHEET_BOOKINGS_SCHEMA_MISMATCH");
        const bookingId = String(fileHash || "").slice(0, 8);
        if (!bookingId) throw new Error("APPSHEET_LINE_SYNC_MISSING_FILE_HASH");
        const existingIndex = rows.findIndex((row) => String(row[idIndex] ?? "").trim() === bookingId);
        if (existingIndex >= 0) {
            const targetIndexes = Array.from(new Set([findColumn(["Link", "URL", "Drive URL"]), findColumn(["Booking_PDF", "Booking PDF", "PDF File", "ไฟล์ใบจอง"])].filter((index) => index >= 0)));
            const data = targetIndexes.filter((index) => driveUrl && !cleanText(rows[existingIndex]?.[index])).map((index) => {
                let column = "";
                for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) column = String.fromCharCode(65 + ((n - 1) % 26)) + column;
                return { range: `${sheetTitle}!${column}${existingIndex + 2}`, values: [[driveUrl]] };
            });
            if (data.length) {
                await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
                console.log("APPSHEET_LINE_SYNC: repaired file link");
            }
            console.log("APPSHEET_LINE_SYNC: duplicate");
            return { ok: true, duplicate: true };
        }
        const values = Array(headers.length).fill("");
        const set = (candidates, value) => { const index = findColumn(candidates); if (index >= 0) values[index] = value ?? ""; };
        set(["BookingID", "ID"], bookingId);
        set(["bookingsource", "ประเภทบุกกิง"], "LIne");
        set(["customername", "ชื่อลูกค้า"], booking.customerName || booking.renter);
        set(["tel", "phone", "เบอร์โทร"], booking.customerPhone || booking.phone);
        set(["carref", "รถที่เลือก", "รถ"], booking.car);
        set(["pickupdate", "วันส่งรถ", "วันที่รับรถ"], booking.pickupDate);
        set(["pickuptime", "เวลาส่งรถ", "เวลารับรถ"], booking.pickupTime);
        set(["returndate", "วันคืนรถ", "วันที่คืนรถ"], booking.returnDate);
        set(["returntime", "เวลาคืนรถ"], booking.returnTime);
        set(["pickuplocation", "สถานที่ส่ง", "จุดรับรถ"], booking.pickupLocation);
        set(["returnlocation", "สถานที่คืน", "จุดคืนรถ"], booking.returnLocation);
        // AppSheet's “Open Url (Link)” action reads Link.  Keep the optional
        // Booking_PDF column in sync if this sheet also has it.
        set(["Link", "URL", "Drive URL"], driveUrl);
        set(["Booking_PDF", "Booking PDF", "PDF File", "ไฟล์ใบจอง"], driveUrl);
        set(["notes", "หมายเหตุ"], [booking.bookingNo ? "เลขจอง: " + booking.bookingNo : "", fileName || "", driveUrl || ""].filter(Boolean).join(" | "));
        let endColumn = "";
        for (let n = headers.length; n > 0; n = Math.floor((n - 1) / 26)) endColumn = String.fromCharCode(65 + ((n - 1) % 26)) + endColumn;
        await sheets.spreadsheets.values.append({ spreadsheetId, range: sheetTitle + "!A:" + endColumn, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
        console.log("APPSHEET_LINE_SYNC: added booking");
        return { ok: true };
    } catch (error) {
        console.error("APPSHEET_LINE_SYNC_ERROR", error?.response?.status || error?.code || "unknown_error");
        return { ok: false, error: error?.code || error?.response?.status || "appsheet_sync_failed" };
    }
}

// ============================
// WEBHOOK
// ============================

app.post(
    "/webhook",

    middleware(lineConfig),

    async (req, res) => {
        try {
            const events =
                Array.isArray(
                    req.body.events
                )
                    ? req.body.events
                    : [];

            // Process a LINE batch in order so large file downloads do not
            // multiply memory use without bound.
            for (const event of events) {
                const eventId = cleanText(event?.webhookEventId || "");
                const messageId = cleanText(event?.message?.id || "");
                const fileName = cleanText(event?.message?.fileName || "");
                if (eventId) {
                    try {
                        const receipt = await claimLineEvent({ eventId, messageId, fileName });
                        if (!receipt.claimed) {
                            console.log("LINE_DUPLICATE_EVENT_IGNORED");
                            continue;
                        }
                        if (!receipt.tracked) console.warn("LINE_EVENT_IDEMPOTENCY_UNAVAILABLE", receipt.reason);
                    } catch (receiptError) {
                        // Do not drop a legitimate customer upload during a brief database outage.
                        // Drive content hashing remains a secondary duplicate safeguard.
                        console.error("LINE_EVENT_RECEIPT_CLAIM_FAILED", receiptError?.response?.status || receiptError?.code || "unknown_error");
                    }
                }
                const processed = await handleEvent(event);
                if (eventId) {
                    try {
                        await finishLineEvent({ eventId, state: processed ? "processed" : "failed", error: processed ? "" : "processing_failed" });
                    } catch (receiptError) {
                        console.error("LINE_EVENT_RECEIPT_FINALIZE_FAILED", receiptError?.response?.status || receiptError?.code || "unknown_error");
                    }
                }
            }

            res.sendStatus(200);
        } catch (error) {
            console.error(
                "WEBHOOK ERROR:",
                error?.response?.status || error?.code || "unknown_error"
            );

            res.sendStatus(500);
        }
    }
);

// ============================
// HANDLE LINE EVENT
// ============================

async function handleEvent(event) {
    let replied = false;
    let parseWarning = false;
    let rentalProSyncFailed = false;
    let syncPending = false;
    let drivePublic = true;
    const allowedSourceGroupOptions = {
        includeLegacyTestGroup: !cleanText(process.env.SOURCE_GROUP_IDS || "")
    };

    try {
        console.log(
            "LINE_EVENT_SOURCE:",
            event?.source?.type || "unknown",
            "groupId:",
            getEventGroupId(event) || "none",
            "groupConfigured:",
            isAllowedSourceGroup(event, process.env.SOURCE_GROUP_IDS || process.env.SOURCE_GROUP_ID, allowedSourceGroupOptions)
        );

        if (!isAllowedSourceGroup(
            event,
            process.env.SOURCE_GROUP_IDS || process.env.SOURCE_GROUP_ID,
            allowedSourceGroupOptions
        )) {
            console.log("IGNORED_FILE_FROM_UNCONFIGURED_GROUP", {
                sourceType: event?.source?.type || "unknown",
                hasGroupId: Boolean(getEventGroupId(event)),
                fileName: cleanText(event?.message?.fileName || "").slice(0, 100) || undefined
            });

            return true;
        }

        if (
            event.type !== "message" ||
            event.message.type !== "file"
        ) {
            return true;
        }

        const messageId =
            event.message.id;

        const fileName =
            cleanText(
                event.message.fileName ||
                `file-${messageId}`
            );

        if (Number(event.message.fileSize) > maxLineFileBytes) {
            throw new Error("LINE_FILE_TOO_LARGE");
        }

        // ============================
        // DOWNLOAD FILE FROM LINE
        // ============================

        const downloaded = await downloadLineFile({
            messageId,
            accessToken: process.env.CHANNEL_ACCESS_TOKEN,
            maxBytes: maxLineFileBytes,
            fileName,
            onRetry: ({ attempt, status, code }) => console.warn("LINE_FILE_DOWNLOAD_RETRY", { attempt, status: status || undefined, code: code || undefined })
        });
        const buffer = downloaded.buffer;

        // ============================
        // READ AND PARSE PDF
        // ============================

        let booking = {
            company: "Other"
        };

        if (
            fileName
                .toLowerCase()
                .endsWith(".pdf")
        ) {
            try {
                const document = await readBookingDocument(buffer);
                const text = document.text;
                booking = document.booking || { company: "Other" };
                console.log("PDF_BOOKING_READ_RESULT", {
                    usedOcrFallback: document.usedOcrFallback,
                    completeDateTime: Boolean(booking.pickupDate && booking.pickupTime && booking.returnDate && booking.returnTime),
                    scheduleIssue: document.scheduleIssue || undefined
                });
                if (document.scheduleIssue) parseWarning = true;
                if (String(booking.company || "").toLowerCase() === "other" &&
                    /(?:pick\s*up|drop\s*off|return|รับรถ|คืนรถ|วันส่งรถ|วันคืนรถ)/i.test(text) &&
                    /\d{1,2}:\d{2}/.test(text)) {
                    parseWarning = true;
                }
                if (booking.company && String(booking.company).toLowerCase() !== "other" &&
                    (!booking.pickupDate || !booking.pickupTime || !booking.returnDate || !booking.returnTime)) {
                    parseWarning = true;
                }
            } catch (parseError) {
                // Preserve source files for manual review if extraction fails.
                parseWarning = true;
                booking = { company: "Other" };
                console.warn("PDF_PARSE_FAILED; preserving original for review");
            }
        }

        // ============================
        // CLEAN BOOKING DATA
        // ============================

        booking.company =
            cleanText(
                booking.company ||
                "Other"
            ) || "Other";

        booking.bookingNo =
            cleanText(
                booking.bookingNo || ""
            );

        booking.customerName =
            cleanText(
                booking.customerName ||
                booking.renter ||
                ""
            );

        booking.renter =
            booking.customerName;

        booking.customerPhone =
            cleanText(
                booking.customerPhone ||
                booking.phone ||
                ""
            );

        booking.phone =
            booking.customerPhone;

        booking.customerEmail =
            cleanText(
                booking.customerEmail ||
                ""
            );

        booking.pickupDate =
            cleanText(
                booking.pickupDate ||
                ""
            );

        booking.pickupTime =
            cleanText(
                booking.pickupTime ||
                ""
            );

        booking.pickupLocation =
            cleanText(
                booking.pickupLocation ||
                ""
            );

        booking.returnDate =
            cleanText(
                booking.returnDate ||
                ""
            );

        booking.returnTime =
            cleanText(
                booking.returnTime ||
                ""
            );

        booking.returnLocation =
            cleanText(
                booking.returnLocation ||
                ""
            );

        booking.car =
            cleanText(
                booking.car || ""
            );

        // LINE/partner uploads need a human check on the error-prone OCR fields.
        booking.ocrReviewStatus = "pending";

// ============================
// UPLOAD TO GOOGLE DRIVE
// ============================

const drive = google.drive({
    version: "v3",
    auth
});

// อ่าน Folder ID จาก Railway

const bookingFolderId = cleanText(
    process.env.GOOGLE_DRIVE_FOLDER_ID || ""
);

const otherFolderId = cleanText(
    process.env.GOOGLE_OTHER_FOLDER_ID || ""
);

// ตรวจว่าตั้งค่าครบหรือไม่

if (!bookingFolderId) {
    throw new Error(
        "GOOGLE_DRIVE_FOLDER_ID_EMPTY"
    );
}

if (!otherFolderId) {
    throw new Error(
        "GOOGLE_OTHER_FOLDER_ID_EMPTY"
    );
}

// ป้องกันใส่ Folder ID เดียวกันโดยไม่ตั้งใจ

if (
    bookingFolderId ===
    otherFolderId
) {
    throw new Error(
        "BOOKING_AND_OTHER_FOLDER_ARE_SAME"
    );
}

// ส่งเข้าโฟลเดอร์จองรถ
// เฉพาะ 4 บริษัทที่ระบบรู้จักเท่านั้น

const companyKey = cleanText(
    booking.company || ""
).toLowerCase();

const bookingCompanies = new Set([
    "trip",
    "klook",
    "reservation",
    "chiccar",
    "jiraporn"
]);

const isBookingFile =
    bookingCompanies.has(
        companyKey
    );

// เลือก Folder ID

const targetFolderId =
    isBookingFile
        ? bookingFolderId
        : otherFolderId;

const targetFolderName =
    isBookingFile
        ? "Booking"
        : "Other";

const fileHash =
    crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

console.log("File hash computed");

// แสดง Log โดยไม่เปิดเผย Folder ID เต็ม

console.log("Drive destination:", {
    company:
        booking.company || "Other",

    destination:
        targetFolderName,

    bookingFolderLast6:
        bookingFolderId.slice(-6),

    otherFolderLast6:
        otherFolderId.slice(-6),

    targetFolderLast6:
        targetFolderId.slice(-6)
});

const mimeType =
    downloaded.contentType ||
    "application/octet-stream";

async function ensureDriveLinkAccess(drive, fileId) {
    try {
        const listed = await drive.permissions.list({ fileId, fields: "permissions(id,type,role)", supportsAllDrives: true });
        const current = (listed.data.permissions || []).find((permission) => permission.type === "anyone" && permission.role === "reader");
        if (current) return { public: true, error: "", permissionId: current.id };
        const created = await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: "reader", type: "anyone" },
            fields: "id"
        });
        console.log("DRIVE_LINK_SHARING_POLICY_APPLIED", { fileIdPrefix: String(fileId).slice(0, 8), access: "anyone_with_link_viewer" });
        return { public: true, error: "", permissionId: created.data?.id };
    } catch (error) {
        console.error(
            "DRIVE_PUBLIC_PERMISSION_ERROR:",
            error?.response?.data || error?.message || error
        );
        return {
            public: false,
            error: error?.response?.data?.error?.message || error?.message ||
                "Google Drive ไม่อนุญาตให้เปิดลิงก์สาธารณะ"
        };
    }
}

// ตรวจไฟล์ซ้ำจากเนื้อไฟล์จริงในโฟลเดอร์ปลายทาง
let duplicateFile = null;

try {
    const duplicateResult =
        await drive.files.list({
            q:
                `'${targetFolderId}' in parents and ` +
                "trashed = false and " +
                "appProperties has { key = 'contentHash' " +
                `and value = '${fileHash}' }`,

            spaces: "drive",

            pageSize: 1,

            fields:
                "files(id,name,createdTime)"
        });

    duplicateFile =
        duplicateResult.data.files?.[0] ||
        null;
} catch (duplicateError) {
    console.error(
        "DUPLICATE_CHECK_ERROR",
        duplicateError?.response?.status || duplicateError?.code || "unknown_error"
    );
}

if (duplicateFile?.id) {
    const duplicateAccess = await ensureDriveLinkAccess(drive, duplicateFile.id);
    drivePublic = duplicateAccess.public;
    const duplicateLink =
        `https://drive.google.com/file/d/${duplicateFile.id}/view`;

    // A previous run may have uploaded the file to Drive and recorded it in
    // RentalPro, but failed before appending the row to Google Sheets.
    // Backfill only when the file is not already present in the target tab.
    try {
        const sheets =
            google.sheets({
                version: "v4",
                auth
            });

        const sheetTitle =
            isBookingFile
                ? "Booking"
                : "Other";

        await ensureSheetTab(
            sheets,

            process.env
                .GOOGLE_SHEET_ID,

            sheetTitle
        );

        await backfillSheetRowIfMissing({
            sheets,
            spreadsheetId:
                process.env
                    .GOOGLE_SHEET_ID,
            sheetTitle,
            booking,
            fileName,
            link: duplicateLink
        });
        await updateSyncState({ fileHash, target: "google_sheets", state: "succeeded" }).catch(() => {});
    } catch (sheetBackfillError) {
        console.error(
            "SHEET_BACKFILL_ERROR",
            sheetBackfillError?.response?.status || sheetBackfillError?.code || "unknown_error"
        );
        syncPending = (await queueSyncRetry({ target: "google_sheets", booking, fileName, fileHash, driveFileId: duplicateFile.id, driveUrl: duplicateLink, sheetTitle: isBookingFile ? "Booking" : "Other", eventId: event.webhookEventId })) || syncPending;
    }

    try {
        const rentalProSync = await savePartnerUpload({
            booking,
            fileName,
            fileHash,
            driveFileId: duplicateFile.id,
            driveUrl: duplicateLink
        });
        rentalProSyncFailed = Boolean(rentalProSync?.skipped && !rentalProSync?.duplicate);
        if (rentalProSyncFailed) syncPending = (await queueSyncRetry({ target: "supabase", booking, fileName, fileHash, driveFileId: duplicateFile.id, driveUrl: duplicateLink, sheetTitle: isBookingFile ? "Booking" : "Other", eventId: event.webhookEventId })) || syncPending;
        else {
            await updateSyncState({ fileHash, target: "supabase", state: "succeeded" }).catch(() => {});
            if (duplicateAccess.public) await updateDriveSharingAudit({ fileHash, driveFileId: duplicateFile.id, permissionId: duplicateAccess.permissionId }).catch((error) => console.warn("DRIVE_SHARING_AUDIT_FAILED", error?.response?.status || error?.code || "unknown_error"));
        }
        console.log(rentalProSync?.duplicate ? "RentalPro sync: ALREADY EXISTS" : rentalProSync?.skipped ? "RentalPro sync: SKIPPED (missing environment variables)" : "RentalPro sync: OK");
    } catch (rentalProError) {
        rentalProSyncFailed = true;
        console.error("RENTALPRO_SYNC_ERROR", rentalProError?.response?.status || rentalProError?.code || "unknown_error");
        syncPending = (await queueSyncRetry({ target: "supabase", booking, fileName, fileHash, driveFileId: duplicateFile.id, driveUrl: duplicateLink, sheetTitle: isBookingFile ? "Booking" : "Other", eventId: event.webhookEventId })) || syncPending;
    }

    if (isBookingFile) {
        const appSheetResult = await syncLineBookingToAppSheet({ booking, fileHash, fileName, driveUrl: duplicateLink });
        if (appSheetResult?.ok) await updateSyncState({ fileHash, target: "appsheet", state: "succeeded" }).catch(() => {});
        else if (!appSheetResult?.skipped) syncPending = (await queueSyncRetry({ target: "appsheet", booking, fileName, fileHash, driveFileId: duplicateFile.id, driveUrl: duplicateLink, sheetTitle: "Booking", eventId: event.webhookEventId })) || syncPending;
    }

    const duplicateReply = [
        "♻️ ไฟล์นี้เคยบันทึกแล้ว",

        ...(syncPending ? ["⚠️ บางปลายทางยังซิงก์ไม่สำเร็จ ระบบเพิ่มเข้าคิวลองใหม่แล้ว"] : rentalProSyncFailed ? ["⚠️ ยังซิงก์ข้อมูลหน้าเว็บไม่สำเร็จ กรุณาให้ผู้ดูแลตรวจคิวซิงก์"] : []),

        `📄 ${fileName}`,

        "",

        duplicateAccess.public
            ? "📂 เปิดไฟล์เดิม"
            : "📂 ไฟล์เดิมถูกบันทึกแล้ว แต่ Google Drive ยังไม่อนุญาตลิงก์สาธารณะ",

        duplicateLink
    ].join("\n");

    await sendResultMessage(
        event,
        duplicateReply
    );

    replied = true;
    return true;
}

// อัปโหลดไฟล์

const upload =
    await drive.files.create({
        requestBody: {
            name: fileName,

            appProperties: {
                contentHash: fileHash
            },

            parents: [
                targetFolderId
            ]
        },

        media: {
            mimeType,

            body:
                stream.Readable.from(
                    buffer
                )
        },

        // ให้ Google ตอบกลับโฟลเดอร์จริง
        fields: "id, parents"
    });

const fileId =
    upload.data.id;

if (!fileId) {
    throw new Error(
        "GOOGLE_DRIVE_FILE_ID_EMPTY"
    );
}

// แสดง Parent Folder ที่ Google ใช้จริง

console.log("Drive upload result:", {
    uploadedParents:
        upload.data.parents,

    expectedFolder:
        targetFolderId,

    matched:
        Array.isArray(
            upload.data.parents
        ) &&
        upload.data.parents.includes(
            targetFolderId
        )
});

        // ============================
        // MAKE FILE PUBLIC (best effort)
        // ============================

const driveAccess = await ensureDriveLinkAccess(drive, fileId);
drivePublic = driveAccess.public;

        const link =
            `https://drive.google.com/file/d/${fileId}/view`;

        booking.driveFileId =
            fileId;

        booking.fileName =
            fileName;

        booking.pdfLink =
            link;

        booking.drivePublic = driveAccess.public;

        // ============================
        // SYNC TO RENTALPRO
        // ============================

        try {
            const rentalProSync = await savePartnerUpload({
                booking,
                fileName,
                fileHash,
                driveFileId: fileId,
                driveUrl: link
            });

            console.log(rentalProSync?.skipped ? "RentalPro sync: SKIPPED (missing environment variables)" : "RentalPro sync: OK");
            rentalProSyncFailed = Boolean(rentalProSync?.skipped);
        } catch (rentalProError) {
            rentalProSyncFailed = true;
            // The LINE/Drive workflow should continue even if the website is temporarily unavailable.
            console.error("RENTALPRO_SYNC_ERROR", rentalProError?.response?.status || rentalProError?.code || "unknown_error");
        }
        if (rentalProSyncFailed) syncPending = (await queueSyncRetry({ target: "supabase", booking, fileName, fileHash, driveFileId: fileId, driveUrl: link, sheetTitle: isBookingFile ? "Booking" : "Other", eventId: event.webhookEventId })) || syncPending;
        else {
            await updateSyncState({ fileHash, target: "supabase", state: "succeeded" }).catch(() => {});
            if (driveAccess.public) await updateDriveSharingAudit({ fileHash, driveFileId: fileId, permissionId: driveAccess.permissionId }).catch((error) => console.warn("DRIVE_SHARING_AUDIT_FAILED", error?.response?.status || error?.code || "unknown_error"));
        }

        // ============================
        // SAVE TO GOOGLE SHEET
        // ============================

        const sheets =
            google.sheets({
                version: "v4",
                auth
            });

        const sheetTitle =
            isBookingFile
                ? "Booking"
                : "Other";

        try {
            await ensureSheetTab(sheets, process.env.GOOGLE_SHEET_ID, sheetTitle);
            await sheets.spreadsheets
                .values.append({
                spreadsheetId:
                    process.env
                        .GOOGLE_SHEET_ID,

                range:
                    `${sheetTitle}!A:N`,

                valueInputOption:
                    "USER_ENTERED",

                requestBody: {
                    values: [[
                        new Date()
                            .toISOString(),

                        booking.company,

                        booking.bookingNo,

                        booking.customerName,

                        booking.customerPhone,

                        booking.pickupDate,

                        booking.pickupTime,

                        booking.pickupLocation,

                        booking.returnDate,

                        booking.returnTime,

                        booking.returnLocation,

                        booking.car,

                        fileName,

                        link
                    ]]
                }
                });
            await updateSyncState({ fileHash, target: "google_sheets", state: "succeeded" }).catch(() => {});
        } catch (sheetError) {
            console.error("GOOGLE_SHEET_APPEND_FAILED", sheetError?.response?.status || sheetError?.code || "unknown_error");
            syncPending = (await queueSyncRetry({ target: "google_sheets", booking, fileName, fileHash, driveFileId: fileId, driveUrl: link, sheetTitle, eventId: event.webhookEventId })) || syncPending;
        }

        if (isBookingFile) {
            const appSheetResult = await syncLineBookingToAppSheet({ booking, fileHash, fileName, driveUrl: link });
            if (appSheetResult?.ok) await updateSyncState({ fileHash, target: "appsheet", state: "succeeded" }).catch(() => {});
            else if (!appSheetResult?.skipped) syncPending = (await queueSyncRetry({ target: "appsheet", booking, fileName, fileHash, driveFileId: fileId, driveUrl: link, sheetTitle: "Booking", eventId: event.webhookEventId })) || syncPending;
        }

        // Keep the newest uploaded files at the top of the Booking sheet.
        // Sorting is best-effort so a formatting/sorting issue never blocks
        // the Drive upload or LINE reply.
        try {
            const sheetInfo =
                await sheets.spreadsheets.get({
                    spreadsheetId:
                        process.env
                            .GOOGLE_SHEET_ID,

                    fields:
                        "sheets(properties(sheetId,title))"
                });

            const bookingSheet =
                (sheetInfo.data.sheets || [])
                    .find(
                        (sheet) =>
                            sheet.properties?.title ===
                            "Booking"
                    );

            const columnA =
                await sheets.spreadsheets.values.get({
                    spreadsheetId:
                        process.env
                            .GOOGLE_SHEET_ID,

                    range:
                        "Booking!A:A"
                });

            const rowCount =
                Array.isArray(
                    columnA.data.values
                )
                    ? columnA.data.values.length
                    : 0;

            if (
                bookingSheet?.properties?.sheetId !==
                    undefined &&
                rowCount > 2
            ) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId:
                        process.env
                            .GOOGLE_SHEET_ID,

                    requestBody: {
                        requests: [
                            {
                                sortRange: {
                                    range: {
                                        sheetId:
                                            bookingSheet
                                                .properties
                                                .sheetId,

                                        startRowIndex: 1,

                                        endRowIndex:
                                            rowCount,

                                        startColumnIndex: 0,

                                        endColumnIndex: 14
                                    },

                                    sortSpecs: [
                                        {
                                            // Column F: pickup date.
                                            dimensionIndex: 5,

                                            sortOrder:
                                                "ASCENDING"
                                        },

                                        {
                                            // Column A: newest upload first
                                            // when pickup dates match.
                                            dimensionIndex: 0,

                                            sortOrder:
                                                "DESCENDING"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                });

                console.log(
                    "Sorted Booking sheet by upload date descending"
                );
            }
        } catch (sortError) {
            console.error(
                "SHEET_SORT_ERROR",
                sortError?.response?.status || sortError?.code || "unknown_error"
            );
        }

        console.log("Drive and spreadsheet save completed");

        // ============================
        // PREPARE LINE MESSAGE
        // ============================

        const pickupDateTime =
            `${formatDate(
                booking.pickupDate
            )} ${
                booking.pickupTime ||
                ""
            }`.trim();

        const returnDateTime =
            `${formatDate(
                booking.returnDate
            )} ${
                booking.returnTime ||
                ""
            }`.trim();

        const isOtherFile =
            String(booking.company || "")
                .trim()
                .toLowerCase() === "other";

        const reply1 = parseWarning
            ? "⚠️ บันทึกไฟล์ต้นฉบับแล้ว แต่ข้อมูลที่อ่านได้ยังไม่ครบ กรุณาตรวจสอบรายการและไฟล์ใน Google Drive"
            : isOtherFile
            ? "✅ บันทึกไฟล์แล้ว\n📄 ไฟล์นี้ไม่ใช่ใบจองรถเช่า"
            : [
                `✅ บันทึกไฟล์แล้ว ${booking.company}`,

                "",

                `👤 ${
                    booking.customerName ||
                    "-"
                }`,

                `📞 ${
                    booking.customerPhone ||
                    "-"
                }`,

                "",

                "🚗 รับรถ",

                pickupDateTime || "-",

                booking.pickupLocation ||
                    "-",

                "",

                "🔄 คืนรถ",

                returnDateTime || "-",

                booking.returnLocation ||
                    "-",

                "",

                `🚙 ${shortText(
                    booking.car,
                    80
                )}`
            ].join("\n");

        const reply2 = [
            `📄 ${fileName}`,

            "",

            "📂 เปิดไฟล์",

            link
        ].join("\n");

        const replyText = [
            reply1,
            ...(!drivePublic ? ["⚠️ บันทึกไฟล์แล้ว แต่ Google Drive ไม่อนุญาตให้เปิดด้วยลิงก์สาธารณะ ผู้ดูแลต้องตรวจสิทธิ์ไฟล์"] : []),
            ...(syncPending ? ["⚠️ ไฟล์ต้นฉบับบันทึกแล้ว แต่บางปลายทางรอซิงก์ ระบบจะลองซ้ำอัตโนมัติ"] : rentalProSyncFailed ? ["⚠️ ไฟล์ต้นฉบับบันทึกแล้ว แต่ข้อมูลหน้าเว็บยังซิงก์ไม่สำเร็จ กรุณาให้ผู้ดูแลตรวจสอบ"] : []),
            reply2
        ].join("\n\n");

        console.log(
            "Reply Length :",
            replyText.length
        );

        // ============================
        // REPLY LINE
        // ============================

        await sendResultMessage(
            event,
            replyText
        );

        replied = true;
        return true;
    } catch (error) {
        console.error(
            "============= ERROR ============="
        );

        console.error("FILE_PROCESSING_ERROR", error?.response?.status || error?.code || error?.message || "unknown_error");

        console.error(
            "================================="
        );

        if (
            !replied &&
            event.replyToken
        ) {
            try {
                await sendResultMessage(
                    event,
                    "❌ " + lineFileErrorMessage(error)
                );

                replied = true;
            } catch (replyError) {
                console.error(
                    "ERROR REPLY FAILED:",
                    replyError
                        ?.response
                        ?.data ||
                    replyError?.stack ||
                    replyError
                );
            }
        }
        return false;
    }
}

// ============================
// HOME / HEALTH CHECK
// ============================

app.get("/", (req, res) => {
    res.send(
        "LINE Drive Bot Running"
    );
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok"
    });
});

// The dashboard uses this server-side path for re-reading incomplete bookings.
// The admin PIN is verified by rental-admin before this service downloads the
// Drive file through the account's existing Google OAuth connection.
app.post("/admin/bookings/:id/read", async (req, res) => {
    try {
        const result = await readBookingPdfFromDrive({
            id: req.params.id,
            token: cleanText(req.get("x-booking-edit-token") || ""),
            drive: google.drive({ version: "v3", auth }),
            supabaseUrl: process.env.RENTALPRO_SUPABASE_URL || process.env.SUPABASE_URL,
            anonKey: process.env.SUPABASE_ANON_KEY,
        });
        return res.status(200).json(result);
    } catch (error) {
        console.warn("BOOKING_FILE_REREAD_FAILED", { status: error.status || 502, reason: cleanText(error.message || "read_failed").slice(0, 180) });
        return res.status(error.status || 502).json({ error: error.message || "อ่านไฟล์ไม่สำเร็จ" });
    }
});

let pendingDeletionRunActive = false;
async function runPendingDeletionQueue() {
    if (pendingDeletionRunActive) return { skipped: true, reason: "previous run is still active" };
    pendingDeletionRunActive = true;
    try {
        const result = await queueExpiredBookings({
            drive: google.drive({
                version: "v3",
                auth
            }),
            supabaseUrl: process.env.RENTALPRO_SUPABASE_URL,
            serviceRoleKey: process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY,
            pendingFolderId: cleanText(process.env.GOOGLE_PENDING_DELETION_FOLDER_ID || "")
        });
        console.log("PENDING_DELETION_QUEUE_COMPLETED");
        return result;
    } finally {
        pendingDeletionRunActive = false;
    }
}

// The worker moves a file to the protected review folder first.  A permanent
// Drive delete only runs after the administrator explicitly confirms it in
// the dashboard, which changes the lifecycle state to pending_permanent_delete.
app.post("/maintenance/pending-deletion", async (req, res) => {
    const expectedToken = cleanText(process.env.MAINTENANCE_TOKEN || "");
    const suppliedToken = cleanText(req.get("authorization") || "").replace(/^Bearer\s+/i, "");

    if (!expectedToken || suppliedToken !== expectedToken) {
        return res.sendStatus(401);
    }

    try {
        return res.status(200).json(await runPendingDeletionQueue());
    } catch (error) {
        console.error("PENDING_DELETION_MAINTENANCE_ERROR:", error?.message || error);
        return res.sendStatus(500);
    }
});

// ============================
// EXPRESS ERROR HANDLER
// ============================

app.use(
    (error, req, res, next) => {
        console.error(
            "EXPRESS ERROR:",
                error?.response?.status || error?.code || "unknown_error"
        );

        if (
            !res.headersSent
        ) {
            res.sendStatus(500);
        }
    }
);

// ============================
// START SERVER
// ============================

const PORT =
    Number(
        process.env.PORT ||
        3000
    );

async function runAppSheetSync() {
    const spreadsheetId = getAppSheetSpreadsheetId();
    if (!spreadsheetId) return;
    try {
        const result = await syncAppSheetBookings({
            auth,
            spreadsheetId,
            bookingSheetTitle: process.env.APPSHEET_BOOKING_SHEET || "Bookings",
            carSheetTitle: process.env.APPSHEET_CAR_SHEET || "Car_Master"
        });
        console.log("APPSHEET_SYNC:", result);
        const repaired = await repairAppSheetPdfLinks({
            auth,
            spreadsheetId,
            bookingSheetTitle: process.env.APPSHEET_BOOKING_SHEET || "Bookings"
        });
        console.log("APPSHEET_PDF_LINK_REPAIR:", repaired);
    } catch (error) {
        console.error("APPSHEET_SYNC_ERROR", error?.response?.status || error?.code || "unknown_error");
    }
}

async function backfillLineSheetsToSupabase() {
    if (process.env.SUPABASE_BACKFILL_ONCE === "false" || !getLineSpreadsheetId()) return;
    const sheets = google.sheets({ version: "v4", auth });
    const results = { scanned: 0, imported: 0, duplicates: 0, skipped: 0 };
    for (const sheetTitle of [process.env.LINE_BOOKING_SHEET || "Booking", process.env.LINE_OTHER_SHEET || "Other"]) {
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: getLineSpreadsheetId(),
            range: `${sheetTitle}!A:N`,
            valueRenderOption: "FORMATTED_VALUE"
        });
        const [, ...rows] = result.data.values || [];
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index] || [];
            if (!row.some((value) => cleanText(value))) { results.skipped += 1; continue; }
            results.scanned += 1;
            const fileName = cleanText(row[12]) || `${sheetTitle}-${index + 2}`;
            const driveUrl = cleanText(row[13]);
            const fileHash = crypto.createHash("sha256")
                .update(`legacy-line:${getLineSpreadsheetId()}:${sheetTitle}:${index + 2}:${fileName}:${driveUrl}`)
                .digest("hex");
            const saved = await savePartnerUpload({
                booking: {
                    company: cleanText(row[1]) || (sheetTitle === "Other" ? "Other" : "LINE"),
                    bookingNo: cleanText(row[2]), customerName: cleanText(row[3]), customerPhone: cleanText(row[4]),
                    pickupDate: cleanText(row[5]), pickupTime: cleanText(row[6]), pickupLocation: cleanText(row[7]),
                    returnDate: cleanText(row[8]), returnTime: cleanText(row[9]), returnLocation: cleanText(row[10]), car: cleanText(row[11])
                },
                fileName, fileHash, driveUrl, source: "LINE", sourceLabel: `LINE / legacy ${sheetTitle}`
            });
            if (saved?.duplicate) results.duplicates += 1;
            else if (saved?.skipped) results.skipped += 1;
            else results.imported += 1;
        }
    }
    console.log("SUPABASE_LINE_BACKFILL:", results);
}

async function runCombinedSheetSync() {
    const combinedSpreadsheetId = getCombinedSpreadsheetId();
    if (!combinedSpreadsheetId) return;
    try {
        const result = await syncCombinedSpreadsheet({
            auth,
            combinedSpreadsheetId,
            lineSpreadsheetId: getLineSpreadsheetId(),
            appSheetSpreadsheetId: getAppSheetSpreadsheetId()
        });
        console.log("COMBINED_SHEET_SYNC:", result);
    } catch (error) {
        console.error("COMBINED_SHEET_SYNC_ERROR", error?.response?.status || error?.code || "unknown_error");
    }
}

let syncJobRunActive = false;
async function runSyncRetryQueue() {
    if (syncJobRunActive) return;
    syncJobRunActive = true;
    try {
        const jobs = await nextSyncJobs({ limit: 10 });
        for (const job of jobs) {
            const payload = job.payload || {};
            const processingJob = { ...job, attempts: Number(job.attempts || 0) + 1 };
            let claimed = false;
            try {
                const lock = await claimSyncJob(job);
                if (!lock) continue;
                claimed = true;
                processingJob.attempts = Number(lock.attempts || processingJob.attempts);
                if (job.target === "supabase") {
                    const result = await savePartnerUpload({ booking: payload.booking || {}, fileName: payload.fileName, fileHash: payload.fileHash, driveFileId: payload.driveFileId, driveUrl: payload.driveUrl });
                    if (result?.skipped && !result?.duplicate) throw new Error("SUPABASE_SYNC_STILL_UNAVAILABLE");
                } else if (job.target === "google_sheets") {
                    const sheets = google.sheets({ version: "v4", auth });
                    await ensureSheetTab(sheets, getLineSpreadsheetId(), payload.sheetTitle || "Booking");
                    await backfillSheetRowIfMissing({ sheets, spreadsheetId: getLineSpreadsheetId(), sheetTitle: payload.sheetTitle || "Booking", booking: payload.booking || {}, fileName: payload.fileName || "", link: payload.driveUrl || "" });
                } else if (job.target === "appsheet") {
                    const result = await syncLineBookingToAppSheet({ booking: payload.booking || {}, fileHash: payload.fileHash, fileName: payload.fileName, driveUrl: payload.driveUrl });
                    if (!result?.ok) throw new Error(result?.error || "APPSHEET_RETRY_FAILED");
                }
                await setSyncJob(processingJob, "succeeded");
                await updateSyncState({ fileHash: payload.fileHash, target: job.target, state: "succeeded" }).catch(() => {});
            } catch (error) {
                if (!claimed) {
                    console.error("SYNC_RETRY_CLAIM_FAILED", error?.response?.status || error?.code || "unknown_error");
                    continue;
                }
                const detail = error?.response?.status || error?.code || error?.message || "sync_retry_failed";
                const nextState = processingJob.attempts >= 8 ? "failed" : "queued";
                await setSyncJob(processingJob, nextState, detail).catch(() => {});
                await updateSyncState({ fileHash: payload.fileHash, target: job.target, state: nextState, error: detail }).catch(() => {});
                console.error("SYNC_RETRY_FAILED", { target: job.target, attempts: processingJob.attempts, reason: String(detail).slice(0, 120) });
            }
        }
    } catch (error) {
        console.error("SYNC_RETRY_QUEUE_READ_FAILED", error?.response?.status || error?.code || "unknown_error");
    } finally {
        syncJobRunActive = false;
    }
}

if (getAppSheetSpreadsheetId()) {
    setTimeout(() => void runAppSheetSync(), 15000);
    setInterval(() => void runAppSheetSync(), Math.max(60000, Number(process.env.APPSHEET_SYNC_INTERVAL_MS || 300000)));
}

// Run the reversible duplicate archive even when the Drive review-folder
// setting is absent. The worker never moves/deletes a shared file referenced
// by both a duplicate row and its canonical booking.
if (cleanText(process.env.RENTALPRO_SUPABASE_URL || "") && cleanText(process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "")) {
    const pendingDeletionInterval = Math.max(60000, Number(process.env.PENDING_DELETION_INTERVAL_MS || 60000));
    console.log("PENDING_DELETION_SCHEDULER_STARTED:", { intervalMs: pendingDeletionInterval, reviewFolderConfigured: Boolean(cleanText(process.env.GOOGLE_PENDING_DELETION_FOLDER_ID || "")) });
    setTimeout(() => void runPendingDeletionQueue().catch((error) => console.error("PENDING_DELETION_QUEUE_ERROR:", error?.message || error)), 30000);
    setInterval(
        () => void runPendingDeletionQueue().catch((error) => console.error("PENDING_DELETION_QUEUE_ERROR:", error?.message || error)),
        pendingDeletionInterval
    );
} else {
    console.error("PENDING_DELETION_SCHEDULER_DISABLED:", { supabaseUrlConfigured: Boolean(cleanText(process.env.RENTALPRO_SUPABASE_URL || "")), serviceKeyConfigured: Boolean(cleanText(process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "")) });
}

if (process.env.SUPABASE_BACKFILL_ONCE === "true") {
    setTimeout(() => void backfillLineSheetsToSupabase(), 25000);
}

if (getCombinedSpreadsheetId()) {
    setTimeout(() => void runCombinedSheetSync(), 20000);
    setInterval(() => void runCombinedSheetSync(), Math.max(60000, Number(process.env.COMBINED_SYNC_INTERVAL_MS || 300000)));
}

if (cleanText(process.env.RENTALPRO_SUPABASE_URL || "") && cleanText(process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "")) {
    setTimeout(() => void runSyncRetryQueue(), 45000);
    setInterval(() => void runSyncRetryQueue(), Math.max(60000, Number(process.env.SYNC_RETRY_INTERVAL_MS || 60000)));
}

app.listen(
    PORT,

    () => {
        console.log(
            `Bot Started on port ${PORT}`
        );
        const configuredSourceGroups = process.env.SOURCE_GROUP_IDS || process.env.SOURCE_GROUP_ID;
        const legacyGroupOption = {
            includeLegacyTestGroup: !cleanText(process.env.SOURCE_GROUP_IDS || "")
        };
        console.log("LINE_GROUP_ROUTING_CONFIG", {
            acceptedSourceGroupCount: getAllowedSourceGroupIds(configuredSourceGroups, legacyGroupOption).length,
            usingExplicitSourceGroupList: Boolean(cleanText(process.env.SOURCE_GROUP_IDS || "")),
            destinationGroupConfigured: Boolean(cleanText(process.env.DESTINATION_GROUP_ID || ""))
        });
    }
);
