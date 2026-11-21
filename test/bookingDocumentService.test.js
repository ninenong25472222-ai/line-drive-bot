const test = require("node:test");
const assert = require("node:assert/strict");
const { readBookingDocument } = require("../services/bookingDocumentService");

test("booking PDF reader retries OCR when a recognized booking is missing date/time fields", async () => {
  const calls = [];
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => { calls.push(options.forceOCR === true); return options.forceOCR ? "ocr text" : "Pick Up Return Trip"; },
    parse: (text) => text === "ocr text"
      ? { company: "Trip", pickupDate: "2026-11-19", pickupTime: "19:30", returnDate: "2026-11-21", returnTime: "15:00" }
      : { company: "Trip", pickupDate: "2026-11-19", pickupTime: "19:30", returnDate: "", returnTime: "" },
  });
  assert.deepEqual(calls, [false, true]);
  assert.equal(result.usedOcrFallback, true);
  assert.equal(result.booking.pickupTime, "19:30");
  assert.equal(result.booking.returnDate, "2026-11-21");
  assert.equal(result.booking.returnTime, "15:00");
});

test("booking PDF reader avoids OCR when text layer already has complete schedule", async () => {
  let calls = 0;
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async () => { calls += 1; return "text"; },
    parse: () => ({ company: "Klook", pickupDate: "2026-11-19", pickupTime: "19:30", returnDate: "2026-11-21", returnTime: "15:00" }),
  });
  assert.equal(calls, 1);
  assert.equal(result.usedOcrFallback, false);
});

test("booking PDF reader keeps usable extracted data if OCR service fails", async () => {
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => {
      if (options.forceOCR) throw new Error("offline");
      return "Pick Up Return Trip";
    },
    parse: () => ({ company: "Trip", pickupDate: "2026-11-19", pickupTime: "19:30" }),
  });
  assert.equal(result.ocrFailed, true);
  assert.equal(result.booking.pickupDate, "2026-11-19");
  assert.equal(result.booking.returnDate, undefined);
});
