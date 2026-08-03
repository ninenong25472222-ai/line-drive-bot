const pdf = require("pdf-parse");
const fs = require("fs");
const { readByOCR } = require("./ocrService");

async function readPDF(buffer) {

    // =========================
    // ลองอ่านด้วย pdf-parse
    // =========================

    const result = await pdf(buffer);

    let text = (result.text || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    console.log("Text Length:", text.length);

    // =========================
    // ถ้า PDF มี Text Layer
    // =========================

    if (text.length > 20) {

        console.log("อ่านด้วย pdf-parse สำเร็จ");

        fs.writeFileSync("debug.txt", text, "utf8");

        return text;

    }

    // =========================
    // ไม่มีข้อความ ใช้ OCR.Space
    // =========================

    console.log("ไม่พบ Text Layer");
    console.log("กำลังใช้ OCR.Space...");

    text = await readByOCR(buffer);

    console.log("OCR Length:", text.length);

    fs.writeFileSync("debug.txt", text, "utf8");

    return text;

}

module.exports = {
    readPDF
};