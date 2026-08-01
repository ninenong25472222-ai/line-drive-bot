const pdf = require("pdf-parse");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const { fromBuffer } = require("pdf2pic");

async function readPDF(buffer) {

    // -------------------------
    // ลองอ่านด้วย pdf-parse ก่อน
    // -------------------------
    const result = await pdf(buffer);

    let text = result.text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    // ถ้าอ่านได้ ใช้เลย
    if (text.length > 20) {

        fs.writeFileSync("debug.txt", text, "utf8");

        console.log("อ่านด้วย pdf-parse สำเร็จ");

        return text;

    }

    console.log("ไม่พบ Text Layer ใช้ OCR...");

    // -------------------------
    // แปลง PDF หน้าแรกเป็นรูป
    // -------------------------
    const convert = fromBuffer(buffer, {
        density: 300,
        format: "png",
        width: 2480,
        height: 3508,
        savePath: "./temp"
    });

    const page = await convert(1);

    // -------------------------
    // OCR
    // -------------------------
    const ocr = await Tesseract.recognize(
        page.path,
        "eng",
        {
            logger: m => {
                if (m.status === "recognizing text") {
                    console.log(
                        `OCR : ${Math.round(m.progress * 100)}%`
                    );
                }
            }
        }
    );

    text = ocr.data.text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    fs.writeFileSync("debug.txt", text, "utf8");

    console.log("OCR เสร็จสิ้น");

    return text;

}

module.exports = {
    readPDF
};