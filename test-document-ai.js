const fs = require("fs");
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

process.env.GOOGLE_APPLICATION_CREDENTIALS = "./vision-key.json";

const client = new DocumentProcessorServiceClient();

const PROJECT_ID = "1097901535225";
const LOCATION = "us";
const PROCESSOR_ID = "8ff3c1edaa0c5736";

const NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;

async function main() {

    const filePath = "./sample.pdf"; // เปลี่ยนเป็นชื่อไฟล์ PDF ที่จะทดสอบ

    const imageFile = fs.readFileSync(filePath);

    const encoded = imageFile.toString("base64");

    const request = {
        name: NAME,
        rawDocument: {
            content: encoded,
            mimeType: "application/pdf"
        }
    };

    const [result] = await client.processDocument(request);

    const text = result.document.text || "";

    console.log("========== TEXT ==========\n");
    console.log(text);

    fs.writeFileSync("debug.txt", text, "utf8");

    console.log("\n==========================");
    console.log("Saved to debug.txt");
}

main().catch(console.error);