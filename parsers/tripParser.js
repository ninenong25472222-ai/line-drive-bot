const Booking = require("../models/booking");

function clean(str = "") {
    return String(str)
        .replace(/\u0000/g, "")
        .replace(/[ ]+/g, " ")
        .trim();
}

function parseTrip(text) {

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    text = text
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ");

    const lines = text
        .split("\n")
        .map(x => clean(x))
        .filter(x => x.length);

    // -----------------------
    // Booking No
    // -----------------------

    let m =
        text.match(/Booking\s*No\.?\s*:?\s*([A-Z0-9]+)/i) ||
        text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i);

    if (m)
        booking.bookingNo = clean(m[1]);

    // -----------------------
    // Phone
    // -----------------------

    m = text.match(/\+66[- ]?\d[\d -]{7,}/);

    if (m)
        booking.customerPhone =
            m[0].replace(/[ -]/g, "");

    // -----------------------
    // Customer
    // -----------------------

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i];

        if (
            /Main Driver Name/i.test(line) ||
            /ผู้ขับ/i.test(line)
        ) {

            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {

                if (/^[A-Z][A-Z\s]{4,}$/.test(lines[j])) {

                    booking.customerName = clean(lines[j]);
                    booking.renter = booking.customerName;
                    break;

                }

            }

        }

    }

    // ถ้ายังหาไม่ได้
    if (!booking.customerName) {

        for (const line of lines) {

            if (/^[A-Z][A-Z\s]{5,}$/.test(line)) {

                if (
                    !line.includes("TRIP") &&
                    !line.includes("AIRPORT") &&
                    !line.includes("THAILAND")
                ) {

                    booking.customerName = clean(line);
                    booking.renter = booking.customerName;
                    break;

                }

            }

        }

    }
    // -----------------------
    // Car
    // -----------------------

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i];

        // English PDF
        if (/Car type/i.test(line)) {

            let car = "";

            for (let j = i; j < Math.min(i + 5, lines.length); j++) {

                if (
                    lines[j].match(
                        /(Honda|Toyota|Mitsubishi|Nissan|Mazda|Isuzu|Ford|MG|BYD|Suzuki|BMW|Mercedes|Audi|Hyundai|Kia)/i
                    )
                ) {

                    car = lines[j];
                    break;

                }

            }

            booking.car = clean(
                car
                    .replace(/Transmission.*/i, "")
                    .replace(/Seats.*/i, "")
                    .replace(/or similar/i, "")
            );

        }

        // Thai PDF
        if (
            line.includes("ประเภทรถ") ||
            line.includes("รายละเอียดรถ")
        ) {

            for (let j = i; j < Math.min(i + 12, lines.length); j++) {

                if (
                    /(Xpander|HRV|HR-V|Yaris|Vios|City|Civic|Corolla|Fortuner|Atto|Seal|Hilux|D-Max|Accord|Camry|Alphard)/i.test(lines[j])
                ) {

                    booking.car = clean(lines[j])
                        .replace(/หรือรุ่น.*/i, "")
                        .replace(/\u0000/g, "");

                    break;

                }

            }

        }

    }

    // -----------------------
    // Pickup
    // -----------------------

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i];

        if (

            line.includes("Pick-up") ||
            line.includes("จุดรับรถ")

        ) {

            for (let j = i; j < Math.min(i + 20, lines.length); j++) {

                // Airport

                if (/Airport/i.test(lines[j])) {

                    booking.pickupLocation = clean(lines[j]);

                }

                // English Date

                let m = lines[j].match(

                    /([A-Za-z]{3}\s+\d{1,2},\s+\d{4}).*?(\d{1,2}:\d{2}\s*(AM|PM))/i

                );

                if (m) {

                    booking.pickupDate = clean(m[1]);
                    booking.pickupTime = clean(m[2]);

                }

                // Thai Date

                m = lines[j].match(

                    /(\d{1,2}\s+\S+\s+202\d).*?(\d{2}:\d{2})/

                );

                if (m) {

                    booking.pickupDate = clean(m[1]);
                    booking.pickupTime = clean(m[2]);

                }

            }

            break;

        }

    }
        // -----------------------
    // Helper: อ่านวันที่และเวลา
    // -----------------------

    function extractDateTime(value) {

        const line = clean(value);

        // อังกฤษ: 6:30 PM, Aug 5, 2026
        let match = line.match(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)),?\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i
        );

        if (match) {
            return {
                date: clean(match[2]),
                time: clean(match[1])
            };
        }

        // อังกฤษ: Aug 5, 2026 6:30 PM
        match = line.match(
            /([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM))/i
        );

        if (match) {
            return {
                date: clean(match[1]),
                time: clean(match[2])
            };
        }

        // ไทย: 1 ส.ค. 2026 08:30 น.
        match = line.match(
            /(\d{1,2}\s+[ก-๙A-Za-z.]+\s+\d{4}).*?(\d{1,2}:\d{2})/
        );

        if (match) {
            return {
                date: clean(match[1]),
                time: clean(match[2])
            };
        }

        return null;
    }

    // -----------------------
    // Return
    // -----------------------

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i];

        if (
            /Drop-off/i.test(line) ||
            line.includes("จุดคืนรถ") ||
            line.includes("จุดคืน")
        ) {

            for (
                let j = i + 1;
                j < Math.min(i + 20, lines.length);
                j++
            ) {

                if (
                    !booking.returnLocation &&
                    /Airport/i.test(lines[j])
                ) {
                    booking.returnLocation = clean(lines[j]);
                }

                const result = extractDateTime(lines[j]);

                if (result) {
                    booking.returnDate = result.date;
                    booking.returnTime = result.time;
                }

                if (
                    booking.returnLocation &&
                    booking.returnDate &&
                    booking.returnTime
                ) {
                    break;
                }
            }

            if (
                booking.returnLocation &&
                booking.returnDate &&
                booking.returnTime
            ) {
                break;
            }
        }
    }

    // -----------------------
    // Fallback:
    // ใช้ Airport + วันที่บรรทัดถัดไป
    // รองรับข้อความภาษาไทยที่หัวข้อเพี้ยน
    // -----------------------

    const rentalEvents = [];

    for (let i = 0; i < lines.length; i++) {

        if (!/Airport/i.test(lines[i])) {
            continue;
        }

        for (
            let j = i + 1;
            j < Math.min(i + 6, lines.length);
            j++
        ) {

            const result = extractDateTime(lines[j]);

            if (result) {

                rentalEvents.push({
                    location: clean(lines[i]),
                    date: result.date,
                    time: result.time
                });

                break;
            }
        }
    }

    // ลบข้อมูลซ้ำ
    const uniqueEvents = rentalEvents.filter(
        (item, index, array) =>
            index === array.findIndex(other =>
                other.location === item.location &&
                other.date === item.date &&
                other.time === item.time
            )
    );

    if (uniqueEvents.length >= 1) {

        if (!booking.pickupLocation) {
            booking.pickupLocation =
                uniqueEvents[0].location;
        }

        if (!booking.pickupDate) {
            booking.pickupDate =
                uniqueEvents[0].date;
        }

        if (!booking.pickupTime) {
            booking.pickupTime =
                uniqueEvents[0].time;
        }
    }

    if (uniqueEvents.length >= 2) {

        if (!booking.returnLocation) {
            booking.returnLocation =
                uniqueEvents[1].location;
        }

        if (!booking.returnDate) {
            booking.returnDate =
                uniqueEvents[1].date;
        }

        if (!booking.returnTime) {
            booking.returnTime =
                uniqueEvents[1].time;
        }
    }

    // -----------------------
    // รวมชื่อที่ถูกแยกเป็น 2 บรรทัด
    // เช่น NUTCHANAT + UDOMSEEROD
    // -----------------------

    if (
        booking.customerName &&
        !booking.customerName.includes(" ")
    ) {

        const nameIndex = lines.findIndex(
            line => line === booking.customerName
        );

        const nextLine = lines[nameIndex + 1] || "";

        if (/^[A-Z]{2,}$/.test(nextLine)) {

            booking.customerName =
                `${booking.customerName} ${nextLine}`;

            booking.renter =
                booking.customerName;
        }
    }

    // -----------------------
    // เปลี่ยนชื่อรถเป็นอังกฤษ
    // -----------------------

    const carSource =
        `${booking.car || ""} ${text}`;

    const modelMatch = carSource.match(
        /\b(Xpander|HR-?V|Yaris\s*Ativ|Yaris|Vios|City|Civic|Corolla|Fortuner|Pajero|Atto\s*3|Seal|Hilux|D-?Max|Accord|Camry|Alphard|Ertiga|Swift)\b/i
    );

    if (modelMatch) {

        const model = modelMatch[1]
            .toLowerCase()
            .replace(/\s+/g, " ");

        const carNames = {
            "xpander": "Mitsubishi Xpander",
            "hrv": "Honda HR-V",
            "hr-v": "Honda HR-V",
            "yaris ativ": "Toyota Yaris Ativ",
            "yaris": "Toyota Yaris",
            "vios": "Toyota Vios",
            "city": "Honda City",
            "civic": "Honda Civic",
            "corolla": "Toyota Corolla",
            "fortuner": "Toyota Fortuner",
            "pajero": "Mitsubishi Pajero",
            "atto 3": "BYD Atto 3",
            "seal": "BYD Seal",
            "hilux": "Toyota Hilux",
            "d-max": "Isuzu D-Max",
            "dmax": "Isuzu D-Max",
            "accord": "Honda Accord",
            "camry": "Toyota Camry",
            "alphard": "Toyota Alphard",
            "ertiga": "Suzuki Ertiga",
            "swift": "Suzuki Swift"
        };

        booking.car =
            carNames[model] ||
            clean(modelMatch[1]);
    }

    booking.company = "Trip";

    booking.customerName =
        clean(booking.customerName);

    booking.customerPhone =
        clean(booking.customerPhone);

    booking.pickupLocation =
        clean(booking.pickupLocation);

    booking.returnLocation =
        clean(booking.returnLocation);

    booking.pickupDate =
        clean(booking.pickupDate);

    booking.returnDate =
        clean(booking.returnDate);

    booking.pickupTime =
        clean(booking.pickupTime);

    booking.returnTime =
        clean(booking.returnTime);

    booking.car =
        clean(booking.car);

    return booking;
}

module.exports = parseTrip;