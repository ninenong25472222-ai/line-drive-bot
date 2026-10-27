const test = require("node:test");
const assert = require("node:assert/strict");
const { queueExpiredBookings } = require("../services/bookingLifecycleService");

test("lifecycle moves an expired Drive file to review before requesting confirmation", async () => {
    const originalFetch = global.fetch;
    const updates = [], driveUpdates = [];
    global.fetch = async (url, init = {}) => {
        if (init.method === "PATCH") {
            updates.push(JSON.parse(init.body));
            return { ok: true };
        }
        return {
            ok: true,
            json: async () => [{ id: "booking-1", return_on: "2026-10-20", status: "ยืนยันแล้ว", drive_file_id: "drive-1", deletion_status: "active" }]
        };
    };
    const drive = {
        files: {
            get: async () => ({ data: { id: "drive-1", parents: ["original-folder"], trashed: false } }),
            update: async (input) => { driveUpdates.push(input); }
        }
    };
    try {
        const result = await queueExpiredBookings({ drive, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", pendingFolderId: "review-folder", now: new Date("2026-10-27T00:00:00Z") });
        assert.equal(result.queued, 1);
        assert.equal(driveUpdates.length, 1);
        assert.equal(driveUpdates[0].addParents, "review-folder");
        assert.equal(updates[0].deletion_status, "pending_confirmation");
        assert.equal(updates[0].original_drive_parent_ids, '["original-folder"]');
    } finally {
        global.fetch = originalFetch;
    }
});

test("lifecycle never permanently deletes before the administrator confirms", async () => {
    const originalFetch = global.fetch;
    let deletes = 0;
    global.fetch = async () => ({ ok: true, json: async () => [{ id: "booking-2", return_on: "2026-10-01", status: "ยืนยันแล้ว", drive_file_id: "drive-2", deletion_status: "pending_confirmation" }] });
    const drive = { files: { get: async () => { throw new Error("must not inspect confirmed review files"); }, delete: async () => { deletes += 1; } } };
    try {
        const result = await queueExpiredBookings({ drive, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", pendingFolderId: "review-folder", now: new Date("2026-10-27T00:00:00Z") });
        assert.equal(result.queued, 0);
        assert.equal(deletes, 0);
    } finally {
        global.fetch = originalFetch;
    }
});
