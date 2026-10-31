const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function dashboardDateParser() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  const start = source.indexOf("var pad =");
  const end = source.indexOf("function ptime");
  return vm.runInNewContext(`${source.slice(start, end)}; pdate;`);
}

function dashboardFileParser() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  const start = source.indexOf("var pad =");
  const end = source.indexOf("async function readBookingDetails");
  return vm.runInNewContext(`${source.slice(start, end)}; readDetailsFromText;`);
}

test("Dashboard recognizes Thai dates from Trip booking files", () => {
  const pdate = dashboardDateParser();
  assert.equal(pdate("23 ต.ค. 2026"), "2026-10-23");
  assert.equal(pdate("6 ส . ค . 2026"), "2026-08-06");
  assert.equal(pdate("23/10/2569"), "2026-10-23");
});

test("Dashboard file reader preserves identical ChicCar pickup and return times", () => {
  const parse = dashboardFileParser();
  assert.deepEqual(
    JSON.parse(JSON.stringify(parse("ChicCar", "Pick Up/รับรถ Return/คืนรถ วันที่ 12 / 10 / 2026 วันที่ 13 / 10 / 2026 เวลา 16 : 00 เวลา 16 : 00"))),
    { pickup_date: "2026-10-12", pickup_time: "16:00", return_date: "2026-10-13", return_time: "16:00" },
  );
});

test("Dashboard file reader handles Klook dates and times with split spaces", () => {
  const parse = dashboardFileParser();
  assert.deepEqual(
    JSON.parse(JSON.stringify(parse("Klook", "ข้อมูลการรับ / ส่ง เวลานัดรับ 2026-10-07 13 : 00 ข้อมูลการส่งกลับ 2026-10-10 13 : 00"))),
    { pickup_date: "2026-10-07", pickup_time: "13:00", return_date: "2026-10-10", return_time: "13:00" },
  );
});

test("Dashboard offers a single re-read action only for incomplete booking files", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /id="reparseAll"/);
  assert.match(source, /id="reparseModal"/);
  assert.match(source, /id="reparseList"/);
  assert.match(source, /กำลังอ่านไฟล์/);
  assert.doesNotMatch(source, /id="reparseToken"/);
  assert.match(source, /!row\._oth && row\._bad && row\.id && safeUrl\(row\.drive_url\)/);
  assert.doesNotMatch(source, /data-reparse=/);
});

test("Dashboard keeps duplicate Drive-file copies out of the normal work list", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /id="hideDup" type="checkbox" checked/);
  assert.match(source, /ซ่อนสำเนาไฟล์ซ้ำ/);
  assert.match(source, /สำเนาไฟล์ซ้ำ/);
  assert.match(source, /function base\(includeHiddenDuplicates\)/);
  assert.match(source, /\$\('hideDup'\)\.onchange/);
  assert.match(source, /id="lifecycle"[^>]*><option value="active">ใช้งานอยู่<\/option>/);
});

test("Dashboard improves Thai readability, mobile calendar density, quick filters, and action hierarchy", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /--mut:#536579/);
  assert.match(source, /\.tag,\.badge\{font-size:13px/);
  assert.match(source, /\.stats span\{font-size:14px/);
  assert.match(source, /\.cd small\{font-size:12px/);
  assert.match(source, /\.cd \.calDots\{display:flex/);
  assert.match(source, /\.btn\.primary\{background:var\(--brand\)/);
  assert.match(source, /id="rf"[^>]*aria-label="รีเฟรชข้อมูล"/);
  assert.match(source, /<details class="filterMore">/);
  assert.match(source, /class="wide dangerActions"/);
  assert.doesNotMatch(source, /🚗|📍/);
  assert.match(source, /data-quick-filter="incomplete"/);
  assert.match(source, /data-quick-filter="duplicates"/);
  assert.match(source, /\.mainColumns\{display:grid;grid-template-columns:minmax\(0,1fr\) 360px/);
});

test("Dashboard provides invoice PDF export with an editable short LINE OA filename", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /id="billingBtn"[^>]*>ออกบิล \/ ภาษี/);
  assert.match(source, /id="billFileName"/);
  assert.match(source, /ชื่อไฟล์ย่อสำหรับ LINE OA/);
  assert.match(source, /function billDownloadPdf/);
  assert.match(source, /data-bill=/);
  assert.match(source, /id="billSettingsPanel"/);
  assert.match(source, /id="billLogoInput"[^>]*type="file"/);
  assert.match(source, /id="billSignatureInput"[^>]*type="file"/);
  assert.match(source, /id="billSignature"/);
  assert.match(source, /class="billDel"[^>]*>ลบรายการ<\/button>/);
});

test("Dashboard exposes a reversible booking trash action", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /data-trash=/);
  assert.match(source, /data-restore=/);
  assert.match(source, /data-delete=/);
  assert.match(source, /id="editTrash"/);
  assert.match(source, /ย้ายเข้าถังขยะ/);
  assert.match(source, /runLifecycleAction/);
});

test("Dashboard clearly opens the real Google Drive attachment through its own file route", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  assert.match(source, /data-booking-file=/);
  assert.match(source, /ดูไฟล์จริง \(Google Drive\)/);
  assert.match(source, /ดาวน์โหลดไฟล์จริง/);
  assert.match(source, /\/file/);
});

test("Dashboard loads the car workspace and AppSheet-style booking form", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  const workspace = fs.readFileSync(path.join(__dirname, "..", "web", "booking-workspace.js"), "utf8");
  assert.match(source, /id="bookingBtn"[^>]*>ออกใบจอง/);
  assert.match(source, /id="carsBtn"[^>]*>ข้อมูลรถ/);
  assert.match(source, /id="settingsBtn"[^>]*>ตั้งค่าข้อมูล/);
  assert.match(source, /booking-workspace\.js/);
  assert.match(workspace, /ข้อมูลลูกค้า/);
  assert.match(workspace, /สรุปยอดเงิน/);
  assert.match(workspace, /ข้อมูลการเดินทาง/);
  assert.match(workspace, /pickup_time/);
  assert.match(workspace, /return_time/);
  assert.match(workspace, /bookingConflict/);
  assert.match(workspace, /id="bookingChannel"/);
  assert.match(workspace, /id="bookingPickupLocation"/);
  assert.match(workspace, /id="bookingReturnLocation"/);
  assert.match(workspace, /id="settingsModal"/);
  assert.match(workspace, /ตั้งค่าข้อมูล/);
  assert.match(workspace, /สนามบินสุราษฎร์ธานี/);
  assert.match(workspace, /ระยะเวลาเช่า/);
  assert.match(workspace, /คิดค่าเช่า/);
  assert.match(workspace, /booking-options/);
  assert.match(workspace, /carImageFile/);
  assert.match(workspace, /image_data/);
});

test("Dashboard previews complete booking confirmations in English or Thai without a third-party script", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "dashboard.source.html"), "utf8");
  const workspace = fs.readFileSync(path.join(__dirname, "..", "web", "booking-workspace.js"), "utf8");
  assert.doesNotMatch(source, /rental-document-engine/);
  assert.match(source, /data-booking-pdf=/);
  assert.match(source, /ดูร่างจากข้อมูลระบบ EN/);
  assert.match(workspace, /RENTAL BOOKING CONFIRMATION/);
  assert.match(workspace, /ภาษาใบจอง/);
  assert.match(workspace, /function previewBookingPdf/);
  assert.match(workspace, /function canvasPdfBlob/);
  assert.match(workspace, /missingDocumentFields/);
  assert.match(workspace, /bookingPreviewModal/);
  assert.match(workspace, /function documentBookingData/);
  assert.match(workspace, /function bookingTemplateCanvas/);
  assert.match(workspace, /รายละเอียดการชำระเงิน/);
  assert.match(workspace, /คำขอพิเศษ/);
  assert.match(workspace, /jiraporn-car-rent-logo\.png/);
  assert.match(workspace, /นโยบายการขับขี่และพื้นที่การใช้รถ/);
  assert.match(workspace, /50,000 บาท/);
  assert.match(workspace, /data-booking-pdf/);
});
