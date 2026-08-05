const {readPDF}=require("./services/pdfReader");
const parserService=require("./services/parserService");
require("dotenv").config();

const express = require("express");
const { messagingApi, middleware } = require("@line/bot-sdk");
const axios = require("axios");
const { google } = require("googleapis");
const stream = require("stream");

const app = express();


// LINE CONFIG

const lineConfig = {
  channelSecret: process.env.CHANNEL_SECRET
};


const client = new messagingApi.MessagingApiClient({

  channelAccessToken:
    process.env.CHANNEL_ACCESS_TOKEN

});



// GOOGLE OAUTH

const auth = new google.auth.OAuth2(

  process.env.GOOGLE_CLIENT_ID,

  process.env.GOOGLE_CLIENT_SECRET

);


auth.setCredentials({

  refresh_token:
    process.env.GOOGLE_REFRESH_TOKEN

});


// -------------------------------
// Helpers
// -------------------------------

function formatDate(date) {

    if (!date) return "-";

    if(typeof date === "string") return date;

    const d = new Date(date);

    if (isNaN(d.getTime())) {
        return "-";
    }

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);

    return `${day}/${month}/${year}`;
}


// WEBHOOK

app.post(

  "/webhook",

    (req,res,next)=>{
    console.log("WEBHOOK HIT");
    next();
  },

  middleware(lineConfig),

  async(req,res)=>{


    try{


      await Promise.all(

        req.body.events.map(handleEvent)

      );


      res.sendStatus(200);


    }catch(err){


      console.log(err);

      res.sendStatus(500);


    }


  }

);






async function handleEvent(event){
    try{

  if(

    event.type !== "message" ||

    event.message.type !== "file"

  ){

    return;

  }




  const messageId =
    event.message.id;


  const fileName =
    event.message.fileName;



  console.log(
    "รับไฟล์:",
    fileName
  );




  // โหลดไฟล์จาก LINE


  const response = await axios({

    method:"get",

    url:

    `https://api-data.line.me/v2/bot/message/${messageId}/content`,

    responseType:"arraybuffer",

    headers:{


      Authorization:

      `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`


    }


  });



  const buffer =
    Buffer.from(response.data);
let booking={};

if(fileName.toLowerCase().endsWith(".pdf")){

    const text = await readPDF(buffer);

    booking = parserService.parse(text) || {};

    console.log(text.substring(0,500));

}

booking.company = booking.company || "Other";

// เริ่ม Google Drive
const drive = google.drive({

    version:"v3",

    auth

  });




  const upload =
  await drive.files.create({


    requestBody:{


      name:fileName,


      parents:[

        process.env.GOOGLE_DRIVE_FOLDER_ID

      ]


    },


    media:{


      body:

      stream.Readable.from(buffer)


    },


    fields:"id"


  });




  const fileId =
    upload.data.id;




  // เปิดสิทธิ์ดูไฟล์


  await drive.permissions.create({


    fileId:fileId,


    requestBody:{


      role:"reader",

      type:"anyone"


    }


  });





  const link =

  `https://drive.google.com/file/d/${fileId}/view`;

if (booking) {

    booking.driveFileId = fileId;

    booking.fileName = fileName;

    booking.pdfLink = link;

}

    booking.customerName =
    booking.customerName ||
    booking.renter ||
    "";

    booking.customerPhone =
    booking.customerPhone ||
    booking.phone ||
    "";

const sheets = google.sheets({
    version: "v4",
    auth
});

await sheets.spreadsheets.values.append({

    spreadsheetId: process.env.GOOGLE_SHEET_ID,

    range: "Booking!A:N",

    valueInputOption: "USER_ENTERED",

    requestBody: {

        values: [
            [
                new Date(),
                booking.company || "",
                booking.bookingNo || "",
                booking.customerName || "",
                booking.customerPhone || "",
                formatDate(booking.pickupDate || ""),
                booking.pickupTime || "",
                booking.pickupLocation || "",

                formatDate(booking.returnDate || ""),
                booking.returnTime || "",
                booking.returnLocation || "",
                booking.car || "",
                fileName,
                link
            ]
        ]

    }

});


    console.log(booking.company, booking.bookingNo);
    console.log(booking);
// -------------------------------
// ตอบกลับ LINE
// -------------------------------

await client.replyMessage({

    replyToken: event.replyToken,

    messages: [

        {

            type: "text",

           text:

`✅ บันทึกไฟล์แล้ว ${booking?.company || ""}
👤 ${booking.customerName || "-"}
📞 ${booking.customerPhone || "-"}

🚗 รับรถ
${formatDate(booking?.pickupDate)} ${booking?.pickupTime || "-"}
${booking?.pickupLocation || "-"}
🔄 คืนรถ
${formatDate(booking?.returnDate)} ${booking?.returnTime || "-"}
${booking?.returnLocation || "-"}

🚙 ${booking.car || "-"}

📄 ${fileName}

📂 เปิดไฟล์
${link}`

        }

    ]

});



    }catch(err){
        console.error(err);
        if(event.replyToken){
            try{
                await client.replyMessage({
                    replyToken:event.replyToken,
                    messages:[
                        {
                            type:"text",
                            text:"❌ ไม่สามารถประมวลผลไฟล์ได้"
                        }
                    ]
                });
            }catch{}
        }
    }
}






app.get("/", (req,res)=>{
    res.send("LINE Drive Bot Running");
});

app.use((err,req,res,next)=>{
    console.error(err);
    res.sendStatus(500);
});

app.listen(
    process.env.PORT || 3000,
    ()=>{
        console.log("Bot Started");
    }
);