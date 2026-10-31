function isoDaysAgo(days, now = new Date()) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

function shouldQueueForDeletion(booking, cutoffDate) {
    // Duplicate rows can point at the same physical Drive file as the canonical
    // booking. They are handled by the reversible duplicate archive below.
    if (booking?.duplicate_of) return false;
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

async function fetchBookings(url, key, query) {
    const response = await fetch(`${url}/rest/v1/rental_bookings?${query}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!response.ok) throw new Error(`BOOKING_LIFECYCLE_QUERY_FAILED_${response.status}`);
    return response.json();
}

async function archiveDuplicateBookings({ url, key, now }) {
    const summary = { scanned: 0, archived: 0, skipped: 0, failed: 0 };
    const candidates = await fetchBookings(url, key,
        "select=id,duplicate_of,drive_file_id,deletion_status&duplicate_of=not.is.null&deletion_status=eq.active&limit=1000");
    summary.scanned = candidates.length;
    if (!candidates.length) return summary;

    const parentIds = Array.from(new Set(candidates.map((item) => item.duplicate_of).filter(Boolean)));
    const parents = await fetchBookings(url, key,
        `select=id,drive_file_id,deletion_status&id=in.(${parentIds.map(encodeURIComponent).join(",")})&limit=1000`);
    const parentById = new Map(parents.map((item) => [String(item.id), item]));

    for (const duplicate of candidates) {
        const parent = parentById.get(String(duplicate.duplicate_of));
        // Only archive when this is provably the same physical file and its
        // canonical booking still owns an active reference to that file.
        if (!parent || !duplicate.drive_file_id || duplicate.drive_file_id !== parent.drive_file_id || !["active", "restored"].includes(parent.deletion_status)) {
            summary.skipped += 1;
            continue;
        }
        try {
            await updateBooking(url, key, duplicate.id, {
                deletion_status: "pending_confirmation",
                pending_deletion_at: now.toISOString(),
                trashed_at: now.toISOString(),
                trash_reason: "สำเนารายการอัตโนมัติ — อ้างอิงไฟล์ Google Drive เดียวกับรายการหลัก"
            });
            summary.archived += 1;
        } catch (error) {
            summary.failed += 1;
            console.error("DUPLICATE_BOOKING_ARCHIVE_ERROR:", duplicate.id, error?.message || error);
        }
    }
    return summary;
}

async function queueExpiredBookings({ drive, supabaseUrl, serviceRoleKey, pendingFolderId, now = new Date() }) {
    if (!supabaseUrl || !serviceRoleKey) {
        return { skipped: true, reason: "missing database configuration" };
    }

    const url = String(supabaseUrl).replace(/\/$/, "");
    const duplicateArchive = await archiveDuplicateBookings({ url, key: serviceRoleKey, now });
    if (!pendingFolderId) return { skipped: true, reason: "missing review-folder configuration", duplicateArchive };
    const bookings = await fetchBookings(url, serviceRoleKey,
        "select=id,return_on,status,drive_file_id,deletion_status,original_drive_parent_ids,duplicate_of&limit=1000");

    const cutoffDate = isoDaysAgo(2, now);
    const summary = { scanned: 0, queued: 0, restored: 0, deleted: 0, skipped: 0, failed: 0, cutoffDate, duplicateArchive };

    for (const booking of bookings || []) {
        summary.scanned += 1;
        // Never trash or permanently delete the shared Drive file from a
        // duplicate row. Restore it if an older manual action had moved it.
        if (booking.duplicate_of && booking.deletion_status === "pending_move") {
            try {
                const originalParents = JSON.parse(booking.original_drive_parent_ids || "[]");
                if (booking.drive_file_id && Array.isArray(originalParents) && originalParents.length) {
                    const file = await drive.files.get({ fileId: booking.drive_file_id, fields: "id,parents" });
                    await drive.files.update({ fileId: booking.drive_file_id, addParents: originalParents.join(","), removeParents: (file.data.parents || []).join(","), fields: "id,parents" });
                }
                await updateBooking(url, serviceRoleKey, booking.id, {
                    deletion_status: "pending_confirmation",
                    trashed_at: now.toISOString(),
                    pending_deletion_at: now.toISOString(),
                    trash_reason: "สำเนารายการอัตโนมัติ — อ้างอิงไฟล์ Google Drive เดียวกับรายการหลัก"
                });
                summary.duplicateArchive.archived += 1;
            } catch (error) {
                summary.duplicateArchive.failed += 1;
                console.error("DUPLICATE_BOOKING_RESTORE_SHARED_FILE_ERROR:", booking.id, error?.message || error);
            }
            continue;
        }
        if (booking.deletion_status === "pending_permanent_delete") {
            if (booking.duplicate_of) {
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "deleted", deleted_at: now.toISOString() });
                summary.deleted += 1;
                continue;
            }
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
            if (booking.duplicate_of) {
                await updateBooking(url, serviceRoleKey, booking.id, { deletion_status: "restored", restored_at: now.toISOString(), pending_deletion_at: null });
                summary.restored += 1;
                continue;
            }
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

module.exports = { isoDaysAgo, shouldQueueForDeletion, archiveDuplicateBookings, queueExpiredBookings };
