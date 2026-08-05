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
// LINE
// ============================

const lineConfig = {
    channelSecret: process.env.CHANNEL_SECRET
};

const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

// ============================
// GOOGLE
// ============================

const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// ============================
// Helper
// ============================

function cleanText(str = "") {
    return String(str)
        .replace(/\u0000/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatDate(date) {

    if (!date) return "-";

    if (typeof date === "string")
        return cleanText(date);

    const d = new Date(date);

    if (isNaN(d.getTime()))
        return "-";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
}

// ============================
// WEBHOOK
// ============================

app.post(
    "/webhook",
    middleware(lineConfig),
    async (req, res) => {

        try {

            await Promise.all(
                req.body.events.map(handleEvent)
            );

            res.sendStatus(200);

        } catch (err) {

            console.error(err);

            res.sendStatus(500);

        }

    }
);
// ============================
// Handle Event
// ============================

async function handleEvent(event) {

    try {

        if (
            event.type !== "message" ||
            event.message.type !== "file"
        ) {
            return;
        }

        const messageId = event.message.id;
        const fileName = event.message.fileName;

        console.log("รับไฟล์ :", fileName);

        // ============================
        // Download file from LINE
        // ============================

        const response = await axios({

            method: "get",

            url:
                `https://api-data.line.me/v2/bot/message/${messageId}/content`,

            responseType: "arraybuffer",

            headers: {
                Authorization:
                    `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
            }

        });

        const buffer = Buffer.from(response.data);

        // ============================
        // Read PDF
        // ============================

        let booking = {};

        if (fileName.toLowerCase().endsWith(".pdf")) {

            const text = await readPDF(buffer);

console.log(
    "Final Text Length:",
    text.length
);

if (!text || text.trim().length < 10) {
    throw new Error(
        "PDF_TEXT_EMPTY"
    );
}

booking =
    parserService.parse(text) || {};

            console.log("============== PDF TEXT ==============");
            console.log(text.substring(0, 1000));
            console.log("======================================");

            console.log("============== BOOKING ===============");
            console.log(booking);
            console.log("======================================");

        }

        booking.company = booking.company || "Other";

        booking.customerName =
            cleanText(
                booking.customerName ||
                booking.renter ||
                ""
            );

        booking.customerPhone =
            cleanText(
                booking.customerPhone ||
                booking.phone ||
                ""
            );

        booking.car =
            cleanText(booking.car);

        booking.pickupLocation =
            cleanText(booking.pickupLocation);

        booking.returnLocation =
            cleanText(booking.returnLocation);

        booking.pickupTime =
            cleanText(booking.pickupTime);

        booking.returnTime =
            cleanText(booking.returnTime);

        booking.pickupDate =
            cleanText(booking.pickupDate);

        booking.returnDate =
            cleanText(booking.returnDate);
        // ============================
        // Upload to Google Drive
        // ============================

        const drive = google.drive({

            version: "v3",

            auth

        });

        const upload = await drive.files.create({

            requestBody: {

                name: fileName,

                parents: [
                    process.env.GOOGLE_DRIVE_FOLDER_ID
                ]

            },

            media: {

                body: stream.Readable.from(buffer)

            },

            fields: "id"

        });

        const fileId = upload.data.id;

        // ============================
        // Make Public
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

        booking.driveFileId = fileId;
        booking.fileName = fileName;
        booking.pdfLink = link;

        // ============================
        // Google Sheet
        // ============================

        const sheets = google.sheets({

            version: "v4",

            auth

        });

        await sheets.spreadsheets.values.append({

            spreadsheetId:
                process.env.GOOGLE_SHEET_ID,

            range: "Booking!A:N",

            valueInputOption: "USER_ENTERED",

            requestBody: {

                values: [[

                    new Date(),

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

        console.log("Saved :", booking.bookingNo);

        // ============================
        // Reply LINE
        // ============================

        const reply1 =
`✅ บันทึกไฟล์แล้ว ${booking.company}

👤 ${booking.customerName || "-"}
📞 ${booking.customerPhone || "-"}

🚗 รับรถ
${booking.pickupDate || "-"} ${booking.pickupTime || ""}
${booking.pickupLocation || "-"}

🔄 คืนรถ
${booking.returnDate || "-"} ${booking.returnTime || ""}
${booking.returnLocation || "-"}

🚙 ${(booking.car || "-").substring(0,50)}`;

        const reply2 =
`📄 ${fileName}

📂 เปิดไฟล์
${link}`;

        console.log("Reply1 Length :", reply1.length);
        console.log("Reply2 Length :", reply2.length);

        await client.replyMessage({

            replyToken: event.replyToken,

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

    } catch (err) {

        console.error("============= ERROR =============");
        console.error(err);
        console.error("================================");

        if (event.replyToken) {

            try {

                await client.replyMessage({

                    replyToken: event.replyToken,

                    messages: [

                        {
                            type: "text",
                            text: "❌ ไม่สามารถประมวลผลไฟล์ได้"
                        }

                    ]

                });

            } catch (e) {

                console.error(e);

            }

        }

    }

}

// ============================
// Home
// ============================

app.get("/", (req, res) => {

    res.send("LINE Drive Bot Running");

});

// ============================
// Error
// ============================

app.use((err, req, res, next) => {

    console.error(err);

    res.sendStatus(500);

});

// ============================
// Start
// ============================

app.listen(

    process.env.PORT || 3000,

    () => {

        console.log("Bot Started");

    }

);