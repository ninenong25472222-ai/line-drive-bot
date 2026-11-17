const Booking = require("../models/booking");

function oneLine(value = "") {
    return String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/[\t\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function field(source, pattern) {
    return oneLine(source.match(pattern)?.[1] || "");
}

function normalizeDate(value = "") {
    const match = String(value).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!match) return "";
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year >= 2400) year -= 543;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function section(text, startPattern, endPattern) {
    const start = text.search(startPattern);
    if (start < 0) return "";
    const tail = text.slice(start);
    const end = tail.slice(1).search(endPattern);
    return end < 0 ? tail : tail.slice(0, end + 1);
}

function parseJirapornBooking(inputText = "") {
    const rawText = String(inputText ?? "").replace(/\r/g, "\n");
    // PDF.js can insert a space between every Thai glyph in this template.
    // Join Thai-to-Thai glyphs for matching while retaining real Latin spaces.
    const text = rawText.replace(/(?<=[\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/gu, "");
    const booking = Booking();
    booking.company = "Jiraporn";
    booking.rawText = rawText;

    booking.bookingNo = field(text, /เลข\s*(?:ที่|ที)\s*(?:การ\s*)?ใบ\s*จอง\s*[:：#]?\s*([A-Za-z0-9-]+)/i);
    booking.customerName = field(text, /ข้อมูล\s*ลูกค้า\s*[:：]?\s*(.+?)(?=\s*(?:จำนวน\s*วัน|จำนวน\s*ชั่วโมง|เบอร์\s*โทร\s*ติดต่อ|Pick\s*Up|Return|คิดเป็นจำนวน))/i);
    booking.renter = booking.customerName;
    booking.customerPhone = field(text, /เบอร์\s*โทร\s*ติดต่อ\s*[:：]?\s*([+\d][+\d()\s-]{6,})/i).replace(/[\s()-]/g, "");
    booking.phone = booking.customerPhone;

    const pickup = section(text, /Pick\s*Up\s*\/\s*รับรถ/i, /Return\s*\/\s*คืนรถ/i);
    const returned = section(text, /Return\s*\/\s*คืนรถ/i, /รายละเอียดการชำระเงิน|รายละเอียดรถเช่า|คำขอพิเศษ/i);
    const pickupDateRaw = field(pickup, /วัน\s*(?:ที่|ที)\s*[:：]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/);
    const returnDateRaw = field(returned, /วัน\s*(?:ที่|ที)\s*[:：]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/);
    booking.pickupDate = normalizeDate(pickupDateRaw);
    booking.returnDate = normalizeDate(returnDateRaw);
    booking.pickupTime = field(pickup, /เวลา\s*[:：]?\s*(\d{1,2}\s*:\s*\d{2})/).replace(/\s/g, "");
    booking.returnTime = field(returned, /เวลา\s*[:：]?\s*(\d{1,2}\s*:\s*\d{2})/).replace(/\s/g, "");
    booking.pickupLocation = field(pickup, /สถาน\s*(?:ที่|ที)\s*(?:รับ|ส่ง)\s*[:：]?\s*(.+?)(?=\s*(?:Return|รายละเอียด|$))/i);
    booking.returnLocation = field(returned, /สถาน\s*(?:ที่|ที)\s*คืน\s*[:：]?\s*(.+?)(?=\s*(?:รายละเอียด|คำขอ|$))/i);

    const car = field(text, /รายละเอียดรถเช่า\s*([\s\S]*?)(?=คำขอพิเศษ|เอกสารจำเป็น|นโยบาย|$)/i);
    const model = oneLine(car.split(/(?:คำขอพิเศษ|เอกสารจำเป็น|นโยบาย)/i)[0]);
    booking.car = model || "";
    return booking;
}

module.exports = parseJirapornBooking;
