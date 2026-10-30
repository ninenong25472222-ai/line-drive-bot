(function () {
  'use strict';
  var cars = [], editingCarId = '', bookingOptions = { channels: [], locations: [] };
  var enumDefaults = {
    channels: ['LINE OA', 'LINE', 'Facebook', 'โทรศัพท์', 'Walk-in', 'Partner / Agent', 'Direct / Dashboard'],
    locations: ['สนามบินสุราษฎร์ธานี', 'ตัวเมืองสุราษฎร์ธานี', 'ท่าเรือดอนสัก', 'สนามบินนครศรีธรรมราช', 'โรงแรมในสุราษฎร์ธานี']
  };
  function by(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]; }); }
  function money(value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function token() { try { return sessionStorage.getItem('rd_edit_token') || ''; } catch (e) { return ''; } }
  function localNow() { var d = new Date(Date.now() + 7 * 3600000); return d.toISOString().slice(0, 16); }
  function shortFileName(value) { return String(value || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'booking'; }
  function formatMoney(value) { return money(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dateTime(value, time, language) {
    if (!value) return '-';
    var date = new Date(value + 'T12:00:00+07:00');
    var locale = language === 'th' ? 'th-TH' : 'en-GB';
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) + (time ? ' · ' + time : '');
  }
  function durationText(data, language) {
    var start = new Date(String(data.pickup_date || '') + 'T' + String(data.pickup_time || '00:00') + ':00+07:00').getTime();
    var end = new Date(String(data.return_date || '') + 'T' + String(data.return_time || '00:00') + ':00+07:00').getTime();
    var minutes = Math.max(0, Math.round((end - start) / 60000)), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
    return language === 'th' ? days + ' วัน ' + hours + ' ชั่วโมง ' + mins + ' นาที' : days + ' day(s) ' + hours + ' hour(s) ' + mins + ' minute(s)';
  }
  function pdfLoader() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (window.rentalPdfLoader) return window.rentalPdfLoader;
    window.rentalPdfLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = '/vendor/html2pdf.bundle.min.js';
      script.onload = function () { window.html2pdf ? resolve(window.html2pdf) : reject(new Error('เครื่องมือ PDF ในเว็บไซต์ไม่พร้อมใช้งาน')); };
      script.onerror = function () { reject(new Error('โหลดเครื่องมือ PDF จากเว็บไซต์ไม่สำเร็จ')); };
      document.head.appendChild(script);
    });
    return window.rentalPdfLoader;
  }
  function bookingDocument(data, language) {
    var isThai = language === 'th', labels = isThai ? {
      title: 'ใบยืนยันการจองรถเช่า', no: 'เลขที่ใบจอง', customer: 'ข้อมูลผู้เช่า', name: 'ชื่อผู้เช่า', phone: 'โทรศัพท์', email: 'อีเมล', car: 'รถที่จอง', channel: 'ช่องทางการจอง', pickup: 'ส่งมอบรถ', returning: 'รับคืนรถ', location: 'สถานที่', duration: 'ระยะเวลาเช่า', charges: 'สรุปค่าใช้จ่าย', rate: 'ราคาต่อวัน', rental: 'ค่าเช่า', delivery: 'ค่ารับ-ส่ง', paid: 'ยอดโอนจอง', deposit: 'เงินมัดจำ', total: 'ยอดรวมค่าเช่า', note: 'หมายเหตุ', footer: 'กรุณาแสดงเอกสารฉบับนี้เมื่อรับรถ', signature: 'ลายเซ็นผู้เช่า', baht: 'บาท'
    } : {
      title: 'RENTAL BOOKING CONFIRMATION', no: 'Booking No.', customer: 'Renter Details', name: 'Renter Name', phone: 'Phone', email: 'Email', car: 'Reserved Vehicle', channel: 'Booking Channel', pickup: 'Vehicle Delivery', returning: 'Vehicle Return', location: 'Location', duration: 'Rental Duration', charges: 'Rental Charges', rate: 'Daily Rate', rental: 'Rental Charge', delivery: 'Delivery / Collection Fee', paid: 'Booking Deposit Paid', deposit: 'Security Deposit', total: 'Total Rental Charge', note: 'Notes', footer: 'Please present this document when collecting the vehicle.', signature: 'Renter Signature', baht: 'THB'
    };
    var chargedDays = Math.max(1, Math.ceil(Math.max(0, new Date(String(data.return_date || '') + 'T' + String(data.return_time || '00:00') + ':00+07:00').getTime() - new Date(String(data.pickup_date || '') + 'T' + String(data.pickup_time || '00:00') + ':00+07:00').getTime()) / 86400000));
    var dailyRate = money(data.daily_rate), deliveryFee = money(data.delivery_fee), total = money(data.service_total) || dailyRate * chargedDays + deliveryFee;
    var paper = document.createElement('article');
    paper.className = 'bookingPdfPaper';
    paper.innerHTML = '<header><div><div class="brand">RENTAL DESK</div><div class="subbrand">Car rental booking</div></div><div class="documentTitle"><h1>' + esc(labels.title) + '</h1><p>' + esc(labels.no) + ': <b>' + esc(data.booking_no || '-') + '</b></p></div></header>' +
      '<section class="bookingPdfGrid"><div><h2>' + esc(labels.customer) + '</h2><dl><dt>' + esc(labels.name) + '</dt><dd>' + esc(data.customer_name || '-') + '</dd><dt>' + esc(labels.phone) + '</dt><dd>' + esc(data.customer_phone || '-') + '</dd><dt>' + esc(labels.email) + '</dt><dd>' + esc(data.customer_email || '-') + '</dd></dl></div><div><h2>' + esc(labels.car) + '</h2><dl><dt>' + esc(labels.car) + '</dt><dd>' + esc(data.car || '-') + '</dd><dt>' + esc(labels.channel) + '</dt><dd>' + esc(data.booking_channel || '-') + '</dd><dt>' + esc(labels.duration) + '</dt><dd>' + esc(durationText(data, language)) + '</dd></dl></div></section>' +
      '<section class="bookingPdfTrip"><div><span>' + esc(labels.pickup) + '</span><b>' + esc(dateTime(data.pickup_date, data.pickup_time, language)) + '</b><small>' + esc(labels.location) + ': ' + esc(data.pickup_location || '-') + '</small></div><div><span>' + esc(labels.returning) + '</span><b>' + esc(dateTime(data.return_date, data.return_time, language)) + '</b><small>' + esc(labels.location) + ': ' + esc(data.return_location || '-') + '</small></div></section>' +
      '<section class="bookingPdfCharges"><h2>' + esc(labels.charges) + '</h2><div class="chargeRows"><div><span>' + esc(labels.rate) + ' × ' + chargedDays + ' day(s)</span><b>' + formatMoney(dailyRate) + ' ' + esc(labels.baht) + '</b></div><div><span>' + esc(labels.delivery) + '</span><b>' + formatMoney(deliveryFee) + ' ' + esc(labels.baht) + '</b></div><div><span>' + esc(labels.paid) + '</span><b>' + formatMoney(data.booking_deposit) + ' ' + esc(labels.baht) + '</b></div><div><span>' + esc(labels.deposit) + '</span><b>' + formatMoney(data.security_deposit) + ' ' + esc(labels.baht) + '</b></div><div class="grand"><span>' + esc(labels.total) + '</span><b>' + formatMoney(total) + ' ' + esc(labels.baht) + '</b></div></div></section>' +
      '<section class="bookingPdfNote"><h2>' + esc(labels.note) + '</h2><p>' + esc(data.booking_note || '-') + '</p></section><footer><p>' + esc(labels.footer) + '</p><div class="signLine"></div><b>' + esc(labels.signature) + '</b></footer>';
    return paper;
  }
  async function downloadBookingPdf(data, language) {
    var paper = bookingDocument(data, language);
    document.body.appendChild(paper);
    try {
      var makePdf = await pdfLoader();
      await makePdf().set({ margin: 0, filename: shortFileName('BOOKING-' + (data.booking_no || 'rental') + '-' + (language === 'th' ? 'TH' : 'EN')) + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(paper).save();
    } finally { paper.remove(); }
  }
  function renderShell() {
    var style = document.createElement('style');
    style.textContent = '.bookModal{max-width:880px}.bookGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bookGrid .wide{grid-column:1/-1}.bookSection{grid-column:1/-1;margin:8px 0 0;padding:9px 0 4px;border-bottom:1px solid var(--line);font-weight:700;color:var(--ink)}.bookEnumHint{display:block;margin-top:3px;font-size:11px;color:var(--mut)}.bookSummary{grid-column:1/-1;border-radius:12px;background:#e8f3fb;padding:11px 13px;color:#0f5f93}.bookSummary b{display:block;font-size:17px;color:var(--ink)}.bookBreakdown{display:block;margin-top:3px;font-size:12px;color:#35586e}.settingsModal{max-width:760px}.settingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.settingsCard{border:1px solid var(--line);border-radius:12px;padding:13px;background:#fbfdff}.settingsCard h3{margin:0 0 4px;font-size:16px}.settingsAdd{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.settingsList{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.settingsTag{border-radius:99px;padding:4px 8px;background:#e8f3fb;color:#0f5f93;font-size:12px}.settingsCode{display:grid;gap:4px;color:var(--mut);font-size:13px;margin-top:14px}.carModal{max-width:900px}.carLayout{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.2fr);gap:12px}.carList{max-height:440px;overflow:auto;display:grid;gap:7px}.carRow{border:1px solid var(--line);background:#fff;border-radius:11px;padding:10px;text-align:left}.carRow.on{border-color:var(--p);box-shadow:0 0 0 2px #d9eefb}.carRow b,.carRow span{display:block}.carRow span{font-size:12px;color:var(--mut)}.carForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.carForm .wide{grid-column:1/-1}.carPhoto{min-height:100px;border:1px dashed var(--line);border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fbfdff;color:var(--mut);font-size:12px}.carPhoto img{display:block;width:100%;max-height:210px;object-fit:cover}.carStatus{font-size:12px;color:var(--mut)}.bookingPdfPaper{position:fixed;left:-10000px;top:0;width:794px;min-height:1123px;box-sizing:border-box;padding:55px 58px;background:#fff;color:#142b40;font-family:Arial,"Noto Sans Thai",sans-serif}.bookingPdfPaper header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #1479b7;padding-bottom:18px}.bookingPdfPaper .brand{font-size:28px;font-weight:800;letter-spacing:1px;color:#0870ad}.bookingPdfPaper .subbrand{margin-top:4px;color:#537084;font-size:13px}.bookingPdfPaper .documentTitle{text-align:right}.bookingPdfPaper h1{margin:0;font-size:21px;color:#0b405f}.bookingPdfPaper .documentTitle p{margin:8px 0 0;font-size:13px}.bookingPdfPaper h2{font-size:13px;letter-spacing:.3px;text-transform:uppercase;margin:0 0 10px;color:#126d9f}.bookingPdfGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}.bookingPdfGrid>div,.bookingPdfCharges,.bookingPdfNote{border:1px solid #c6ddea;border-radius:8px;padding:14px}.bookingPdfPaper dl{display:grid;grid-template-columns:110px 1fr;gap:7px;margin:0;font-size:12px}.bookingPdfPaper dt{color:#5b7384}.bookingPdfPaper dd{margin:0;font-weight:600;overflow-wrap:anywhere}.bookingPdfTrip{display:grid;grid-template-columns:1fr 1fr;background:#e9f5fb;border-radius:8px;overflow:hidden}.bookingPdfTrip>div{padding:15px}.bookingPdfTrip>div+div{border-left:1px solid #bad8e8}.bookingPdfTrip span,.bookingPdfTrip small{display:block;font-size:12px;color:#547286}.bookingPdfTrip b{display:block;margin:7px 0;font-size:15px}.bookingPdfCharges{margin-top:20px}.chargeRows>div{display:flex;justify-content:space-between;gap:15px;padding:7px 0;border-bottom:1px solid #e4edf2;font-size:13px}.chargeRows .grand{border-bottom:0;color:#063e5c;font-size:16px;font-weight:800}.bookingPdfNote{margin-top:20px;min-height:56px}.bookingPdfNote p{margin:0;white-space:pre-wrap;font-size:12px;line-height:1.55}.bookingPdfPaper footer{margin-top:70px;font-size:12px;text-align:center;color:#547286}.bookingPdfPaper .signLine{width:220px;border-top:1px solid #6f8695;margin:42px auto 7px}@media(max-width:640px){.bookGrid,.carForm,.settingsGrid{grid-template-columns:1fr}.carLayout{grid-template-columns:1fr}.bookGrid .wide,.carForm .wide{grid-column:auto}.settingsAdd{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', [
      '<div class="modalBg" id="bookingModal" hidden><form class="modal bookModal" id="bookingForm">',
      '<div class="modalHead"><h2>ออกใบจอง</h2><button class="btn" id="bookingClose" type="button">ปิด</button></div>',
      '<p class="muted">รูปแบบข้อมูลเดียวกับ AppSheet — ระบบตรวจรถและช่วงวัน/เวลาซ้อนก่อนบันทึก</p><div class="bookGrid">',
      '<div class="bookSection">ข้อมูลลูกค้า 👤</div>',
      '<label>ช่องทางการจอง<select class="ctl" name="booking_channel" id="bookingChannel" required></select><span class="bookEnumHint">จัดการรายการได้จากเมนู “ตั้งค่าข้อมูล”</span></label>',
      '<label>ชื่อลูกค้า<input class="ctl" name="customer_name" required></label>',
      '<label>เบอร์โทร<input class="ctl" name="customer_phone" inputmode="tel" required></label>',
      '<label>อีเมล (ถ้ามี)<input class="ctl" name="customer_email" type="email"></label>',
      '<div class="bookSection">สรุปยอดเงิน 💰</div>',
      '<label>ราคาต่อวัน (บาท)<input class="ctl" name="daily_rate" type="number" min="0" step="0.01" value="0" required></label>',
      '<label>ยอดโอนจอง<input class="ctl" name="booking_deposit" type="number" min="0" step="0.01" value="0" required></label>',
      '<label>เงินมัดจำ (บาท)<input class="ctl" name="security_deposit" type="number" min="0" step="0.01" value="0" required></label>',
      '<label>ค่ารับ-ส่ง<input class="ctl" name="delivery_fee" type="number" min="0" step="0.01" value="0" required></label>',
      '<label class="wide">หมายเหตุ<textarea class="ctl" name="booking_note" rows="2"></textarea></label>',
      '<label class="wide"><input name="wants_tax_invoice" type="checkbox"> ต้องการใบกำกับภาษี</label>',
      '<label>ภาษาใบจอง<select class="ctl" name="document_language"><option value="en">English</option><option value="th">ภาษาไทย</option></select><span class="bookEnumHint">บันทึกแล้วจะดาวน์โหลด PDF ทันที</span></label>',
      '<div class="bookSection">ข้อมูลการเดินทาง 🚗</div>',
      '<label class="wide">รถคันจริง<select class="ctl" name="car_id" id="bookingCar" required><option value="">กำลังโหลดข้อมูลรถ…</option></select></label>',
      '<label>วันส่งรถ<input class="ctl" name="pickup_date" type="date" required></label>',
      '<label>เวลาส่งรถ<input class="ctl" name="pickup_time" type="time" required></label>',
      '<label>วันคืนรถ<input class="ctl" name="return_date" type="date" required></label>',
      '<label>เวลาคืนรถ<input class="ctl" name="return_time" type="time" required></label>',
      '<label>สถานที่ส่ง<select class="ctl" name="pickup_location" id="bookingPickupLocation" required></select><span class="bookEnumHint">จัดการรายการได้จากเมนู “ตั้งค่าข้อมูล”</span></label>',
      '<label>สถานที่คืน<select class="ctl" name="return_location" id="bookingReturnLocation" required></select><span class="bookEnumHint">จัดการรายการได้จากเมนู “ตั้งค่าข้อมูล”</span></label>',
      '<div class="bookSummary"><span id="bookingDuration">ระยะเวลาเช่า: เลือกวันและเวลาเพื่อคำนวณ</span><b id="bookingTotal">ยอดค่าเช่า 0.00 บาท</b><span id="bookingCharge" class="bookBreakdown"></span><span id="bookingConflict" class="carStatus"></span></div>',
      '<label class="wide">รหัสผู้ดูแล<input class="ctl" name="edit_token" type="password" autocomplete="current-password" required></label>',
      '</div><div class="muted" id="bookingErr" role="alert"></div><div class="modalFoot"><button class="btn" id="bookingCancel" type="button">ยกเลิก</button><button class="btn save" id="bookingSave" type="submit">บันทึกใบจอง</button></div></form></div>',
      '<div class="modalBg" id="carsModal" hidden><form class="modal carModal" id="carsForm">',
      '<div class="modalHead"><h2>ข้อมูลรถ</h2><button class="btn" id="carsClose" type="button">ปิด</button></div><p class="muted">เพิ่มและแก้ไขรถตามรูปแบบ Car Master ใน AppSheet</p><div class="carLayout"><div class="carList" id="carsList"></div><div class="carForm">',
      '<label>รหัสเรียกรถ<input class="ctl" name="car_ref" required placeholder="เช่น ป้ายแดงไลออน"></label><label>รุ่นรถ<input class="ctl" name="model" required placeholder="เช่น Yaris Ativ 2025"></label>',
      '<label>ทะเบียน<input class="ctl" name="license_plate"></label><label>สี<input class="ctl" name="color"></label>',
      '<label>ปีรถ<input class="ctl" name="model_year" type="number" min="1900" max="2200"></label><label>สถานะ<select class="ctl" name="status"><option>ว่าง</option><option>จองแล้ว</option><option>กำลังใช้งาน</option><option>ซ่อม</option><option>งดใช้งาน</option></select></label>',
      '<label>ราคาต่อวัน (บาท)<input class="ctl" name="default_daily_rate" type="number" min="0" step="0.01" value="0"></label><label>มัดจำเริ่มต้น (บาท)<input class="ctl" name="default_security_deposit" type="number" min="0" step="0.01" value="0"></label>',
      '<label class="wide">อัปโหลดรูปภาพรถ<input class="ctl" name="image_file" id="carImageFile" type="file" accept="image/jpeg,image/png,image/webp"><span class="bookEnumHint">รองรับ JPG, PNG, WebP ขนาดไม่เกิน 5 MB</span></label><div class="carPhoto wide" id="carImagePreview">ยังไม่มีรูปภาพรถ</div><label class="wide">หรือลิงก์รูปภาพรถ<input class="ctl" name="image_url" type="url" placeholder="https://..."></label><label class="wide">หมายเหตุ<textarea class="ctl" name="note" rows="2"></textarea></label>',
      '<label class="wide"><input name="active" type="checkbox" checked> เปิดให้เลือกออกใบจอง</label><label class="wide">รหัสผู้ดูแล<input class="ctl" name="edit_token" type="password" autocomplete="current-password" required></label>',
      '</div></div><div class="muted" id="carsErr" role="alert"></div><div class="modalFoot"><button class="btn" id="carsNew" type="button">เพิ่มรถใหม่</button><button class="btn" id="carsCancel" type="button">ยกเลิก</button><button class="btn save" id="carsSave" type="submit">บันทึกข้อมูลรถ</button></div></form></div>',
      '<div class="modalBg" id="settingsModal" hidden><form class="modal settingsModal" id="settingsForm"><div class="modalHead"><h2>ตั้งค่าข้อมูล</h2><button class="btn" id="settingsClose" type="button">ปิด</button></div><p class="muted">เพิ่มรายการสำหรับ Dropdown ในหน้าออกใบจองได้ที่นี่ รายการที่บันทึกแล้วจะใช้ได้กับทั้งสถานที่ส่งและสถานที่คืนรถทันที</p><div class="settingsGrid"><section class="settingsCard"><h3>ช่องทางการจอง</h3><div class="muted">เช่น LINE OA, Facebook, Partner</div><div class="settingsAdd"><input class="ctl" id="settingsChannelValue" placeholder="เพิ่มช่องทางการจอง"><button class="btn save" id="settingsChannelAdd" type="button">เพิ่ม</button></div><div class="settingsList" id="settingsChannels"></div></section><section class="settingsCard"><h3>สถานที่รับ / ส่งรถ</h3><div class="muted">เช่น สนามบินกระบี่, ท่าเรือ, โรงแรม</div><div class="settingsAdd"><input class="ctl" id="settingsLocationValue" placeholder="เพิ่มสถานที่"><button class="btn save" id="settingsLocationAdd" type="button">เพิ่ม</button></div><div class="settingsList" id="settingsLocations"></div></section></div><label class="settingsCode">รหัสผู้ดูแล<input class="ctl" name="edit_token" type="password" autocomplete="current-password" required></label><div class="muted" id="settingsErr" role="alert"></div><div class="modalFoot"><button class="btn" id="settingsCancel" type="button">ยกเลิก</button></div></form></div>'
    ].join(''));
  }
  async function fetchCars() {
    var response = await fetch('/api/cars'); if (!response.ok) throw new Error('cars');
    cars = await response.json(); return cars;
  }
  function carName(car) { return [car.model, car.car_ref, car.license_plate].filter(Boolean).join(' · '); }
  function renderCars() {
    var list = by('carsList');
    if (!cars.length) { list.innerHTML = '<div class="muted">ยังไม่มีข้อมูลรถ เพิ่มรถคันแรกได้เลย</div>'; return; }
    list.innerHTML = cars.map(function (car) { return '<button class="carRow ' + (car.id === editingCarId ? 'on' : '') + '" type="button" data-car-id="' + esc(car.id) + '"><b>' + esc(carName(car)) + '</b><span>' + esc(car.status) + ' · ' + Number(car.default_daily_rate || 0).toLocaleString('th-TH') + ' บาท/วัน</span></button>'; }).join('');
  }
  function carOptions() {
    var select = by('bookingCar'), selected = select.value;
    select.innerHTML = '<option value="">เลือกรถคันจริง</option>' + cars.filter(function (car) { return car.active && !['ซ่อม', 'งดใช้งาน'].includes(car.status); }).map(function (car) { return '<option value="' + esc(car.id) + '">' + esc(carName(car)) + ' · ' + esc(car.status) + '</option>'; }).join('');
    select.value = selected;
  }
  async function fetchBookingOptions() {
    var response = await fetch('/api/booking-options'); if (!response.ok) throw new Error('options');
    var rows = await response.json(); bookingOptions = { channels: [], locations: [] };
    rows.forEach(function (row) { if (row.option_type === 'channel') bookingOptions.channels.push(row.label); if (row.option_type === 'location') bookingOptions.locations.push(row.label); });
    renderEnumOptions(); return rows;
  }
  function enumValues(name) { return Array.from(new Set(enumDefaults[name].concat(bookingOptions[name] || []).map(function (value) { return String(value || '').trim(); }).filter(Boolean))); }
  function setSelectOptions(id, values, selected, placeholder) {
    var select = by(id); if (!select) return;
    select.innerHTML = (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + values.map(function (value) { return '<option value="' + esc(value) + '">' + esc(value) + '</option>'; }).join('');
    select.value = values.includes(selected) ? selected : (values[0] || '');
  }
  function renderEnumOptions() {
    var channel = by('bookingChannel'), pickup = by('bookingPickupLocation'), returning = by('bookingReturnLocation');
    setSelectOptions('bookingChannel', enumValues('channels'), channel ? channel.value : 'Direct / Dashboard', 'เลือกช่องทางการจอง');
    setSelectOptions('bookingPickupLocation', enumValues('locations'), pickup ? pickup.value : 'สนามบินสุราษฎร์ธานี', 'เลือกสถานที่ส่งรถ');
    setSelectOptions('bookingReturnLocation', enumValues('locations'), returning ? returning.value : 'สนามบินสุราษฎร์ธานี', 'เลือกสถานที่คืนรถ');
    if (by('settingsChannels')) by('settingsChannels').innerHTML = enumValues('channels').map(function (value) { return '<span class="settingsTag">' + esc(value) + '</span>'; }).join('');
    if (by('settingsLocations')) by('settingsLocations').innerHTML = enumValues('locations').map(function (value) { return '<span class="settingsTag">' + esc(value) + '</span>'; }).join('');
  }
  async function addBookingOption(optionType) {
    var form = by('settingsForm'), input = by(optionType === 'channel' ? 'settingsChannelValue' : 'settingsLocationValue'), label = input.value.trim(), tokenValue = form.elements.edit_token.value.trim(), button = by(optionType === 'channel' ? 'settingsChannelAdd' : 'settingsLocationAdd');
    if (!label) { by('settingsErr').textContent = 'กรอกชื่อรายการที่ต้องการเพิ่ม'; return; }
    if (!tokenValue) { by('settingsErr').textContent = 'กรอกรหัสผู้ดูแลก่อนเพิ่มรายการ'; return; }
    button.disabled = true; by('settingsErr').textContent = '';
    try {
      var response = await fetch('/api/booking-options', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify({ option_type: optionType, label: label }) });
      var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'เพิ่มรายการไม่สำเร็จ'), { status: response.status });
      var key = optionType === 'channel' ? 'channels' : 'locations'; bookingOptions[key] = Array.from(new Set((bookingOptions[key] || []).concat(result.label || label))); renderEnumOptions(); input.value = '';
      try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {}
      by('settingsErr').textContent = 'เพิ่มรายการแล้ว และเลือกใช้ในใบจองได้ทันที';
    } catch (error) { by('settingsErr').textContent = error.status === 403 ? 'รหัสผู้ดูแลไม่ถูกต้อง' : (error.message || 'เพิ่มรายการไม่สำเร็จ'); } finally { button.disabled = false; }
  }
  function bookingTimes() {
    var form = by('bookingForm'), start = new Date(form.elements.pickup_date.value + 'T' + form.elements.pickup_time.value + ':00+07:00').getTime(), end = new Date(form.elements.return_date.value + 'T' + form.elements.return_time.value + ':00+07:00').getTime();
    var duration = end - start, status = by('bookingConflict'); status.textContent = '';
    if (!Number.isFinite(duration) || duration <= 0) { by('bookingDuration').textContent = 'ระยะเวลาเช่า: วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ'; by('bookingTotal').textContent = 'ยอดค่าเช่า 0.00 บาท'; by('bookingCharge').textContent = ''; return; }
    var minutes = Math.floor(duration / 60000), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60, chargedDays = Math.max(1, Math.ceil(minutes / 1440));
    var total = money(form.elements.daily_rate.value) * chargedDays + money(form.elements.delivery_fee.value);
    by('bookingDuration').textContent = 'ระยะเวลาเช่า: ' + days + ' วัน ' + hours + ' ชั่วโมง ' + mins + ' นาที';
    by('bookingTotal').textContent = 'ยอดค่าเช่า ' + total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท';
    by('bookingCharge').textContent = 'คิดค่าเช่า ' + chargedDays + ' วัน × ' + money(form.elements.daily_rate.value).toLocaleString('th-TH') + ' บาท' + (money(form.elements.delivery_fee.value) ? ' + ค่ารับ-ส่ง ' + money(form.elements.delivery_fee.value).toLocaleString('th-TH') + ' บาท' : '');
    form.dataset.serviceTotal = String(total);
  }
  function resetBooking() {
    var form = by('bookingForm'); form.reset(); var now = localNow(), pickupDate = now.slice(0, 10), nextDay = new Date(pickupDate + 'T12:00:00+07:00'); nextDay.setDate(nextDay.getDate() + 1); form.elements.pickup_date.value = pickupDate; form.elements.pickup_time.value = now.slice(11, 16); form.elements.return_date.value = nextDay.toISOString().slice(0, 10); form.elements.return_time.value = now.slice(11, 16); form.elements.edit_token.value = token(); form.dataset.serviceTotal = '0'; by('bookingErr').textContent = ''; renderEnumOptions(); form.elements.booking_channel.value = enumValues('channels').includes('Direct / Dashboard') ? 'Direct / Dashboard' : form.elements.booking_channel.value; form.elements.pickup_location.value = enumValues('locations').includes('สนามบินสุราษฎร์ธานี') ? 'สนามบินสุราษฎร์ธานี' : form.elements.pickup_location.value; form.elements.return_location.value = form.elements.pickup_location.value; carOptions(); bookingTimes();
  }
  async function openBooking() {
    try { await fetchCars(); await fetchBookingOptions().catch(function () {}); resetBooking(); by('bookingModal').hidden = false; } catch (e) { alert('โหลดข้อมูลรถไม่สำเร็จ ลองรีเฟรชอีกครั้ง'); }
  }
  async function openSettings() {
    try { await fetchBookingOptions(); by('settingsForm').reset(); by('settingsForm').elements.edit_token.value = token(); by('settingsErr').textContent = ''; by('settingsModal').hidden = false; } catch (e) { alert('โหลดรายการตั้งค่าไม่สำเร็จ ลองรีเฟรชอีกครั้ง'); }
  }
  function showCarImage(url) { by('carImagePreview').innerHTML = url ? '<img src="' + esc(url) + '" alt="รูปภาพรถ">' : 'ยังไม่มีรูปภาพรถ'; }
  function resetCar() { var form = by('carsForm'); form.reset(); editingCarId = ''; form.elements.status.value = 'ว่าง'; form.elements.active.checked = true; form.elements.edit_token.value = token(); by('carsErr').textContent = ''; showCarImage(''); renderCars(); }
  async function openCars() { try { await fetchCars(); resetCar(); by('carsModal').hidden = false; } catch (e) { alert('โหลดข้อมูลรถไม่สำเร็จ ลองรีเฟรชอีกครั้ง'); } }
  function openCar(id) { var car = cars.find(function (item) { return item.id === id; }); if (!car) return; editingCarId = id; var form = by('carsForm'); ['car_ref','model','license_plate','color','model_year','status','default_daily_rate','default_security_deposit','image_url','note'].forEach(function (key) { form.elements[key].value = car[key] == null ? '' : car[key]; }); form.elements.active.checked = Boolean(car.active); form.elements.edit_token.value = token(); by('carsErr').textContent = ''; showCarImage(car.image_url); renderCars(); }
  function photoPayload(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve(null);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return reject(new Error('รูปภาพต้องเป็น JPG, PNG หรือ WebP และขนาดไม่เกิน 5 MB'));
      var reader = new FileReader(); reader.onerror = function () { reject(new Error('อ่านรูปภาพไม่สำเร็จ')); }; reader.onload = function () { resolve({ image_data: String(reader.result).split(',')[1], image_type: file.type }); }; reader.readAsDataURL(file);
    });
  }
  function close(id) { by(id).hidden = true; }
  function init() {
    renderShell(); renderEnumOptions();
    by('bookingBtn').addEventListener('click', openBooking); by('carsBtn').addEventListener('click', openCars); by('settingsBtn').addEventListener('click', openSettings);
    by('bookingClose').onclick = function () { close('bookingModal'); }; by('bookingCancel').onclick = function () { close('bookingModal'); };
    by('carsClose').onclick = function () { close('carsModal'); }; by('carsCancel').onclick = function () { close('carsModal'); }; by('carsNew').onclick = resetCar;
    by('settingsClose').onclick = function () { close('settingsModal'); }; by('settingsCancel').onclick = function () { close('settingsModal'); };
    by('settingsChannelAdd').onclick = function () { addBookingOption('channel'); }; by('settingsLocationAdd').onclick = function () { addBookingOption('location'); };
    ['pickup_date','pickup_time','return_date','return_time','daily_rate','delivery_fee'].forEach(function (name) { by('bookingForm').elements[name].addEventListener('input', bookingTimes); by('bookingForm').elements[name].addEventListener('change', bookingTimes); });
    by('bookingCar').addEventListener('change', function () { var car = cars.find(function (item) { return item.id === by('bookingCar').value; }); if (!car) return; var form = by('bookingForm'); form.elements.daily_rate.value = car.default_daily_rate || 0; form.elements.security_deposit.value = car.default_security_deposit || 0; bookingTimes(); });
    by('carsList').addEventListener('click', function (event) { var button = event.target.closest('[data-car-id]'); if (button) openCar(button.dataset.carId); });
    by('carImageFile').addEventListener('change', function () { var file = this.files && this.files[0]; if (file) showCarImage(URL.createObjectURL(file)); });
    by('carsForm').addEventListener('submit', async function (event) { event.preventDefault(); var form = by('carsForm'), tokenValue = form.elements.edit_token.value.trim(), data = {}, file = form.elements.image_file.files && form.elements.image_file.files[0]; new FormData(form).forEach(function (value, key) { if (key !== 'edit_token' && key !== 'image_file') data[key] = value; }); data.active = form.elements.active.checked; by('carsSave').disabled = true; by('carsErr').textContent = ''; try { var photo = await photoPayload(file); if (photo) Object.assign(data, photo); var response = await fetch(editingCarId ? '/api/cars/' + encodeURIComponent(editingCarId) : '/api/cars', { method: editingCarId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify(data) }); var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'error'), { status: response.status }); try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {} await fetchCars(); openCar(result.id); by('carsErr').textContent = 'บันทึกข้อมูลรถแล้ว'; } catch (error) { by('carsErr').textContent = error.status === 403 ? 'รหัสผู้ดูแลไม่ถูกต้อง' : (error.message || 'บันทึกข้อมูลรถไม่สำเร็จ'); } finally { by('carsSave').disabled = false; } });
    by('bookingForm').addEventListener('submit', async function (event) { event.preventDefault(); var form = by('bookingForm'), tokenValue = form.elements.edit_token.value.trim(), data = {}; new FormData(form).forEach(function (value, key) { if (key !== 'edit_token' && key !== 'wants_tax_invoice' && key !== 'document_language') data[key] = value; }); data.wants_tax_invoice = form.elements.wants_tax_invoice.checked; data.service_total = form.dataset.serviceTotal || '0'; var language = form.elements.document_language.value === 'th' ? 'th' : 'en', selectedCar = cars.find(function (car) { return car.id === data.car_id; }); data.car = selectedCar ? carName(selectedCar) : ''; by('bookingSave').disabled = true; by('bookingErr').textContent = ''; try { var response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify(data) }); var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'บันทึกใบจองไม่สำเร็จ'), { status: response.status, detail: result }); try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {} var documentData = Object.assign({}, data, result, { car: result.car || data.car }); by('bookingErr').textContent = 'บันทึกแล้ว กำลังสร้าง PDF…'; await downloadBookingPdf(documentData, language); close('bookingModal'); by('rf').click(); alert('บันทึกใบจอง ' + (result.booking_no || '') + ' แล้ว และดาวน์โหลด PDF เรียบร้อย'); } catch (error) { var conflict = error.detail && error.detail.conflict; by('bookingErr').textContent = conflict ? error.message + ' (' + (conflict.booking_no || conflict.customer_name || 'มีรายการเดิม') + ')' : (error.message || 'บันทึกใบจองไม่สำเร็จ'); } finally { by('bookingSave').disabled = false; } });
    document.addEventListener('click', async function (event) { var button = event.target.closest('[data-booking-pdf]'); if (!button) return; var item = (window.rows || []).find(function (row) { return String(row.id) === String(button.dataset.bookingPdf); }); if (!item) { alert('ไม่พบข้อมูลใบจอง โปรดรีเฟรชหน้าเว็บแล้วลองใหม่'); return; } button.disabled = true; var before = button.textContent; button.textContent = 'กำลังสร้าง PDF…'; try { await downloadBookingPdf(item, button.dataset.bookingLanguage === 'th' ? 'th' : 'en'); } catch (error) { alert('สร้าง PDF ไม่สำเร็จ: ' + (error.message || 'โปรดรีเฟรชหน้าเว็บแล้วลองใหม่')); } finally { button.disabled = false; button.textContent = before; } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
