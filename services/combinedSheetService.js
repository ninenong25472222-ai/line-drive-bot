const { google } = require("googleapis");

const readTable = async (sheets, spreadsheetId, title) => {
    if (!spreadsheetId) return { headers: [], rows: [] };
    const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!A:Z`,
        valueRenderOption: "FORMATTED_VALUE"
    });
    const values = result.data.values || [];
    return { headers: values[0] || [], rows: values.slice(1) };
};

const ensureSheet = async (sheets, spreadsheetId, title) => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    if ((meta.data.sheets || []).some((sheet) => sheet.properties?.title === title)) return;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] }
    });
};

async function writeSnapshot(sheets, spreadsheetId, title, headers, rows) {
    await ensureSheet(sheets, spreadsheetId, title);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A:Z` });
    if (!headers.length) return;
    const values = [headers, ...rows];
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values }
    });
}

async function syncCombinedSpreadsheet({ auth, combinedSpreadsheetId, lineSpreadsheetId, appSheetSpreadsheetId }) {
    if (!auth || !combinedSpreadsheetId) return { skipped: true, reason: "missing_configuration" };
    const sheets = google.sheets({ version: "v4", auth });
    const [lineBooking, lineOther, appBookings] = await Promise.all([
        readTable(sheets, lineSpreadsheetId, process.env.LINE_BOOKING_SHEET || "Booking"),
        readTable(sheets, lineSpreadsheetId, process.env.LINE_OTHER_SHEET || "Other"),
        readTable(sheets, appSheetSpreadsheetId, process.env.APPSHEET_BOOKING_SHEET || "Bookings")
    ]);

    const snapshots = [
        ["LINE_Booking", "LINE", "Booking", lineBooking],
        ["LINE_Other", "LINE", "Other", lineOther],
        ["AppSheet_Bookings", "AppSheet", "Bookings", appBookings]
    ];
    const combinedHeaders = ["Source", "SourceSheet", ...Array.from(new Set(snapshots.flatMap(([, , , table]) => table.headers)))];
    const combinedRows = [];
    for (const [, source, sourceSheet, table] of snapshots) {
        const indexes = table.headers.map((header) => combinedHeaders.indexOf(header));
        for (const row of table.rows) {
            const output = Array(combinedHeaders.length).fill("");
            output[0] = source;
            output[1] = sourceSheet;
            row.forEach((value, index) => { if (indexes[index] >= 0) output[indexes[index]] = value ?? ""; });
            combinedRows.push(output);
        }
    }
    await Promise.all([
        writeSnapshot(sheets, combinedSpreadsheetId, "Combined", combinedHeaders, combinedRows),
        writeSnapshot(sheets, combinedSpreadsheetId, "LINE_Booking", lineBooking.headers, lineBooking.rows),
        writeSnapshot(sheets, combinedSpreadsheetId, "LINE_Other", lineOther.headers, lineOther.rows),
        writeSnapshot(sheets, combinedSpreadsheetId, "AppSheet_Bookings", appBookings.headers, appBookings.rows)
    ]);
    return { lineBooking: lineBooking.rows.length, lineOther: lineOther.rows.length, appSheet: appBookings.rows.length, combined: combinedRows.length };
}

module.exports = { syncCombinedSpreadsheet };
