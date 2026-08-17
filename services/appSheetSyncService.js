const crypto = require("crypto");
const { google } = require("googleapis");
const { savePartnerUpload } = require("./rentalProService");

const normalize = (value = "") => String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "")
    .trim();

const readTable = async (sheets, spreadsheetId, title) => {
    const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!A:Z`,
        valueRenderOption: "FORMATTED_VALUE"
    });
    const rows = result.data.values || [];
    return { headers: rows[0] || [], rows: rows.slice(1) };
};

const findColumn = (headers, candidates) => {
    const normalizedHeaders = headers.map(normalize);
    const wanted = candidates.map(normalize);
    return normalizedHeaders.findIndex((header) => wanted.some((candidate) => header === candidate || header.includes(candidate)));
};

const cell = (row, headers, candidates) => {
    const index = findColumn(headers, candidates);
    return index >= 0 ? String(row[index] ?? "").trim() : "";
};

const createCarLookup = (table) => {
    const lookup = new Map();
    const referenceIndex = findColumn(table.headers, ["carref", "carid", "vehicleid", "ทะเบียน", "รหัสรถ"]);
    const makeIndex = findColumn(table.headers, ["make", "brand", "ยี่ห้อ"]);
    const modelIndex = findColumn(table.headers, ["model", "vehiclemodel", "รุ่น"]);
    const nameIndex = findColumn(table.headers, ["car", "vehicle", "ชื่อรถ", "รุ่นรถ"]);
    if (referenceIndex < 0) return lookup;
    for (const row of table.rows) {
        const reference = String(row[referenceIndex] ?? "").trim();
        if (!reference) continue;
        const make = makeIndex >= 0 ? String(row[makeIndex] ?? "").trim() : "";
        const model = modelIndex >= 0 ? String(row[modelIndex] ?? "").trim() : "";
        const name = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "";
        lookup.set(normalize(reference), [make, model].filter(Boolean).join(" ") || name || reference);
    }
    return lookup;
};

const buildBooking = (row, headers, carLookup) => {
    const bookingNo = cell(row, headers, ["bookingid", "bookingno", "เลขที่จอง", "เลขจอง"]);
    const customerName = cell(row, headers, ["customername", "rentername", "ชื่อลูกค้า", "ผู้เช่า"]);
    const carReference = cell(row, headers, ["carref", "carid", "vehicleid", "ทะเบียน", "รหัสรถ", "รถ"]);
    const pickupDate = cell(row, headers, ["pickupdate", "รับรถวันที่", "วันที่รับรถ"]);
    const returnDate = cell(row, headers, ["returndate", "คืนรถวันที่", "วันที่คืนรถ"]);
    if (!bookingNo || !customerName || !pickupDate || !returnDate) return null;
    return {
        company: "AppSheet",
        bookingNo,
        customerName,
        customerPhone: cell(row, headers, ["tel", "phone", "เบอร์โทร", "โทรศัพท์"]),
        customerEmail: cell(row, headers, ["email", "อีเมล"]),
        pickupDate,
        pickupTime: cell(row, headers, ["pickuptime", "เวลารับรถ", "เวลารับ"]),
        pickupLocation: cell(row, headers, ["pickuplocation", "จุดรับรถ", "สถานที่รับ"]),
        returnDate,
        returnTime: cell(row, headers, ["returntime", "เวลาคืนรถ", "เวลาคืน"]),
        returnLocation: cell(row, headers, ["returnlocation", "จุดคืนรถ", "สถานที่คืน"]),
        car: carLookup.get(normalize(carReference)) || carReference,
        total: cell(row, headers, ["total", "price", "amount", "ยอดรวม", "ราคา"]),
        deposit: cell(row, headers, ["deposit", "มัดจำ"]),
        source: cell(row, headers, ["bookingsource", "source", "ช่องทาง"]) || "AppSheet"
    };
};

async function syncAppSheetBookings({ auth, spreadsheetId, bookingSheetTitle = "Bookings", carSheetTitle = "Car_Master" }) {
    if (!auth || !spreadsheetId) return { skipped: true, reason: "missing_configuration" };
    const sheets = google.sheets({ version: "v4", auth });
    const [bookingTable, carTable] = await Promise.all([
        readTable(sheets, spreadsheetId, bookingSheetTitle),
        readTable(sheets, spreadsheetId, carSheetTitle).catch(() => ({ headers: [], rows: [] }))
    ]);
    const carLookup = createCarLookup(carTable);
    const results = { scanned: bookingTable.rows.length, imported: 0, duplicates: 0, skipped: 0 };
    for (const row of bookingTable.rows) {
        const booking = buildBooking(row, bookingTable.headers, carLookup);
        if (!booking) {
            results.skipped += 1;
            continue;
        }
        const fileHash = crypto.createHash("sha256")
            .update(`appsheet:${spreadsheetId}:${booking.bookingNo}`)
            .digest("hex");
        const saved = await savePartnerUpload({
            booking,
            fileName: `AppSheet-${booking.bookingNo}.row`,
            fileHash,
            source: "AppSheet",
            sourceLabel: "AppSheet / CarRental_System"
        });
        if (saved?.duplicate) results.duplicates += 1;
        else if (saved?.skipped) results.skipped += 1;
        else results.imported += 1;
    }
    return results;
}

module.exports = { syncAppSheetBookings };
