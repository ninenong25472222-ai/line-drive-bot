const axios = require("axios");

const rentalProUrl = String(process.env.RENTALPRO_SUPABASE_URL || "").replace(/\/$/, "");
const rentalProKey = String(process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "");

function clean(value = "") {
    return String(value ?? "").replace(/\u0000/g, "").trim();
}

function missing(value) {
    return !clean(value);
}

function missingFields(existing = {}, incoming = {}) {
    const fields = [
        "booking_no", "customer_name", "customer_phone", "customer_email",
        "pickup_date", "pickup_time", "pickup_location",
        "return_date", "return_time", "return_location", "car",
        "file_name", "drive_file_id", "drive_url"
    ];

    return fields.reduce((patch, field) => {
        if (missing(existing[field]) && !missing(incoming[field])) {
            patch[field] = incoming[field];
        }
        return patch;
    }, {});
}

async function savePartnerUpload({ booking, fileName, fileHash, driveFileId, driveUrl, source = "LINE", sourceLabel = "LINE / Partner" }) {
    const details = {
        source,
        source_label: sourceLabel,
        status: "รอตรวจสอบ",
        company: clean(booking.company || "Other"),
        booking_no: clean(booking.bookingNo),
        customer_name: clean(booking.customerName || booking.renter),
        customer_phone: clean(booking.customerPhone || booking.phone),
        customer_email: clean(booking.customerEmail),
        pickup_date: clean(booking.pickupDate),
        pickup_time: clean(booking.pickupTime),
        pickup_location: clean(booking.pickupLocation),
        return_date: clean(booking.returnDate),
        return_time: clean(booking.returnTime),
        return_location: clean(booking.returnLocation),
        car: clean(booking.car),
        file_name: clean(fileName),
        file_hash: clean(fileHash),
        drive_file_id: clean(driveFileId),
        drive_url: clean(driveUrl)
    };

    const bookingRow = {
        source: details.source,
        source_label: details.source_label,
        status: details.status,
        company: details.company,
        booking_no: details.booking_no,
        customer_name: details.customer_name,
        customer_phone: details.customer_phone,
        customer_email: details.customer_email,
        pickup_date: details.pickup_date,
        pickup_time: details.pickup_time,
        pickup_location: details.pickup_location,
        return_date: details.return_date,
        return_time: details.return_time,
        return_location: details.return_location,
        car: details.car,
        file_name: details.file_name,
        file_hash: details.file_hash,
        drive_file_id: details.drive_file_id,
        drive_url: details.drive_url,
        updated_at: new Date().toISOString()
    };

    // This Edge Function validates and writes with its own server-side role,
    // and is deliberately published without JWT verification.  Keeping its
    // public endpoint as a fallback lets the bot keep syncing when Render has
    // not been given the optional browser key variables yet.
    const functionUrl = clean(process.env.SUPABASE_FUNCTION_URL || "https://kxhflbhgdtebxxjgxwks.supabase.co/functions/v1/store-rental-booking");
    const publishableKey = clean(process.env.SUPABASE_ANON_KEY);
    if (functionUrl) {
        try {
            const headers = { "Content-Type": "application/json" };
            if (publishableKey) {
                headers.apikey = publishableKey;
                headers.Authorization = `Bearer ${publishableKey}`;
            }
            const response = await axios.post(functionUrl, bookingRow, {
                headers,
                timeout: 30000
            });
            return { skipped: false, supabase: true, data: response.data };
        } catch (error) {
            console.warn("SUPABASE_FUNCTION_WRITE_FAILED:", error.response?.status || error.code || "unknown_error", "falling back to legacy Supabase path");
        }
    }

    if (!rentalProUrl || !rentalProKey) {
        console.warn("RENTALPRO_SYNC_SKIPPED: missing legacy Supabase variables and new function write failed");
        return { skipped: true };
    }

    let bookingTableAvailable = true;
    if (details.file_hash) {
        try {
            const existing = await axios.get(`${rentalProUrl}/rest/v1/rental_bookings`, {
                params: { select: "*", file_hash: `eq.${details.file_hash}`, limit: 1 },
                headers: { apikey: rentalProKey, Authorization: `Bearer ${rentalProKey}` },
                timeout: 30000
            });
            if (Array.isArray(existing.data) && existing.data.length > 0) {
                const current = existing.data[0];
                const patch = missingFields(current, bookingRow);

                if (Object.keys(patch).length > 0) {
                    await axios.patch(`${rentalProUrl}/rest/v1/rental_bookings`, {
                        ...patch,
                        updated_at: new Date().toISOString()
                    }, {
                        params: { id: `eq.${current.id}` },
                        headers: { apikey: rentalProKey, Authorization: `Bearer ${rentalProKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                        timeout: 30000
                    });
                    return { skipped: false, duplicate: true, repairedFields: Object.keys(patch) };
                }

                return { skipped: true, duplicate: true };
            }
        } catch (error) {
            bookingTableAvailable = false;
            console.warn("RENTALPRO_BOOKINGS_TABLE_UNAVAILABLE: keeping legacy audit log path");
        }
    }

    if (bookingTableAvailable) {
        try {
            await axios.post(`${rentalProUrl}/rest/v1/rental_bookings`, bookingRow, {
                headers: { apikey: rentalProKey, Authorization: `Bearer ${rentalProKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                timeout: 30000
            });
        } catch (error) {
            console.warn("RENTALPRO_BOOKINGS_WRITE_FAILED: keeping legacy audit log path");
        }
    }

    await axios.post(`${rentalProUrl}/rest/v1/audit_logs`, {
        actor_id: null,
        action: "partner_upload_received",
        entity_type: "partner_upload",
        entity_id: null,
        details
    }, {
        headers: {
            apikey: rentalProKey,
            Authorization: `Bearer ${rentalProKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
        },
        timeout: 30000
    });

    return { skipped: false };
}

module.exports = { savePartnerUpload };
