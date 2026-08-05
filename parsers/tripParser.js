function fixBrokenText(rawText) {
  // รวมบรรทัดที่ถูกตัดแยก โดยรวมเป็นบรรทัดยาว ๆ เพื่อง่ายต่อการจับข้อมูล
  return rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

// ฟังก์ชันช่วยแปลงวันที่ภาษาไทยเป็นรูปแบบมาตรฐาน (เช่น 1 ส.ค. 2566 -> 1 Aug 2023)
// (ถ้าอยากนำไปใช้จริง อาจใช้ไลบรารีเสริม แต่ตัวอย่างนี้แปลงง่าย ๆ)
function thaiDateToEnglish(thaiDate) {
  const monthMap = {
    ม.ค: "Jan",
    มกราคม: "Jan",
    ก.พ: "Feb",
    กุมภาพันธ์: "Feb",
    มี.ค: "Mar",
    มีนาคม: "Mar",
    เม.ย: "Apr",
    เมษายน: "Apr",
    พ.ค: "May",
    พฤษภาคม: "May",
    มิ.ย: "Jun",
    มิถุนายน: "Jun",
    ก.ค: "Jul",
    กรกฎาคม: "Jul",
    ส.ค: "Aug",
    สิงหาคม: "Aug",
    ก.ย: "Sep",
    กันยายน: "Sep",
    ต.ค: "Oct",
    ตุลาคม: "Oct",
    พ.ย: "Nov",
    พฤศจิกายน: "Nov",
    ธ.ค: "Dec",
    ธันวาคม: "Dec",
  };
  // ตัวอย่างเช่น "1 ส.ค. 2566" -> แปลงปี 2566 เป็น 2023
  const parts = thaiDate.trim().split(" ");
  if (parts.length < 3) return thaiDate;
  let day = parts[0];
  let month = monthMap[parts[1].replace(".", "")] || parts[1];
  let year = parseInt(parts[2]) - 543;
  return `${day} ${month} ${year}`;
}

function parseTrip(rawText) {
  const text = fixBrokenText(rawText);

  const booking = { company: "Trip", rawText: text };

  // Booking number
  let m =
    text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i) ||
    text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i);
  if (m) booking.bookingNo = m[1].trim();

  // Customer name (ชื่อผู้ขับขี่ / ชื่อผู้โดยสาร)
  m =
    text.match(/ชื่อผู้ขับขี่\s*:?\s*([^\d\n,]+)/i) ||
    text.match(/ชื่อผู้โดยสาร\s*:?\s*([^\d\n,]+)/i);
  if (m) {
    booking.customerName = m[1].trim();
    booking.renter = booking.customerName;
  }

  // Customer phone (รองรับเบอร์โทร +66 ...)
  m = text.match(/\+66[- ]?\d[\d -]{7,}/);
  if (m) booking.customerPhone = m[0].replace(/[\s-]/g, "");

  // Car type
  m =
    text.match(/ประเภทรถ\s*:?\s*([\w\sก-๙]+)(?:หรือรุ่น)?/i) ||
    text.match(/Car type\s*([\s\S]*?)Transmission/i);
  if (m) {
    booking.car = m[1]
      .replace(/or similar/i, "")
      .replace(/หรือรุ่น.*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Helper function ดึงสถานที่ + วันเวลา จากบล็อกข้อความ
  function extractLocationDateTime(section) {
    let result = {};

    // ตำแหน่ง (เช่น Surat Thani Airport หรือ ข้อความไทยที่ไม่ใช่ตัวเลขยาว ๆ)
    let loc =
      section.match(/([A-Za-z\s]+Airport|[^\d]+\d{5}?|[^\d]{5,})/i) || null;
    if (loc) result.location = loc[0].trim();

    // วันที่และเวลา - ภาษาอังกฤษ
    let dt = section.match(
      /(\d{1,2}:\d{2}\s*(?:AM|PM)?).{0,15}?([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/i
    );
    if (dt) {
      result.time = dt[1];
      result.date = dt[2];
      return result;
    }
    // วันที่และเวลา - ภาษาไทย (1 ส.ค. 2566 08:30 หรือ 1 สิงหาคม 2566 08:30 น.)
    dt = section.match(/(\d{1,2}\s+\S+\s+\d{4})\s+(\d{1,2}:\d{2})(?:\s*น\.?)?/);
    if (dt) {
      result.date = thaiDateToEnglish(dt[1]);
      result.time = dt[2];
      return result;
    }

    return result;
  }

  // จุดรับรถ + วัน เวลา
  m =
    text.match(
      /จุดรับรถ\s*:?\s*([\s\S]*?)(?=หมายเลขติดต่อ|หมายเลขโทรศัพท์|เวลาทําการ|จุดคืนรถ|Drop-off|Pick-up|$)/i
    ) || text.match(/Pick-up\s*([\s\S]*?)Drop-off/i);
  if (m) {
    const pickupInfo = extractLocationDateTime(m[1]);
    if (pickupInfo.location) booking.pickupLocation = pickupInfo.location;
    if (pickupInfo.date) booking.pickupDate = pickupInfo.date;
    if (pickupInfo.time) booking.pickupTime = pickupInfo.time;
  }

  // จุดคืนรถ + วัน เวลา
  m =
    text.match(
      /จุดคืนรถ\s*:?\s*([\s\S]*?)(?=หมายเลขติดต่อ|หมายเลขโทรศัพท์|เวลาทําการ|วิธีการคืนรถ|Pick-up|Drop-off|$)/i
    ) || text.match(/Drop-off\s*([\s\S]*?)Pick-up Guide/i);
  if (m) {
    const returnInfo = extractLocationDateTime(m[1]);
    if (returnInfo.location) booking.returnLocation = returnInfo.location;
    if (returnInfo.date) booking.returnDate = returnInfo.date;
    if (returnInfo.time) booking.returnTime = returnInfo.time;
  }

  return booking;
}

module.exports = parseTrip;
