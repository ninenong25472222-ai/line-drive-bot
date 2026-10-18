const axios = require("axios");

const rentalProUrl = String(process.env.RENTALPRO_SUPABASE_URL || "").replace(/\/$/, "");
const rentalProKey = String(process.env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "");

function clean(value = "") {
    return String(value ?? "").replace(/\u0000/g, "").trim();
}

async function savePartnerUpload({ booking, fileName, fileHash, driveFileId, driveUrl, source = "LINE", sourceLabel = "LINE / Partner" }) {
    if (!rentalProUrl || !rentalProKey) {
        console.warn("RENTALPRO_SYNC_SKIPPED: missing RENTALPRO_SUPABASE_URL or RENTALPRO_SUPABASE_SERVICE_ROLE_KEY");
        return { skipped: true };
    }

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

    let bookingTableAvailable = true;
    if (details.file_hash) {
        try {
            const existing = await axios.get(`${rentalProUrl}/rest/v1/rental_bookings`, {
                params: { select: "id", file_hash: `eq.${details.file_hash}`, limit: 1 },
                headers: { apikey: rentalProKey, Authorization: `Bearer ${rentalProKey}` },
                timeout: 30000
            });
            if (Array.isArray(existing.data) && existing.data.length > 0) return { skipped: true, duplicate: true };
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
