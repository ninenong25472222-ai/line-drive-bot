const pdf = require("pdf-parse");

async function readPDF(buffer) {

    const result = await pdf(buffer);

    console.log("Text Length:", result.text.length);
    console.log(result.text);

    return result.text;

}

module.exports = {
    readPDF
};