const test = require("node:test");
const assert = require("node:assert/strict");
const { readBookingDocument, normalizeDate, normalizeTime, normalizeSchedule } = require("../services/bookingDocumentService");

test("normalizes Thai Buddhist and English dates, validates calendar days and time", () => {
  assert.equal(normalizeDate("23 ต.ค. 2569"), "2026-10-23");
  assert.equal(normalizeDate("23/10/2026"), "2026-10-23");
  assert.equal(normalizeDate("Oct 23, 2026"), "2026-10-23");
  assert.equal(normalizeDate("23 October 2026"), "2026-10-23");
  assert.equal(normalizeDate("31/02/2026"), "");
  assert.equal(normalizeTime("7:05 PM"), "19:05");
  assert.equal(normalizeTime("13.05"), "13:05");
  assert.equal(normalizeTime("24:10"), "");
  assert.equal(normalizeTime("10:05:60"), "");
});

test("rejects a full schedule whose return precedes pickup", () => {
  const schedule = normalizeSchedule({ pickupDate: "2026-11-21", pickupTime: "19:30", returnDate: "2026-11-21", returnTime: "15:00" });
  assert.equal(schedule.complete, false);
  assert.equal(schedule.chronological, false);
  assert.equal(schedule.booking.pickupDate, "");
  assert.equal(schedule.booking.returnTime, "");
});

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

test("booking PDF reader prefers a coherent OCR schedule over an inverted text-layer schedule", async () => {
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => options.forceOCR ? "ocr text" : "Pick Up Return Trip",
    parse: (text) => text === "ocr text"
      ? { company: "Trip", pickupDate: "23 ต.ค. 2569", pickupTime: "08:00", returnDate: "24 ต.ค. 2569", returnTime: "08:00" }
      : { company: "Trip", pickupDate: "2026-10-24", pickupTime: "08:00", returnDate: "2026-10-23", returnTime: "08:00" },
  });
  assert.equal(result.booking.pickupDate, "2026-10-23");
  assert.equal(result.booking.returnDate, "2026-10-24");
  assert.equal(result.usedOcrFallback, true);
  assert.equal(result.scheduleIssue, "");
});

test("booking PDF reader safely combines complementary text and OCR fields when neither overwrites the other", async () => {
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => options.forceOCR ? "ocr text" : "Pick Up Return Trip",
    parse: (text) => text === "ocr text"
      ? { company: "Trip", pickupDate: "2026-10-23", pickupTime: "", returnDate: "", returnTime: "08:00" }
      : { company: "Trip", pickupDate: "2026-10-23", pickupTime: "07:30", returnDate: "2026-10-24", returnTime: "" },
  });
  assert.equal(result.booking.pickupTime, "07:30");
  assert.equal(result.booking.returnDate, "2026-10-24");
  assert.equal(result.booking.returnTime, "08:00");
  assert.equal(result.usedOcrFallback, true);
});

test("booking PDF reader marks an unresolved inverted schedule for manual review", async () => {
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => options.forceOCR ? "ocr text" : "Pick Up Return Trip",
    parse: () => ({ company: "Trip", pickupDate: "2026-10-24", pickupTime: "08:00", returnDate: "2026-10-23", returnTime: "08:00" }),
  });
  assert.equal(result.scheduleIssue, "pickup_after_return");
  assert.equal(result.booking.pickupDate, "");
  assert.equal(result.booking.returnDate, "");
});

test("booking PDF reader avoids OCR when text layer has a complete schedule and customer name", async () => {
  let calls = 0;
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async () => { calls += 1; return "text"; },
    parse: () => ({ company: "Klook", customerName: "Guest Name", pickupDate: "2026-11-19", pickupTime: "19:30", returnDate: "2026-11-21", returnTime: "15:00" }),
  });
  assert.equal(calls, 1);
  assert.equal(result.usedOcrFallback, false);
});

test("booking PDF reader uses OCR to recover a Thai customer name when text-layer dates are already complete", async () => {
  const calls = [];
  const result = await readBookingDocument(Buffer.from("pdf"), {
    readPdf: async (_buffer, options = {}) => {
      calls.push(options.forceOCR === true);
      return options.forceOCR ? "ชื่อผู้ขับขี่ ณัช ภู่วรวรรณ เบอร์โทรติดต่อ 0950328080" : "Pick Up Return Trip";
    },
    parse: (text) => text.includes("ชื่อผู้ขับขี่")
      ? { company: "ChicCar", customerName: "ณัช ภู่วรวรรณ", pickupDate: "2026-11-22", pickupTime: "20:00", returnDate: "2026-11-25", returnTime: "20:00" }
      : { company: "ChicCar", customerName: "", pickupDate: "2026-11-22", pickupTime: "20:00", returnDate: "2026-11-25", returnTime: "20:00" },
  });
  assert.deepEqual(calls, [false, true]);
  assert.equal(result.booking.customerName, "ณัช ภู่วรวรรณ");
  assert.equal(result.usedOcrFallback, true);
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
  assert.equal(result.booking.returnDate, "");
});
