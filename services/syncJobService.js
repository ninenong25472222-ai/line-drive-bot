const axios = require("axios");

function config(env = process.env) {
    return { url: String(env.RENTALPRO_SUPABASE_URL || "").replace(/\/$/, ""), key: String(env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "") };
}
function headers(key, extra = {}) {
    return { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json", ...extra };
}

async function enqueueSyncJob({ target, idempotencyKey, payload, eventId = "", env = process.env, request = axios }) {
    const { url, key } = config(env);
    if (!url || !key) return false;
    const result = await request.post(`${url}/rest/v1/rental_sync_jobs?on_conflict=idempotency_key`, {
        event_id: eventId || null, target, idempotency_key: idempotencyKey, payload, state: "queued", attempts: 0, last_error: null, next_attempt_at: new Date().toISOString(), completed_at: null
    }, { headers: headers(key, { Prefer: "resolution=merge-duplicates,return=minimal" }), timeout: 15000 });
    return result.status >= 200 && result.status < 300;
}

async function updateSyncState({ fileHash, target, state, error = "", env = process.env, request = axios }) {
    const { url, key } = config(env);
    if (!url || !key || !fileHash) return false;
    const query = new URLSearchParams({ select: "id,sync_status", file_hash: `eq.${fileHash}`, limit: "1" }).toString();
    const found = await request.get(`${url}/rest/v1/rental_bookings?${query}`, { headers: headers(key), timeout: 15000 });
    const row = Array.isArray(found.data) ? found.data[0] : null;
    if (!row?.id) return false;
    const syncStatus = { ...(row.sync_status || {}), [target]: { state, updated_at: new Date().toISOString(), error: error ? String(error).slice(0, 240) : null } };
    await request.patch(`${url}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(row.id)}`, { sync_status: syncStatus }, { headers: headers(key, { Prefer: "return=minimal" }), timeout: 15000 });
    return true;
}

async function updateDriveSharingAudit({ fileHash, driveFileId, permissionId, env = process.env, request = axios }) {
    const { url, key } = config(env);
    if (!url || !key || !fileHash) return false;
    const query = new URLSearchParams({ select: "id", file_hash: `eq.${fileHash}`, limit: "1" }).toString();
    const found = await request.get(`${url}/rest/v1/rental_bookings?${query}`, { headers: headers(key), timeout: 15000 });
    const row = Array.isArray(found.data) ? found.data[0] : null;
    if (!row?.id) return false;
    const result = await request.post(`${url}/rest/v1/audit_logs`, { actor_id: null, action: "drive_link_sharing_applied", entity_type: "rental_booking", entity_id: row.id, details: { policy: "anyone_with_link_viewer", drive_file_id: driveFileId, permission_id: permissionId || null, verified_at: new Date().toISOString() } }, { headers: headers(key, { Prefer: "return=minimal" }), timeout: 15000 });
    return result.status >= 200 && result.status < 300;
}

async function nextSyncJobs({ limit = 10, env = process.env, request = axios }) {
    const { url, key } = config(env);
    if (!url || !key) return [];
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const query = new URLSearchParams({ select: "id,event_id,target,idempotency_key,payload,attempts", or: `(and(state.in.(queued,failed),attempts.lt.8,next_attempt_at.lte.${now}),and(state.eq.processing,attempts.lt.8,updated_at.lt.${stale}))`, order: "created_at.asc", limit: String(limit) }).toString();
    const response = await request.get(`${url}/rest/v1/rental_sync_jobs?${query}`, { headers: headers(key), timeout: 15000 });
    return Array.isArray(response.data) ? response.data : [];
}

async function setSyncJob(job, state, error = "", env = process.env, request = axios) {
    const { url, key } = config(env);
    if (!url || !key || !job?.id) return false;
    const attempts = Number(job.attempts || 0);
    const minutes = Math.min(360, 2 ** Math.min(attempts, 8));
    const patch = { state, attempts, last_error: error ? String(error).slice(0, 300) : null, updated_at: new Date().toISOString(), ...(state === "succeeded" ? { completed_at: new Date().toISOString() } : {}), ...(state === "queued" || state === "failed" ? { next_attempt_at: new Date(Date.now() + minutes * 60000).toISOString() } : {}) };
    await request.patch(`${url}/rest/v1/rental_sync_jobs?id=eq.${encodeURIComponent(job.id)}`, patch, { headers: headers(key, { Prefer: "return=minimal" }), timeout: 15000 });
    return true;
}

async function claimSyncJob(job, { env = process.env, request = axios } = {}) {
    const { url, key } = config(env);
    if (!url || !key || !job?.id) return null;
    const attempts = Number(job.attempts || 0) + 1;
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const claim = new URLSearchParams({ id: `eq.${job.id}`, or: `(state.in.(queued,failed),and(state.eq.processing,updated_at.lt.${stale}))` }).toString();
    const response = await request.patch(`${url}/rest/v1/rental_sync_jobs?${claim}`, { state: "processing", attempts, updated_at: new Date().toISOString() }, { headers: headers(key, { Prefer: "return=representation" }), timeout: 15000 });
    return Array.isArray(response.data) ? response.data[0] || null : null;
}

async function requestSyncRetry(id, { env = process.env, request = axios } = {}) {
    const { url, key } = config(env);
    if (!url || !key) throw new Error("SYNC_QUEUE_NOT_CONFIGURED");
    const response = await request.patch(`${url}/rest/v1/rental_sync_jobs?id=eq.${encodeURIComponent(id)}&state=in.(failed,queued)`, { state: "queued", attempts: 0, last_error: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null }, { headers: headers(key, { Prefer: "return=representation" }), timeout: 15000 });
    return Array.isArray(response.data) && response.data.length > 0;
}

module.exports = { enqueueSyncJob, updateSyncState, updateDriveSharingAudit, nextSyncJobs, setSyncJob, claimSyncJob, requestSyncRetry };
