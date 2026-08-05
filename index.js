const { readPDF } = require("./services/pdfReader");
const parserService = require("./services/parserService");

require("dotenv").config();

const express = require("express");
const { messagingApi, middleware } = require("@line/bot-sdk");
const axios = require("axios");
const { google } = require("googleapis");
const stream = require("stream");

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

// อัปโหลดไฟล์

const upload =
    await drive.files.create({
        requestBody: {
            name: fileName,

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

        await sheets.spreadsheets
            .values.append({
                spreadsheetId:
                    process.env
                        .GOOGLE_SHEET_ID,

                range:
                    "Booking!A:N",

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

        const reply1 = [
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

        console.log(
            "Reply1 Length :",
            reply1.length
        );

        console.log(
            "Reply2 Length :",
            reply2.length
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
                    text: reply1
                },

                {
                    type: "text",
                    text: reply2
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