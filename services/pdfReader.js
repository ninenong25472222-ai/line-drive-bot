const canvasLibrary = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");

const {
    createCanvas,
    DOMMatrix,
    ImageData,
    Path2D
} = canvasLibrary;

// ============================
// Canvas globals สำหรับ PDF.js
// ============================

if (
    typeof global.DOMMatrix === "undefined" &&
    DOMMatrix
) {
    global.DOMMatrix = DOMMatrix;
}

if (
    typeof global.ImageData === "undefined" &&
    ImageData
) {
    global.ImageData = ImageData;
}

if (
    typeof global.Path2D === "undefined" &&
    Path2D
) {
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
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// ============================
// เปิดไฟล์ PDF
// ============================

async function openPdf(buffer) {
    if (
        !Buffer.isBuffer(buffer) ||
        buffer.length === 0
    ) {
        throw new Error(
            "PDF buffer is empty"
        );
    }

    const pdfjs = await loadPdfJs();

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
        useSystemFonts: true,
        isEvalSupported: false
    });

    const pdfDocument =
        await loadingTask.promise;

    return {
        pdfDocument,
        loadingTask
    };
}

// ============================
// ปิด PDF อย่างปลอดภัย
// ============================

async function closePdf(handle) {
    if (!handle) {
        return;
    }

    const {
        pdfDocument,
        loadingTask
    } = handle;

    // ทำความสะอาดข้อมูลของเอกสาร

    try {
        if (
            pdfDocument &&
            typeof pdfDocument.cleanup ===
                "function"
        ) {
            await pdfDocument.cleanup();
        }
    } catch (error) {
        console.error(
            "PDF cleanup warning:",
            error.message
        );
    }

    // PDF.js ให้ปิดผ่าน loadingTask

    try {
        if (
            loadingTask &&
            typeof loadingTask.destroy ===
                "function"
        ) {
            await loadingTask.destroy();
            return;
        }
    } catch (error) {
        console.error(
            "PDF loadingTask destroy warning:",
            error.message
        );
    }

    // สำรองสำหรับ PDF.js บางเวอร์ชัน

    try {
        if (
            pdfDocument &&
            typeof pdfDocument.destroy ===
                "function"
        ) {
            await pdfDocument.destroy();
        }
    } catch (error) {
        console.error(
            "PDF document destroy warning:",
            error.message
        );
    }
}

// ============================
// อ่าน Text Layer
// ============================

async function extractTextLayer(buffer) {
    const handle = await openPdf(buffer);

    const {
        pdfDocument
    } = handle;

    const pages = [];

    try {
        for (
            let pageNumber = 1;
            pageNumber <=
            pdfDocument.numPages;
            pageNumber++
        ) {
            let page = null;

            try {
                page =
                    await pdfDocument.getPage(
                        pageNumber
                    );

                const content =
                    await page.getTextContent();

                let pageText = "";

                for (
                    const item of
                    content.items || []
                ) {
                    const value = String(
                        item.str || ""
                    ).trim();

                    if (!value) {
                        continue;
                    }

                    pageText += value;

                    if (item.hasEOL) {
                        pageText += "\n";
                    } else {
                        pageText += " ";
                    }
                }

                pages.push(
                    cleanText(pageText)
                );
            } finally {
                try {
                    if (
                        page &&
                        typeof page.cleanup ===
                            "function"
                    ) {
                        page.cleanup();
                    }
                } catch (error) {
                    console.error(
                        `Page ${pageNumber} cleanup warning:`,
                        error.message
                    );
                }
            }
        }
    } finally {
        await closePdf(handle);
    }

    return cleanText(
        pages.join("\n")
    );
}

// ============================
// สร้าง OCR Worker
// ============================

async function createOcrWorker() {
    // ค่าเริ่มต้นใช้ภาษาอังกฤษ
    // ตั้ง OCR_LANGUAGES=eng+tha
    // ใน Railway ได้เมื่อต้องการ OCR ไทย

    const languages =
        process.env.OCR_LANGUAGES ||
        "eng";

    console.log(
        "OCR Languages:",
        languages
    );

    const worker =
        await createWorker(languages);

    try {
        await worker.setParameters({
            preserve_interword_spaces:
                "1"
        });
    } catch (error) {
        console.error(
            "OCR parameter warning:",
            error.message
        );
    }

    return worker;
}

// ============================
// OCR PDF ทุกหน้า
// ============================

async function extractTextWithOcr(
    buffer
) {
    const handle = await openPdf(buffer);

    const {
        pdfDocument
    } = handle;

    const pages = [];

    let worker = null;

    try {
        console.log(
            "PDF ไม่มี Text Layer เริ่ม OCR..."
        );

        worker =
            await createOcrWorker();

        const scaleFromEnv = Number(
            process.env.OCR_SCALE || 2
        );

        const scale =
            Number.isFinite(scaleFromEnv) &&
            scaleFromEnv >= 1 &&
            scaleFromEnv <= 3
                ? scaleFromEnv
                : 2;

        for (
            let pageNumber = 1;
            pageNumber <=
            pdfDocument.numPages;
            pageNumber++
        ) {
            let page = null;

            try {
                page =
                    await pdfDocument.getPage(
                        pageNumber
                    );

                const viewport =
                    page.getViewport({
                        scale
                    });

                const width = Math.ceil(
                    viewport.width
                );

                const height = Math.ceil(
                    viewport.height
                );

                const canvas =
                    createCanvas(
                        width,
                        height
                    );

                const context =
                    canvas.getContext("2d");

                // พื้นหลังสีขาวช่วยให้ OCR
                // อ่าน PDF โปร่งใสได้ดีขึ้น

                context.fillStyle =
                    "#ffffff";

                context.fillRect(
                    0,
                    0,
                    width,
                    height
                );

                const renderTask =
                    page.render({
                        canvasContext:
                            context,
                        viewport,
                        canvas
                    });

                await renderTask.promise;

                const imageBuffer =
                    canvas.toBuffer(
                        "image/png"
                    );

                const result =
                    await worker.recognize(
                        imageBuffer
                    );

                const pageText =
                    result &&
                    result.data
                        ? result.data.text ||
                          ""
                        : "";

                pages.push(pageText);

                console.log(
                    `OCR Page ${pageNumber}/${pdfDocument.numPages}`
                );
            } catch (error) {
                console.error(
                    `OCR Page ${pageNumber} error:`,
                    error.message
                );

                // อ่านหน้าถัดไปต่อ
                pages.push("");
            } finally {
                try {
                    if (
                        page &&
                        typeof page.cleanup ===
                            "function"
                    ) {
                        page.cleanup();
                    }
                } catch (error) {
                    console.error(
                        `OCR Page ${pageNumber} cleanup warning:`,
                        error.message
                    );
                }
            }
        }
    } finally {
        // ปิด OCR Worker ก่อน

        if (worker) {
            try {
                await worker.terminate();
            } catch (error) {
                console.error(
                    "OCR worker terminate warning:",
                    error.message
                );
            }
        }

        // แล้วจึงปิด PDF

        await closePdf(handle);
    }

    return cleanText(
        pages.join("\n")
    );
}

// ============================
// ฟังก์ชันหลัก
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

    // ========================
    // ขั้นที่ 1: Text Layer
    // ========================

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

        text = "";
    }

    // มีข้อความเพียงพอแล้ว
    // ไม่จำเป็นต้อง OCR

    if (
        text &&
        text.trim().length >= 20
    ) {
        return text;
    }

    // ========================
    // ขั้นที่ 2: OCR
    // ========================

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

    if (
        !text ||
        text.trim().length < 10
    ) {
        throw new Error(
            "PDF ไม่มีข้อความหลังทำ OCR"
        );
    }

    return text;
}

module.exports = {
    readPDF
};