const pdf = require("pdf-parse");
const fs = require("fs");

async function readPDF(buffer){

    const result = await pdf(buffer);

    // บันทึกข้อความที่อ่านได้ทั้งหมด
    fs.writeFileSync("debug.txt", result.text, "utf8");

    console.log("สร้างไฟล์ debug.txt เรียบร้อย");

    return result.text;

}

module.exports = {
    readPDF
};