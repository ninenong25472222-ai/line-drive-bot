function isoDaysAgo(days, now = new Date()) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

function shouldQueueForDeletion(booking, cutoffDate) {
    if (["pending_confirmation", "pending_permanent_delete", "restore_requested", "deleted", "restored", "move_failed"].includes(String(booking?.deletion_status || ""))) return false;
    if (["ผิดพลาด", "ยกเลิก"].includes(String(booking?.status || ""))) return true;
    return Boolean(booking?.return_on && booking.return_on <= cutoffDate);
}

async function updateBooking(url, key, id, patch) {
    const response = await fetch(
        `${url}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal"
            },
            body: JSON.stringify(patch)
        }
    );

    if (!response.ok) throw new Error(`BOOKING_LIFECYCLE_UPDATE_FAILED_${response.status}`);
}

async function queueExpiredBookings({ drive, supabaseUrl, serviceRoleKey, pendingFolderId, now = new Date() }) {
    if (!supabaseUrl || !serviceRoleKey || !pendingFolderId) {
        return { skipped: true, reason: "missing lifecycle configuration" };
    }

    const url = String(supabaseUrl).replace(/\/$/, "");
    const response = await fetch(
        `${url}/rest/v1/rental_bookings?select=id,return_on,status,drive_file_id,deletion_status,original_drive_parent_ids&limit=1000`,
        {
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
        }
    );
    if (!response.ok) throw new Error(`BOOKING_LIFECYCLE_QUERY_FAILED_${response.status}`);
    const bookings = await response.json();

    const cutoffDate = isoDaysAgo(2, now);
    const summary = { scanned: 0, queued: 0, restored: 0, deleted: 0, skipped: 0, failed: 0, cutoffDate };

    for (const booking of bookings || []) {
        summary.scanned += 1;
        if (booking.deletion_status === "pending_permanent_delete") {
            if (!booking.drive_file_id) {
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "deleted", deleted_at: now.toISOString() });
                summary.deleted += 1;
                continue;
            }
            try {
                await drive.files.delete({ fileId: booking.drive_file_id });
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "deleted", deleted_at: now.toISOString() });
                summary.deleted += 1;
            } catch (error) {
                summary.failed += 1;
                console.error("PENDING_DELETION_DELETE_ERROR:", booking.id, error?.message || error);
            }
            continue;
        }

        if (booking.deletion_status === "restore_requested") {
            if (!booking.drive_file_id) {
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "restored", restored_at: now.toISOString(), pending_deletion_at: null });
                summary.restored += 1;
                continue;
            }
            try {
                const originalParents = JSON.parse(booking.original_drive_parent_ids || "[]");
                if (!Array.isArray(originalParents) || !originalParents.length) throw new Error("ORIGINAL_PARENT_MISSING");
                const file = await drive.files.get({ fileId: booking.drive_file_id, fields: "id,parents" });
                await drive.files.update({ fileId: booking.drive_file_id, addParents: originalParents.join(","), removeParents: (file.data.parents || []).join(","), fields: "id,parents" });
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "restored", restored_at: now.toISOString(), pending_deletion_at: null });
                summary.restored += 1;
            } catch (error) {
                summary.failed += 1;
                console.error("PENDING_DELETION_RESTORE_ERROR:", booking.id, error?.message || error);
            }
            continue;
        }

        if (!shouldQueueForDeletion(booking, cutoffDate)) {
            summary.skipped += 1;
            continue;
        }

        // Some manual bookings have no uploaded PDF. They still enter the
        // review bin as a record, while no Drive operation is attempted.
        if (!booking.drive_file_id) {
            await updateBooking(url, serviceRoleKey, booking.id, {
                deletion_status: "pending_confirmation",
                pending_deletion_at: now.toISOString(),
                trashed_at: now.toISOString()
            });
            summary.queued += 1;
            continue;
        }

        try {
            const file = await drive.files.get({
                fileId: booking.drive_file_id,
                fields: "id,parents,trashed"
            });
            if (file.data.trashed) {
                await updateBooking(url, serviceRoleKey, booking.id, {
                    deletion_status: "pending_confirmation",
                    pending_deletion_at: now.toISOString(),
                    trashed_at: now.toISOString()
                });
                summary.queued += 1;
                continue;
            }

            const parents = Array.isArray(file.data.parents) ? file.data.parents : [];
            await drive.files.update({
                fileId: booking.drive_file_id,
                addParents: pendingFolderId,
                removeParents: parents.join(","),
                fields: "id,parents"
            });
            await updateBooking(url, serviceRoleKey, booking.id, {
                deletion_status: "pending_confirmation",
                pending_deletion_at: now.toISOString(),
                trashed_at: now.toISOString(),
                original_drive_parent_ids: JSON.stringify(parents)
            });
            summary.queued += 1;
        } catch (error) {
            summary.failed += 1;
            console.error("PENDING_DELETION_QUEUE_ERROR:", booking.id, error?.message || error);
        }
    }

    return summary;
}

module.exports = { isoDaysAgo, shouldQueueForDeletion, queueExpiredBookings };
