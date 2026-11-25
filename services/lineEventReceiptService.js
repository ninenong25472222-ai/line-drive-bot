const axios = require("axios");

function config(env = process.env) {
    return {
        url: String(env.RENTALPRO_SUPABASE_URL || "").replace(/\/$/, ""),
        key: String(env.RENTALPRO_SUPABASE_SERVICE_ROLE_KEY || "")
    };
}

function headers(key) {
    const result = { apikey: key, "Content-Type": "application/json" };
    if (!key.startsWith("sb_secret_")) result.Authorization = `Bearer ${key}`;
    return result;
}

async function claimLineEvent({ eventId, messageId = "", fileName = "", env = process.env, request = axios }) {
    if (!eventId) return { tracked: false, claimed: true, reason: "event_id_missing" };
    const { url, key } = config(env);
    if (!url || !key) return { tracked: false, claimed: true, reason: "database_not_configured" };
    const response = await request.post(`${url}/rest/v1/rpc/claim_line_event`, {
        p_event_id: String(eventId).slice(0, 200),
        p_message_id: String(messageId).slice(0, 200),
        p_file_name: String(fileName).slice(0, 255)
    }, { headers: headers(key), timeout: 15000 });
    return { tracked: true, claimed: response.data === true };
}

async function finishLineEvent({ eventId, state, error = "", env = process.env, request = axios }) {
    if (!eventId) return { tracked: false };
    const { url, key } = config(env);
    if (!url || !key) return { tracked: false };
    const response = await request.patch(`${url}/rest/v1/line_event_receipts`, {
        state: state === "processed" ? "processed" : "failed",
        last_error: state === "processed" ? null : String(error || "processing_failed").slice(0, 300),
        updated_at: new Date().toISOString(),
        processed_at: state === "processed" ? new Date().toISOString() : null
    }, {
        params: { event_id: `eq.${String(eventId).slice(0, 200)}` },
        headers: { ...headers(key), Prefer: "return=minimal" },
        timeout: 15000
    });
    return { tracked: response.status >= 200 && response.status < 300 };
}

module.exports = { claimLineEvent, finishLineEvent };
