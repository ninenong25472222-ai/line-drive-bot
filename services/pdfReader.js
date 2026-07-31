const pdf = require("pdf-parse");

async function readPDF(buffer){

    const result = await pdf(buffer);

    return result.text;

}

module.exports = {
    readPDF
};