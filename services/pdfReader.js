const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

async function readPDF(buffer) {

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer)
    });

    const pdf = await loadingTask.promise;

    let text = "";

    for (let page = 1; page <= pdf.numPages; page++) {

        const p = await pdf.getPage(page);

        const content = await p.getTextContent();

        text += content.items
            .map(item => item.str)
            .join("\n");

        text += "\n";
    }

    text = text
        .replace(/\u0000/g, "")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    console.log("อ่านด้วย pdfjs-dist สำเร็จ");
    console.log("Text Length:", text.length);

    return text;
}

module.exports = {
    readPDF
};