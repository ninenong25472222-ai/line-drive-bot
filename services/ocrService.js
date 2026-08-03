const axios = require("axios");
const FormData = require("form-data");

async function readByOCR(buffer) {

    const form = new FormData();

    form.append("apikey", process.env.OCR_SPACE_API_KEY);
    form.append("language", "eng");
    form.append("isOverlayRequired", "false");
    form.append("OCREngine", "2");
    form.append("file", buffer, {
        filename: "upload.pdf",
        contentType: "application/pdf"
    });

    const response = await axios.post(
        "https://api.ocr.space/parse/image",
        form,
        {
            headers: form.getHeaders(),
            maxBodyLength: Infinity
        }
    );

    const data = response.data;

    if (data.IsErroredOnProcessing) {

        console.log("OCR ERROR");

        console.log(data.ErrorMessage);

        return "";

    }

    let text = "";

    for (const page of data.ParsedResults || []) {

        text += page.ParsedText + "\n";

    }

    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

}

module.exports = {
    readByOCR
};