const { readPDF } = require("./services/pdfReader");
const parserService = require("./services/parserService");

require("dotenv").config();

const express = require("express");
const { messagingApi, middleware } = require("@line/bot-sdk");
const axios = require("axios");
const { google } = require("googleapis");
const stream = require("stream");
const crypto = require("crypto");

const app = express();

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

            await Promise.all(
                events.map(handleEvent)
            );

            res.sendStatus(200);
        } catch (error) {
            console.error(
                "WEBHOOK ERROR:",
                error?.stack || error
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

    try {
        if (
            event.type !== "message" ||
            event.message.type !== "file"
        ) {
            return;
        }

        const messageId =
            event.message.id;

        const fileName =
            cleanText(
                event.message.fileName ||
                `file-${messageId}`
            );

        console.log(
            "รับไฟล์ :",
            fileName
        );

        // ============================
        // DOWNLOAD FILE FROM LINE
        // ============================

        const response =
            await axios({
                method: "get",

                url:
                    `https://api-data.line.me/v2/bot/message/${messageId}/content`,

                responseType:
                    "arraybuffer",

                timeout: 120000,

                maxContentLength:
                    Infinity,

                maxBodyLength:
                    Infinity,

                headers: {
                    Authorization:
                        `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
                }
            });

        const buffer =
            Buffer.from(
                response.data
            );

        if (!buffer.length) {
            throw new Error(
                "DOWNLOADED_FILE_EMPTY"
            );
        }

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
            const text =
                await readPDF(buffer);

            console.log(
                "Final Text Length:",
                text.length
            );

            if (
                !text ||
                text.trim().length < 10
            ) {
                throw new Error(
                    "PDF_TEXT_EMPTY"
                );
            }

            booking =
                parserService.parse(text) ||
                {
                    company: "Other"
                };

            // แสดงเฉพาะข้อมูลที่จำเป็น
            // ไม่แสดง rawText ทั้งไฟล์

            console.log(
                "Parsed booking:",
                {
                    company:
                        booking.company,

                    bookingNo:
                        booking.bookingNo,

                    customerName:
                        booking.customerName,

                    customerPhone:
                        booking.customerPhone,

                    pickupDate:
                        booking.pickupDate,

                    pickupTime:
                        booking.pickupTime,

                    pickupLocation:
                        booking.pickupLocation,

                    returnDate:
                        booking.returnDate,

                    returnTime:
                        booking.returnTime,

                    returnLocation:
                        booking.returnLocation,

                    car:
                        booking.car
                }
            );
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
    "chiccar"
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

console.log("File hash:", fileHash.slice(-8));

// แสดง Log โดยไม่เปิดเผย Folder ID เต็ม

console.log("Drive destination:", {
    fileName,
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
    response.headers[
        "content-type"
    ] ||
    "application/octet-stream";

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
        "DUPLICATE_CHECK_ERROR:",
        duplicateError?.response?.data ||
        duplicateError?.message ||
        duplicateError
    );
}

if (duplicateFile?.id) {
    const duplicateLink =
        `https://drive.google.com/file/d/${duplicateFile.id}/view`;

    const duplicateReply = [
        "♻️ ไฟล์นี้เคยบันทึกแล้ว",

        `📄 ${fileName}`,

        "",

        "📂 เปิดไฟล์เดิม",

        duplicateLink
    ].join("\n");

    await client.replyMessage({
        replyToken:
            event.replyToken,

        messages: [
            {
                type: "text",
                text: duplicateReply
            }
        ]
    });

    replied = true;
    return;
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
    fileId:
        fileId.slice(-8),

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
        // MAKE FILE PUBLIC
        // ============================

        await drive.permissions.create({
            fileId,

            requestBody: {
                role: "reader",
                type: "anyone"
            }
        });

        const link =
            `https://drive.google.com/file/d/${fileId}/view`;

        booking.driveFileId =
            fileId;

        booking.fileName =
            fileName;

        booking.pdfLink =
            link;

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

        await ensureSheetTab(
            sheets,

            process.env
                .GOOGLE_SHEET_ID,

            sheetTitle
        );

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
                "SHEET_SORT_ERROR:",
                sortError?.response?.data ||
                sortError?.message ||
                sortError
            );
        }

        console.log(
            "Saved :",
            booking.bookingNo ||
            fileName
        );

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

        const reply1 = isOtherFile
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
            reply2
        ].join("\n\n");

        console.log(
            "Reply Length :",
            replyText.length
        );

        // ============================
        // REPLY LINE
        // ============================

        await client.replyMessage({
            replyToken:
                event.replyToken,

            messages: [
                {
                    type: "text",
                    text: replyText
                }
            ]
        });

        replied = true;
    } catch (error) {
        console.error(
            "============= ERROR ============="
        );

        console.error(
            error?.response?.data ||
            error?.stack ||
            error
        );

        console.error(
            "================================="
        );

        if (
            !replied &&
            event.replyToken
        ) {
            try {
                await client.replyMessage({
                    replyToken:
                        event.replyToken,

                    messages: [
                        {
                            type: "text",

                            text:
                                "❌ ไม่สามารถประมวลผลไฟล์ได้ กรุณาลองส่งใหม่อีกครั้ง"
                        }
                    ]
                });

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

// ============================
// EXPRESS ERROR HANDLER
// ============================

app.use(
    (error, req, res, next) => {
        console.error(
            "EXPRESS ERROR:",
            error?.stack || error
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

app.listen(
    PORT,

    () => {
        console.log(
            `Bot Started on port ${PORT}`
        );
    }
);
