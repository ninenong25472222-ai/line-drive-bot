require("dotenv").config();

const { google } = require("googleapis");
const readline = require("readline");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "http://localhost"
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets"
  ]
});

console.log("\nเปิดลิงก์นี้:\n");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("\nใส่ Code จาก Google: ", async (code) => {
  const { tokens } = await oauth2Client.getToken(code);

  console.log(tokens);

  rl.close();
});