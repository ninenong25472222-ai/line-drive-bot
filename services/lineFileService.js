const axios = require("axios");

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(["ECONNABORTED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ERR_NETWORK"]);

function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(error) {
    return Number(error?.response?.status || error?.status || 0);
}

function isRetryable(error) {
    const status = statusOf(error);
    if (RETRYABLE_STATUS.has(status)) return true;
    if (status >= 400) return false;
    return !status || TRANSIENT_CODES.has(String(error?.code || "").toUpperCase());
}

async function downloadLineFile({
    messageId,
    accessToken,
    maxBytes,
    fileName = "",
    request = axios,
    wait = pause,
    onRetry = () => {},
    attempts = 3,
}) {
    if (!messageId) throw new Error("LINE_FILE_MESSAGE_ID_MISSING");
    if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN_MISSING");

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await request({
                method: "get",
                url: `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
                responseType: "arraybuffer",
                timeout: 120000,
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes,
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            const buffer = Buffer.isBuffer(response.data)
                ? response.data
                : Buffer.from(response.data || []);
            if (!buffer.length) throw Object.assign(new Error("DOWNLOADED_FILE_EMPTY"), { retryable: true });
            if (Number.isFinite(maxBytes) && buffer.length > maxBytes) throw Object.assign(new Error("LINE_FILE_TOO_LARGE"), { retryable: false });
            if (/\.pdf$/i.test(fileName) && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
                throw Object.assign(new Error("LINE_FILE_CONTENT_NOT_PDF"), { retryable: false });
            }
            return { buffer, contentType: response.headers?.["content-type"] || "application/octet-stream", attempts: attempt };
        } catch (error) {
            if (/maxContentLength|maxBodyLength|content length.*exceed/i.test(String(error?.message || ""))) {
                lastError = Object.assign(new Error("LINE_FILE_TOO_LARGE"), { retryable: false });
                break;
            }
            lastError = error;
            const retryable = error.retryable === true || error.retryable !== false && isRetryable(error);
            if (!retryable || attempt >= attempts) break;
            const delayMs = Math.min(1000 * (2 ** (attempt - 1)), 5000);
            onRetry({ attempt, status: statusOf(error), code: error.code || "" });
            await wait(delayMs);
        }
    }

    if (lastError?.message === "LINE_FILE_TOO_LARGE" || lastError?.message === "LINE_FILE_CONTENT_NOT_PDF") throw lastError;
    const status = statusOf(lastError);
    if (status === 401 || status === 403) throw new Error("LINE_FILE_DOWNLOAD_UNAUTHORIZED");
    if (status === 404) throw new Error("LINE_FILE_NO_LONGER_AVAILABLE");
    if (status === 429) throw new Error("LINE_FILE_DOWNLOAD_RATE_LIMITED");
    if (status >= 500) throw new Error("LINE_FILE_DOWNLOAD_TEMPORARILY_UNAVAILABLE");
    if (lastError?.code === "ECONNABORTED" || lastError?.code === "ETIMEDOUT") throw new Error("LINE_FILE_DOWNLOAD_TIMEOUT");
    throw new Error(lastError?.message || "LINE_FILE_DOWNLOAD_FAILED");
}

module.exports = { downloadLineFile, isRetryable };
