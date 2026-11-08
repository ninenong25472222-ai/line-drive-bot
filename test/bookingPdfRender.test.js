const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const bookingMath = require("../web/assets/booking-calculations.js");

function loadRenderer() {
  let source = fs.readFileSync(path.join(__dirname, "..", "web", "booking-workspace.js"), "utf8");
  const drawnText = [];
  const initCall = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();\n}());";
  assert.ok(source.includes(initCall), "test hook must be inserted before app startup");
  source = source.replace(initCall, "  window.__bookingPdfTest = { bookingTemplateCanvas, canvasPdfBlob };\n}());");

  class MissingImage {
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onerror && this.onerror());
    }
  }
  const document = {
    readyState: "loading",
    addEventListener() {},
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = createCanvas(1, 1);
      const nativeGetContext = canvas.getContext.bind(canvas);
      const context = nativeGetContext("2d");
      const nativeFillText = context.fillText.bind(context);
      context.fillText = (value, ...args) => { drawnText.push(String(value)); return nativeFillText(value, ...args); };
      canvas.getContext = (type) => type === "2d" ? context : nativeGetContext(type);
      canvas.toBlob = (callback, type, quality) => callback(new Blob([canvas.toBuffer("image/jpeg", { quality })], { type }));
      return canvas;
    }
  };
  const window = { RentalBookingMath: bookingMath, __drawnText: drawnText };
  source = source.replace("window.__bookingPdfTest = { bookingTemplateCanvas, canvasPdfBlob };", "window.__bookingPdfTest = { bookingTemplateCanvas, canvasPdfBlob, drawnText: window.__drawnText, setCars: (value) => { cars = value; }, addVehicleDetails };");
  vm.runInNewContext(source, { window, document, Image: MissingImage, Blob, TextEncoder, Uint8Array, Buffer, setTimeout, console });
  return window.__bookingPdfTest;
}

const booking = {
  booking_no: "WEB-TEST-001", customer_name: "ลูกค้าทดสอบ ข้อความชื่อยาวสำหรับตรวจกรอบ",
  customer_phone: "0800000000", car: "Toyota VIOS · รถทดสอบ · ABC 123",
  pickup_date: "2026-11-06", pickup_time: "13:40", pickup_location: "สนามบินสุราษฎร์ธานี",
  return_date: "2026-11-08", return_time: "18:40", return_location: "สนามบินสุราษฎร์ธานี",
  daily_rate: 900, delivery_fee: 0, service_total: 2700, booking_deposit: 500,
  security_deposit: 2000, wants_tax_invoice: true, withhold_tax_5: true,
  booking_note: "ทดสอบข้อความยาวและการตัดบรรทัดให้อยู่ภายในกรอบ"
};

test("Thai and English booking PDFs render as a single A4 page", async () => {
  const renderer = loadRenderer();
  renderer.setCars([{ id: "car-1", model: "Toyota VIOS 2025", image_url: "" }]);
  assert.equal(renderer.addVehicleDetails({ car_id: "car-1", car: "Toyota VIOS · ป้ายแดง · ABC 123" }).car_model, "Toyota VIOS 2025");
  for (const language of ["th", "en"]) {
    const canvas = await renderer.bookingTemplateCanvas(booking, language);
    assert.deepEqual([canvas.width, canvas.height], [1240, 1754]);
    const pdf = await renderer.canvasPdfBlob(canvas);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    const content = bytes.toString("latin1");
    assert.equal(pdf.type, "application/pdf");
    assert.ok(content.startsWith("%PDF-1.4"));
    assert.match(content, /\/Count 1/);
    assert.match(content, /\/MediaBox \[0 0 595 842\]/);
    assert.ok(content.endsWith("%%EOF"));
    assert.ok(bytes.length > 30_000, "PDF includes the rendered document image");
    assert.ok(renderer.drawnText.includes(language === "th" ? "คิดเป็นจำนวน: 3 วัน" : "Charged days: 3 days"));
    assert.ok(renderer.drawnText.includes("Toyota VIOS"));
    assert.equal(renderer.drawnText.some((text) => text.includes("รถทดสอบ") || text.includes("ABC 123")), false);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    assert.equal(parsed.numPages, 1);
    const page = await parsed.getPage(1);
    assert.deepEqual(page.view, [0, 0, 595, 842]);
  }
});

test("legacy bookings without a recorded daily rate print one consistent service subtotal", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "booking-workspace.js"), "utf8");
  assert.match(source, /var payments = dailyRate > 0[\s\S]*?\[\[isThai \? 'รวมค่าบริการ' : 'Service subtotal', serviceTotal\]\]/);
});
