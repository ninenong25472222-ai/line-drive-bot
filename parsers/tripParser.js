const Booking = require("../models/booking");

function parseTrip(text) {
    // -----------------------
    // Normalize PDF Text
    // -----------------------
    text = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // -----------------------------
    // Booking Number
    // -----------------------------
    const bookingNo = text.match(
        /(?:หมายเลขการจอง|Booking\s*(?:No\.?|Number)|Confirmation\s*(?:No\.?|Number))[:\s]*([A-Za-z0-9]+)/i
    );

    if (bookingNo) {
        booking.bookingNo = bookingNo[1].trim();
    }

    // -----------------------------
    // Customer Name
    // -----------------------------
    let customerName = null;

    // English PDFs: name sits right under "Main Driver Name"
    const mainDriver = text.match(
        /(?:ชื่อผู้ขับขี่หลัก|Main Driver Name)\s*\n\s*([^\n]+)/i
    );

    if (mainDriver) {
        customerName = mainDriver[1].trim();
    } else {
        // Fallback: Thai PDFs list the name(s) as ALL-CAPS lines right before "รายละเอียดรถ"
        const lines = text
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        const detailIndex = lines.findIndex(
            x =>
                x.includes("รายละเอียดรถ") ||
                x.includes("รายละเอียด รถ") ||
                /vehicle\s*details/i.test(x) ||
                /car\s*details/i.test(x)
        );

        if (detailIndex > 0) {
            const names = [];
            for (let i = detailIndex - 1; i >= 0; i--) {
                if (/^[A-Zก-๙ ]+$/.test(lines[i])) {
                    names.unshift(lines[i]);
                } else {
                    break;
                }
            }
            customerName = names.join(" ");
        }
    }

    booking.customerName = customerName || "";
    booking.renter = booking.customerName;

    // -----------------------------
    // Vehicle
    // -----------------------------
    const car = text.match(
        /(?:ประเภทรถ|Vehicle\s*Type|Car\s*Type)\s*([\s\S]*?)(?:ระบบเกียร์|Transmission)/i
    );

    if (car) {
        booking.car = car[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .replace(/หรือรุ่น[\s\S]*/i, "")
            .replace(/or\s+similar[\s\S]*/i, "")
            .trim();
    }

    // -----------------------------
    // Pickup / Return date-time parsing
    // -----------------------------
    // Handles both:
    //   Thai style:    "5 สิงหาคม 2026" + "18:30"
    //   English style: "6:30 PM, Aug 5, 2026"
    function parseDateTimeLine(line) {
        let date = null, time = null;

        const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:[AP]M)?)/i);
        if (timeMatch) time = timeMatch[1].trim();

        let dateMatch = line.match(/(\d{1,2}\s+[A-Za-zก-๙\.]+\s+\d{4})/); // "5 August 2026"
        if (!dateMatch) {
            dateMatch = line.match(/([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/); // "Aug 5, 2026"
        }
        if (dateMatch) date = dateMatch[1].trim();

        return { date, time };
    }

    // -----------------------------
    // Pickup
    // -----------------------------
    const pickup = text.match(
        /(?:จุดรับรถ)\s*\n([^\n]+)\n([^\n]+)/i
    ) || text.match(
        /(?:^|\n)\s*#?\s*Pick-up\s*\n\s*([A-Za-z][^\n]*)\n\s*([^\n]*?\d{1,2}:\d{2}[^\n]*?\d{4}[^\n]*)/i
    );

    if (pickup) {
        booking.pickupLocation = pickup[1].trim();
        const { date, time } = parseDateTimeLine(pickup[2]);
        booking.pickupDate = date;
        booking.pickupTime = time;
    }

    // -----------------------------
    // Return
    // -----------------------------
    const dropoff = text.match(
        /(?:จุดคืนรถ)\s*\n([^\n]+)\n([^\n]+)/i
    ) || text.match(
        /(?:^|\n)\s*#?\s*Drop-off\s*\n\s*([A-Za-z][^\n]*)\n\s*([^\n]*?\d{1,2}:\d{2}[^\n]*?\d{4}[^\n]*)/i
    );

    if (dropoff) {
        booking.returnLocation = dropoff[1].trim();
        const { date, time } = parseDateTimeLine(dropoff[2]);
        booking.returnDate = date;
        booking.returnTime = time;
    }

    // -----------------------------
    // Email (ไม่มีใน PDF)
    // -----------------------------
    booking.customerEmail = "";

    // -----------------------------
    // Phone
    // -----------------------------
    // Prefer +66 international format first; fall back to local 0XXXXXXXXX
    // with digit-boundary guards so it never grabs part of a longer number
    // (e.g. the Pick-up Voucher No. "009990301967").
    let phone = text.match(/\+66[\s-]?\d[\d\s-]{6,}\d/);
    if (!phone) phone = text.match(/(?<!\d)0\d{9}(?!\d)/);

    if (phone) {
        booking.customerPhone = phone[0].replace(/[\s-]/g, "");
    }

    return booking;
}

module.exports = parseTrip;