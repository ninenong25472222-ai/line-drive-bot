const canvasLibrary = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");

const {
    createCanvas,
    DOMMatrix,
    ImageData,
    Path2D
} = canvasLibrary;

// PDF.js รุ่นใหม่ต้องใช้ Object เหล่านี้ตอน Render หน้า PDF

if (!global.DOMMatrix && DOMMatrix) {
    global.DOMMatrix = DOMMatrix;
}

if (!global.ImageData && ImageData) {
    global.ImageData = ImageData;
}

if (!global.Path2D && Path2D) {
    global.Path2D = Path2D;
}

let pdfJsPromise = null;

// ============================
// โหลด PDF.js
// ============================

async function loadPdfJs() {
    if (!pdfJsPromise) {
        pdfJsPromise = import(
            "pdfjs-dist/legacy/build/pdf.mjs"
        );
    }

    return pdfJsPromise;
}

// ============================
// ทำความสะอาดข้อความ
// ============================

function cleanText(value = "") {
    return String(value)
        .replace(/\u0000/g, "")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// ============================
// เปิด PDF
// ============================

async function openPdf(buffer) {
    const pdfjs = await loadPdfJs();

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
        useSystemFonts: true
    });

    return loadingTask.promise;
}

// ============================
// อ่าน Text Layer ปกติ
// ============================

async function extractTextLayer(buffer) {
    const pdf = await openPdf(buffer);

    const pages = [];

    try {
        for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber++
        ) {
            const page = await pdf.getPage(
                pageNumber
            );

            const content =
                await page.getTextContent();

            let pageText = "";

            for (const item of content.items) {
                const value = String(
                    item.str || ""
                ).trim();

                if (!value) {
                    continue;
                }

                if (
                    pageText &&
                    !pageText.endsWith("\n")
                ) {
                    pageText += " ";
                }

                pageText += value;

                if (item.hasEOL) {
                    pageText += "\n";
                }
            }

            pages.push(pageText);

            page.cleanup();
        }
    } finally {
        await pdf.destroy();
    }

    return cleanText(
        pages.join("\n")
    );
}

// ============================
// OCR หน้า PDF
// ============================

async function extractTextWithOcr(
    buffer
) {
    const pdf = await openPdf(buffer);

    const pages = [];

    let worker = null;

    try {
        console.log(
            "PDF ไม่มี Text Layer เริ่ม OCR..."
        );

        worker = await createWorker(
            "eng"
        );

        await worker.setParameters({
            preserve_interword_spaces:
                "1"
        });

        for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber++
        ) {
            const page = await pdf.getPage(
                pageNumber
            );

            // Scale 2 ช่วยให้ OCR อ่านชัดขึ้น
            // และไม่ใช้ RAM มากเกินไป

            const viewport =
                page.getViewport({
                    scale: 2
                });

            const width = Math.ceil(
                viewport.width
            );

            const height = Math.ceil(
                viewport.height
            );

            const canvas = createCanvas(
                width,
                height
            );

            const context =
                canvas.getContext("2d");

            // ทำพื้นหลังให้เป็นสีขาว
            // ป้องกัน PDF โปร่งใสทำให้ OCR อ่านยาก

            context.fillStyle = "#ffffff";

            context.fillRect(
                0,
                0,
                width,
                height
            );

            await page.render({
                canvasContext: context,
                viewport,
                canvas
            }).promise;

            const imageBuffer =
                canvas.toBuffer(
                    "image/png"
                );

            const result =
                await worker.recognize(
                    imageBuffer
                );

            pages.push(
                result?.data?.text || ""
            );

            console.log(
                `OCR Page ${pageNumber}/${pdf.numPages}`
            );

            page.cleanup();
        }
    } finally {
        if (worker) {
            await worker.terminate();
        }

        await pdf.destroy();
    }

    return cleanText(
        pages.join("\n")
    );
}

// ============================
// อ่าน PDF หลัก
// ============================

async function readPDF(buffer) {
    if (
        !Buffer.isBuffer(buffer) ||
        buffer.length === 0
    ) {
        throw new Error(
            "PDF buffer is empty"
        );
    }

    let text = "";

    // พยายามอ่าน Text Layer ก่อน

    try {
        text =
            await extractTextLayer(
                buffer
            );

        console.log(
            "อ่านด้วย pdfjs-dist สำเร็จ"
        );

        console.log(
            "Text Layer Length:",
            text.length
        );
    } catch (error) {
        console.error(
            "อ่าน Text Layer ไม่สำเร็จ:",
            error.message
        );
    }

    // มีข้อความแล้ว ไม่ต้องทำ OCR

    if (text.length >= 20) {
        return text;
    }

    // ไม่มี Text Layer ให้ทำ OCR

    try {
        text =
            await extractTextWithOcr(
                buffer
            );

        console.log(
            "OCR Text Length:",
            text.length
        );
    } catch (error) {
        console.error(
            "OCR ERROR:",
            error.message
        );

        throw new Error(
            `ไม่สามารถอ่านข้อความ PDF ได้: ${error.message}`
        );
    }

    if (text.length < 10) {
        throw new Error(
            "PDF ไม่มีข้อความหลังทำ OCR"
        );
    }

    return text;
}

module.exports = {
    readPDF
};