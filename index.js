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

    const d = new Date(date);

    if (isNaN(d.getTime())) {
        return date;
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

  console.log("====== EVENT ======");
  console.log(JSON.stringify(event, null, 2));

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
let booking=null;

if(fileName.toLowerCase().endsWith(".pdf")){

    const text=await readPDF(buffer);

    console.log("===== PDF TEXT =====");
    console.log(text);
    console.log("====================");

    booking=parserService.parse(text);

    console.log("----------------------------");

    console.log("Company :",booking.company);

    console.log("----------------------------");

    console.log("===== BOOKING =====");
    console.log(booking);
    console.log("===================");
}

if (!booking) {
    booking = {};
}


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


    }


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

    version:"v4",

    auth

  });



  await sheets.spreadsheets.values.append({



    spreadsheetId:

      process.env.GOOGLE_SHEET_ID,


    range:"Sheet!A:N",


    valueInputOption:"USER_ENTERED",


    requestBody:{


values: [
  [
    new Date(),
    fileName,

    booking.customerName || "",
    booking.customerPhone || "", 

    booking?.bookingNo || "",

    booking?.pickupDate || "",
    booking?.pickupTime || "",
    booking?.pickupLocation || "",

    booking?.returnDate || "",
    booking?.returnTime || "",
    booking?.returnLocation || "",

    booking?.car || "",

    booking?.company || "",

    link
  ]
]

    }


  });


  console.log("LINK =", link);
  console.log("CAR =", booking.car || "");
  console.log("CAR LENGTH =", (booking.car || "").length);
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

🚙 ${(booking.car || "").substring(0,30)}

📄 ${fileName}

📂 เปิดไฟล์
${link}`

        }

    ]

});



}






app.get("/",(req,res)=>{


  res.send(
    "LINE Drive Bot Running"
  );


});




app.use((err, req, res, next) => {

  console.error("========== ERROR ==========");
  console.error(err);
  console.error("===========================");

  res.sendStatus(500);

});


app.listen(

  process.env.PORT || 3000,

  ()=>{


    console.log(
      "Bot Started"
    );


  }

);