const test = require("node:test");
const assert = require("node:assert/strict");
const { queueExpiredBookings, shouldQueueForDeletion } = require("../services/bookingLifecycleService");

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

test("automatically archives a duplicate row without moving or deleting its shared Drive file", async () => {
    const originalFetch = global.fetch;
    const updates = [], driveUpdates = [], driveDeletes = [];
    const duplicate = { id: "duplicate-1", duplicate_of: "primary-1", drive_file_id: "shared-drive-file", deletion_status: "active" };
    const primary = { id: "primary-1", drive_file_id: "shared-drive-file", deletion_status: "active" };
    global.fetch = async (url, init = {}) => {
        if (init.method === "PATCH") {
            updates.push(JSON.parse(init.body));
            return { ok: true };
        }
        if (String(url).includes("duplicate_of=not.is.null")) return { ok: true, json: async () => [duplicate] };
        if (String(url).includes("id=in.")) return { ok: true, json: async () => [primary] };
        return { ok: true, json: async () => [] };
    };
    const drive = { files: {
        get: async () => ({ data: { id: "shared-drive-file", parents: ["primary-folder"], trashed: false } }),
        update: async (input) => { driveUpdates.push(input); },
        delete: async (input) => { driveDeletes.push(input); }
    } };
    try {
        const result = await queueExpiredBookings({ drive, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", pendingFolderId: "review-folder", now: new Date("2026-10-31T00:00:00Z") });
        assert.equal(result.duplicateArchive.archived, 1);
        assert.equal(updates[0].deletion_status, "pending_confirmation");
        assert.match(updates[0].trash_reason, /ไฟล์ Google Drive เดียวกับรายการหลัก/);
        assert.equal(Object.hasOwn(updates[0], "status"), false);
        assert.equal(driveUpdates.length, 0);
        assert.equal(driveDeletes.length, 0);
        assert.equal(shouldQueueForDeletion({ duplicate_of: "primary-1", return_on: "2026-01-01", status: "ยืนยันแล้ว" }, "2026-10-31"), false);
    } finally {
        global.fetch = originalFetch;
    }
});

test("permanent confirmation on a duplicate never deletes the canonical booking file", async () => {
    const originalFetch = global.fetch;
    const updates = [];
    let deletes = 0;
    global.fetch = async (url, init = {}) => {
        if (init.method === "PATCH") {
            updates.push(JSON.parse(init.body));
            return { ok: true };
        }
        if (String(url).includes("duplicate_of=not.is.null")) return { ok: true, json: async () => [] };
        return { ok: true, json: async () => [{ id: "duplicate-1", duplicate_of: "primary-1", return_on: "2026-10-20", status: "ยืนยันแล้ว", drive_file_id: "shared-drive-file", deletion_status: "pending_permanent_delete" }] };
    };
    const drive = { files: { delete: async () => { deletes += 1; } } };
    try {
        const result = await queueExpiredBookings({ drive, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", pendingFolderId: "review-folder", now: new Date("2026-10-31T00:00:00Z") });
        assert.equal(result.deleted, 1);
        assert.equal(updates[0].deletion_status, "deleted");
        assert.equal(deletes, 0);
    } finally {
        global.fetch = originalFetch;
    }
});
