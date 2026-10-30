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
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return '-';
    var date = new Date(value + 'T12:00:00+07:00');
    var locale = language === 'th' ? 'th-TH' : 'en-GB';
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) + (time ? ' · ' + time : '');
  }
  function durationText(data, language) {
    var start = new Date(String(data.pickup_date || '') + 'T' + String(data.pickup_time || '00:00') + ':00+07:00').getTime();
    var end = new Date(String(data.return_date || '') + 'T' + String(data.return_time || '00:00') + ':00+07:00').getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return language === 'th' ? 'ยังระบุวันและเวลาไม่ครบ' : 'Date and time not fully specified';
    var minutes = Math.max(0, Math.round((end - start) / 60000)), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
    return language === 'th' ? days + ' วัน ' + hours + ' ชั่วโมง ' + mins + ' นาที' : days + ' day(s) ' + hours + ' hour(s) ' + mins + ' minute(s)';
  }
  function documentBookingData(input) {
    var data = Object.assign({}, input || {});
    data.pickup_date = data._p || data.pickup_on || data.pickup_date || '';
    data.return_date = data._r || data.return_on || data.return_date || '';
    data.pickup_time = data._pt || data.pickup_time || '';
    data.return_time = data._rt || data.return_time || '';
    return data;
  }
  function bookingCanvas(data, language) {
    var isThai = language === 'th', labels = isThai ? {
      title: 'ใบยืนยันการจองรถเช่า', no: 'เลขที่ใบจอง', customer: 'ข้อมูลผู้เช่า', name: 'ชื่อผู้เช่า', phone: 'โทรศัพท์', email: 'อีเมล', car: 'รถที่จอง', channel: 'ช่องทางการจอง', pickup: 'ส่งมอบรถ', returning: 'รับคืนรถ', location: 'สถานที่', duration: 'ระยะเวลาเช่า', charges: 'สรุปค่าใช้จ่าย', rate: 'ราคาต่อวัน', rental: 'ค่าเช่า', delivery: 'ค่ารับ-ส่ง', paid: 'ยอดโอนจอง', deposit: 'เงินมัดจำ', total: 'ยอดรวมค่าเช่า', note: 'หมายเหตุ', footer: 'กรุณาแสดงเอกสารฉบับนี้เมื่อรับรถ', signature: 'ลายเซ็นผู้เช่า', baht: 'บาท'
    } : {
      title: 'RENTAL BOOKING CONFIRMATION', no: 'Booking No.', customer: 'Renter Details', name: 'Renter Name', phone: 'Phone', email: 'Email', car: 'Reserved Vehicle', channel: 'Booking Channel', pickup: 'Vehicle Delivery', returning: 'Vehicle Return', location: 'Location', duration: 'Rental Duration', charges: 'Rental Charges', rate: 'Daily Rate', rental: 'Rental Charge', delivery: 'Delivery / Collection Fee', paid: 'Booking Deposit Paid', deposit: 'Security Deposit', total: 'Total Rental Charge', note: 'Notes', footer: 'Please present this document when collecting the vehicle.', signature: 'Renter Signature', baht: 'THB'
    };
    var canvas = document.createElement('canvas'), width = 1240, height = 1754, ctx = canvas.getContext('2d'), margin = 88, y = 0;
    canvas.width = width; canvas.height = height; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.textBaseline = 'top';
    function font(size, bold) { ctx.font = (bold ? '700 ' : '400 ') + size + 'px Arial, "Noto Sans Thai", sans-serif'; }
    function text(value, x, top, size, bold, color) { font(size, bold); ctx.fillStyle = color || '#142b40'; ctx.fillText(String(value == null || value === '' ? '-' : value), x, top); }
    function line(top, x1, x2, color, size) { ctx.strokeStyle = color || '#c6ddea'; ctx.lineWidth = size || 2; ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x2, top); ctx.stroke(); }
    function wrap(value, x, top, maxWidth, size, bold, color, gap) { font(size, bold); ctx.fillStyle = color || '#142b40'; var source = String(value == null || value === '' ? '-' : value), words = source.includes(' ') ? source.split(/\s+/) : Array.from(source), rows = [], row = ''; words.forEach(function (part) { var next = row ? row + (source.includes(' ') ? ' ' : '') + part : part; if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = part; } else row = next; }); if (row) rows.push(row); rows.forEach(function (rowText, index) { ctx.fillText(rowText, x, top + index * (gap || size * 1.35)); }); return rows.length * (gap || size * 1.35); }
    function card(x, top, w, h) { ctx.strokeStyle = '#c6ddea'; ctx.lineWidth = 2; ctx.strokeRect(x, top, w, h); }
    var start = new Date(String(data.pickup_date || '') + 'T' + String(data.pickup_time || '00:00') + ':00+07:00').getTime(), end = new Date(String(data.return_date || '') + 'T' + String(data.return_time || '00:00') + ':00+07:00').getTime(), chargedDays = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.max(1, Math.ceil((end - start) / 86400000)) : 1, dailyRate = money(data.daily_rate), deliveryFee = money(data.delivery_fee), total = money(data.service_total) || dailyRate * chargedDays + deliveryFee;
    ctx.fillStyle = '#0870ad'; ctx.fillRect(0, 0, width, 20); text('RENTAL DESK', margin, 70, 42, true, '#0870ad'); text('Car rental booking', margin, 122, 21, false, '#537084');
    ctx.textAlign = 'right'; text(labels.title, width - margin, 70, 29, true, '#0b405f'); text(labels.no + ': ' + (data.booking_no || '-'), width - margin, 122, 20, false, '#142b40'); ctx.textAlign = 'left'; line(170, margin, width - margin, '#1479b7', 5); y = 220;
    card(margin, y, 510, 270); card(642, y, 510, 270); text(labels.customer, margin + 24, y + 22, 20, true, '#126d9f'); text(labels.name, margin + 24, y + 68, 16, false, '#5b7384'); wrap(data.customer_name, margin + 24, y + 91, 450, 21, true); text(labels.phone, margin + 24, y + 142, 16, false, '#5b7384'); text(data.customer_phone, margin + 24, y + 165, 20, true); text(labels.email, margin + 24, y + 210, 16, false, '#5b7384'); wrap(data.customer_email, margin + 24, y + 233, 450, 18, true);
    text(labels.car, 666, y + 22, 20, true, '#126d9f'); text(labels.car, 666, y + 68, 16, false, '#5b7384'); wrap(data.car, 666, y + 91, 450, 21, true); text(labels.channel, 666, y + 142, 16, false, '#5b7384'); text(data.booking_channel, 666, y + 165, 20, true); text(labels.duration, 666, y + 210, 16, false, '#5b7384'); text(durationText(data, language), 666, y + 233, 18, true); y += 310;
    ctx.fillStyle = '#e9f5fb'; ctx.fillRect(margin, y, width - margin * 2, 190); line(y, margin, width - margin, '#bad8e8'); line(y + 190, margin, width - margin, '#bad8e8'); line(y, width / 2, width / 2, '#bad8e8'); text(labels.pickup, margin + 28, y + 26, 18, false, '#547286'); text(dateTime(data.pickup_date, data.pickup_time, language), margin + 28, y + 60, 24, true); wrap(labels.location + ': ' + (data.pickup_location || '-'), margin + 28, y + 105, 500, 18, false, '#142b40'); text(labels.returning, width / 2 + 28, y + 26, 18, false, '#547286'); text(dateTime(data.return_date, data.return_time, language), width / 2 + 28, y + 60, 24, true); wrap(labels.location + ': ' + (data.return_location || '-'), width / 2 + 28, y + 105, 500, 18, false, '#142b40'); y += 230;
    card(margin, y, width - margin * 2, 350); text(labels.charges, margin + 24, y + 24, 20, true, '#126d9f'); var costs = [[labels.rate + ' × ' + chargedDays + ' day(s)', dailyRate * chargedDays], [labels.delivery, deliveryFee], [labels.paid, money(data.booking_deposit)], [labels.deposit, money(data.security_deposit)]]; costs.forEach(function (entry, index) { var rowY = y + 75 + index * 48; text(entry[0], margin + 24, rowY, 18, false); ctx.textAlign = 'right'; text(formatMoney(entry[1]) + ' ' + labels.baht, width - margin - 24, rowY, 18, true); ctx.textAlign = 'left'; line(rowY + 35, margin + 24, width - margin - 24, '#e4edf2', 1); }); text(labels.total, margin + 24, y + 282, 24, true, '#063e5c'); ctx.textAlign = 'right'; text(formatMoney(total) + ' ' + labels.baht, width - margin - 24, y + 282, 26, true, '#063e5c'); ctx.textAlign = 'left'; y += 390;
    card(margin, y, width - margin * 2, 165); text(labels.note, margin + 24, y + 22, 20, true, '#126d9f'); wrap(data.booking_note, margin + 24, y + 60, width - margin * 2 - 48, 18, false, '#142b40'); y += 230;
    ctx.textAlign = 'center'; text(labels.footer, width / 2, y, 17, false, '#547286'); line(y + 105, width / 2 - 180, width / 2 + 180, '#6f8695', 2); text(labels.signature, width / 2, y + 120, 17, true, '#142b40'); ctx.textAlign = 'left'; return canvas;
  }
  function bookingCompanyProfile() {
    var defaults = { name: 'ห้างหุ้นส่วนจำกัด จิราพร คาร์เร้นท์ ( JIRAPORNCARRET )', address: '21 หมู่ที่ 3 ตำบลหัวเตย อำเภอพุนพิน จังหวัดสุราษฎร์ธานี 84130', tax: '0843566002448', phone: '095-032-8080 , 062-928-1405', logo: '' };
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem('rental_bill_profile_v1') || '{}')); } catch (e) { return defaults; }
  }
  function loadCanvasImage(source) {
    return new Promise(function (resolve) {
      if (!source) return resolve(null);
      var image = new Image(); image.crossOrigin = 'anonymous'; image.onload = function () { resolve(image); }; image.onerror = function () { resolve(null); }; image.src = source;
    });
  }
  function drawContain(ctx, image, x, y, width, height) {
    if (!image) return false;
    var scale = Math.min(width / image.width, height / image.height), w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h); return true;
  }
  async function bookingTemplateCanvas(input, language) {
    var data = documentBookingData(input), company = bookingCompanyProfile(), isThai = language === 'th', logo = await loadCanvasImage(company.logo), carPhoto = await loadCanvasImage(data.car_image_url), width = 1240, height = 1754, margin = 86, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.width = width; canvas.height = height; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.textBaseline = 'top';
    function font(size, bold) { ctx.font = (bold ? '700 ' : '400 ') + size + 'px Arial, "Noto Sans Thai", sans-serif'; }
    function text(value, x, y, size, bold, color, align) { font(size, bold); ctx.fillStyle = color || '#101820'; ctx.textAlign = align || 'left'; ctx.fillText(String(value == null || value === '' ? '-' : value), x, y); ctx.textAlign = 'left'; }
    function line(x1, y1, x2, y2, size) { ctx.strokeStyle = '#161616'; ctx.lineWidth = size || 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function box(x, y, w, h, size) { ctx.strokeStyle = '#161616'; ctx.lineWidth = size || 2; ctx.strokeRect(x, y, w, h); }
    function wrap(value, x, y, maxWidth, size, bold, color, gap) { font(size, bold); ctx.fillStyle = color || '#101820'; var source = String(value == null || value === '' ? '-' : value), units = source.includes(' ') ? source.split(/\s+/) : Array.from(source), rows = [], row = ''; units.forEach(function (unit) { var next = row ? row + (source.includes(' ') ? ' ' : '') + unit : unit; if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = unit; } else row = next; }); if (row) rows.push(row); rows.slice(0, 3).forEach(function (entry, index) { ctx.fillText(entry, x, y + index * (gap || size * 1.32)); }); return Math.min(rows.length, 3) * (gap || size * 1.32); }
    function labelValue(label, value, x, y, labelSize, valueColor) { text(label, x, y, labelSize || 22, true); var offset = ctx.measureText(label).width + 14; text(value, x + offset, y, labelSize || 22, false, valueColor || '#be1515'); }
    var start = new Date(String(data.pickup_date || '') + 'T' + String(data.pickup_time || '00:00') + ':00+07:00').getTime(), end = new Date(String(data.return_date || '') + 'T' + String(data.return_time || '00:00') + ':00+07:00').getTime(), durationMinutes = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 60000) : 0, chargedDays = durationMinutes ? Math.max(1, Math.ceil(durationMinutes / 1440)) : 1, days = Math.floor(durationMinutes / 1440), hours = Math.floor((durationMinutes % 1440) / 60), mins = durationMinutes % 60, dailyRate = money(data.daily_rate), deliveryFee = money(data.delivery_fee), serviceTotal = money(data.service_total) || dailyRate * chargedDays + deliveryFee, security = money(data.security_deposit), vat = data.wants_tax_invoice ? Math.round(serviceTotal * 7) / 100 : 0, grand = serviceTotal + security + vat, balance = grand - money(data.booking_deposit), locale = isThai ? 'th-TH' : 'en-GB';
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(margin + 70, 128, 58, 0, Math.PI * 2); ctx.stroke();
    if (!drawContain(ctx, logo, margin + 20, 78, 100, 100)) { text('JIRAPORN', margin + 70, 105, 15, true, '#111', 'center'); text('CAR RENT', margin + 70, 128, 15, true, '#111', 'center'); text('RENTAL', margin + 70, 151, 13, false, '#111', 'center'); }
    text(company.name, margin + 150, 87, 29, true); wrap(company.address, margin + 150, 133, 820, 24, true); text('โทร ' + (company.phone || '095-032-8080 , 062-928-1405') + '  เลขประจำตัวผู้เสียภาษี ' + (company.tax || '-'), margin + 150, 192, 20, true);
    var x = margin, y = 300, w = width - margin * 2, split = x + 535, right = x + w;
    box(x, y, w, 812, 3); line(x, y + 68, right, y + 68); text(isThai ? 'เลขที่การใบจอง' : 'Booking No.', x + 16, y + 21, 25, true); text(data.booking_no || '-', x + 190, y + 21, 25, false, '#0b26d6');
    line(split, y + 68, split, y + 188); line(x, y + 188, right, y + 188); line(split, y + 116, right, y + 116);
    labelValue(isThai ? 'ข้อมูลลูกค้า :' : 'Customer :', data.customer_name || '-', x + 16, y + 91, 22, '#0b26d6'); labelValue(isThai ? 'เบอร์โทรติดต่อ :' : 'Phone :', data.customer_phone || '-', x + 16, y + 128, 21, '#0b26d6'); if (data.customer_email) labelValue(isThai ? 'อีเมล :' : 'Email :', data.customer_email, x + 16, y + 160, 19, '#0b26d6');
    text(isThai ? 'จำนวนวัน ชั่วโมง นาที' : 'Days Hours Minutes', (split + right) / 2, y + 83, 23, true, '#111', 'center'); text(days + (isThai ? ' วัน ' : ' d ') + hours + (isThai ? ' ชั่วโมง ' : ' h ') + mins + (isThai ? ' นาที' : ' m'), (split + right) / 2, y + 111, 20, false, '#0b26d6', 'center'); text((isThai ? 'คิดเป็นจำนวน: ' : 'Charged: ') + chargedDays + (isThai ? ' วัน' : ' day(s)'), split + 16, y + 143, 20, true);
    var tripY = y + 188, mid = x + w / 2; line(mid, tripY, mid, tripY + 235); line(x, tripY + 235, right, tripY + 235); text('Pick Up / รับรถ', x + 16, tripY + 17, 23, true); text('Return / คืนรถ', mid + 16, tripY + 17, 23, true); text('DD / MM / YYYY', x + 125, tripY + 54, 21, true); text('DD / MM / YYYY', mid + 125, tripY + 54, 21, true); labelValue(isThai ? 'วันที่:' : 'Date:', data.pickup_date ? new Date(data.pickup_date + 'T12:00:00+07:00').toLocaleDateString(locale, { timeZone: 'Asia/Bangkok' }) : '-', x + 20, tripY + 91, 22); labelValue(isThai ? 'เวลา:' : 'Time:', data.pickup_time || '-', x + 20, tripY + 130, 22); labelValue(isThai ? 'สถานที่รับ:' : 'Location:', data.pickup_location || '-', x + 20, tripY + 169, 21); labelValue(isThai ? 'วันที่:' : 'Date:', data.return_date ? new Date(data.return_date + 'T12:00:00+07:00').toLocaleDateString(locale, { timeZone: 'Asia/Bangkok' }) : '-', mid + 20, tripY + 91, 22); labelValue(isThai ? 'เวลา:' : 'Time:', data.return_time || '-', mid + 20, tripY + 130, 22); labelValue(isThai ? 'สถานที่คืน:' : 'Location:', data.return_location || '-', mid + 20, tripY + 169, 21);
    var detailY = tripY + 235; line(mid, detailY, mid, y + 812); text(isThai ? 'รายละเอียดการชำระเงิน' : 'Payment details', x + 16, detailY + 17, 22, true); var payments = [[isThai ? 'ราคาต่อวัน :' : 'Daily rate:', dailyRate], [isThai ? 'ค่ารับ-ส่ง :' : 'Delivery fee:', deliveryFee], [isThai ? 'รวมค่าบริการ :' : 'Service total:', serviceTotal], [isThai ? 'เงินมัดจำ :' : 'Security deposit:', security], [isThai ? 'ภาษีมูลค่าเพิ่ม (7%) :' : 'VAT (7%):', vat], [isThai ? 'ราคารวมทั้งหมด :' : 'Grand total:', grand], [isThai ? 'ยอดโอนจองล่วงหน้า :' : 'Booking deposit:', money(data.booking_deposit)], [isThai ? 'ยอดรวมชำระวันรับรถ :' : 'Balance on pickup:', balance]]; payments.forEach(function (row, index) { var rowY = detailY + 56 + index * 35; text(row[0], x + 16, rowY, 19, index === 7); text(formatMoney(row[1]) + ' ' + (isThai ? 'บาท' : 'THB'), split - 16, rowY, 19, index === 7, index === 7 ? '#111' : '#151515', 'right'); });
    text(isThai ? 'รายละเอียดรถเช่า' : 'Vehicle details', mid + 16, detailY + 17, 22, true); text(data.car || '-', (mid + right) / 2, detailY + 62, 27, true, '#0b4981', 'center'); if (!drawContain(ctx, carPhoto, mid + 55, detailY + 115, right - mid - 110, 300)) { ctx.fillStyle = '#f2f5f7'; ctx.fillRect(mid + 90, detailY + 155, right - mid - 180, 170); text('CAR PHOTO', (mid + right) / 2, detailY + 225, 19, true, '#81909a', 'center'); }
    var termsY = 1150; text(isThai ? 'คำขอพิเศษ:' : 'Special request:', x, termsY, 20, true); wrap(data.booking_note || '-', x + 150, termsY, w - 150, 18, false); text(isThai ? 'เอกสารจำเป็นที่ต้องใช้สำหรับเช่ารถ' : 'Documents required for rental', x, termsY + 44, 20, true); wrap(isThai ? '1. บัตรประชาชน / Passport (กรณีต่างชาติ)\n2. ใบขับขี่ / International Driving Permit ได้รับอนุญาตมากกว่า 1 ปี และไม่หมดอายุ\n3. ตั๋วเครื่องบินหรือบัตรโดยสารที่ใช้ในการเดินทางมายังจุดหมายปลายทาง' : '1. ID card or passport\n2. Valid driving licence or International Driving Permit\n3. Flight ticket or travel document', x, termsY + 74, w, 18, false, '#111', 25); text(isThai ? 'นโยบายค่ามัดจำและการคืนเงินมัดจำ' : 'Security deposit policy', x, termsY + 158, 20, true); wrap(isThai ? 'ชำระเงินมัดจำในวันรับรถ และคืนให้ในวันคืนรถหากรถไม่ได้รับความเสียหาย' : 'The security deposit is paid on pickup and returned on the return date when the vehicle has no damage.', x, termsY + 187, w, 18, false, '#111', 24); text(isThai ? 'ความคุ้มครองของประกันภัย' : 'Insurance coverage', x, termsY + 235, 20, true); wrap(isThai ? 'รถทุกคันทำประกันภัยชั้น 1 เชิงพาณิชย์ กรณีอุบัติเหตุอาจมีค่าความเสียหายส่วนแรกตามเงื่อนไข' : 'All vehicles have commercial first-class insurance. An excess may apply according to the terms.', x, termsY + 264, w, 18, false, '#111', 24); text('☎ ' + (company.phone || '095-032-8080 , 062-928-1405'), x, termsY + 332, 19, true, '#b51e1e');
    return canvas;
  }
  function downloadCanvasPdf(canvas, filename) {
    return new Promise(function (resolve, reject) { canvas.toBlob(async function (imageBlob) {
      try {
        if (!imageBlob) throw new Error('สร้างภาพเอกสารไม่สำเร็จ'); var image = new Uint8Array(await imageBlob.arrayBuffer()), encoder = new TextEncoder(), parts = [], offsets = [], size = 0;
        function add(value) { var bytes = typeof value === 'string' ? encoder.encode(value) : value; parts.push(bytes); size += bytes.length; }
        function object(number, body) { offsets[number] = size; add(number + ' 0 obj\n'); add(body); add('\nendobj\n'); }
        add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); object(1, '<< /Type /Catalog /Pages 2 0 R >>'); object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'); object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'); offsets[4] = size; add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.length + ' >>\nstream\n'); add(image); add('\nendstream\nendobj\n'); var stream = 'q\n595 0 0 842 0 0 cm\n/Im1 Do\nQ\n'; object(5, '<< /Length ' + encoder.encode(stream).length + ' >>\nstream\n' + stream + 'endstream'); var xref = size; add('xref\n0 6\n0000000000 65535 f \n'); for (var i = 1; i <= 5; i++) add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n'); add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'); var blob = new Blob(parts, { type: 'application/pdf' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000); resolve();
      } catch (error) { reject(error); }
    }, 'image/jpeg', 0.96); });
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
    data = documentBookingData(data);
    if (!data.car_image_url && data.car_id) {
      if (!cars.length) { try { await fetchCars(); } catch (e) {} }
      var car = cars.find(function (item) { return String(item.id) === String(data.car_id); });
      if (car && car.image_url) data.car_image_url = car.image_url;
    }
    await downloadCanvasPdf(await bookingTemplateCanvas(data, language), shortFileName('BOOKING-' + (data.booking_no || 'rental') + '-' + (language === 'th' ? 'TH' : 'EN')) + '.pdf');
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
    by('bookingForm').addEventListener('submit', async function (event) { event.preventDefault(); var form = by('bookingForm'), tokenValue = form.elements.edit_token.value.trim(), data = {}; new FormData(form).forEach(function (value, key) { if (key !== 'edit_token' && key !== 'wants_tax_invoice' && key !== 'document_language') data[key] = value; }); data.wants_tax_invoice = form.elements.wants_tax_invoice.checked; data.service_total = form.dataset.serviceTotal || '0'; var language = form.elements.document_language.value === 'th' ? 'th' : 'en', selectedCar = cars.find(function (car) { return car.id === data.car_id; }); data.car = selectedCar ? carName(selectedCar) : ''; data.car_image_url = selectedCar && selectedCar.image_url ? selectedCar.image_url : ''; by('bookingSave').disabled = true; by('bookingErr').textContent = ''; try { var response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify(data) }); var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'บันทึกใบจองไม่สำเร็จ'), { status: response.status, detail: result }); try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {} var documentData = Object.assign({}, data, result, { car: result.car || data.car }); by('bookingErr').textContent = 'บันทึกแล้ว กำลังสร้าง PDF…'; await downloadBookingPdf(documentData, language); close('bookingModal'); by('rf').click(); alert('บันทึกใบจอง ' + (result.booking_no || '') + ' แล้ว และดาวน์โหลด PDF เรียบร้อย'); } catch (error) { var conflict = error.detail && error.detail.conflict; by('bookingErr').textContent = conflict ? error.message + ' (' + (conflict.booking_no || conflict.customer_name || 'มีรายการเดิม') + ')' : (error.message || 'บันทึกใบจองไม่สำเร็จ'); } finally { by('bookingSave').disabled = false; } });
    document.addEventListener('click', async function (event) { var button = event.target.closest('[data-booking-pdf]'); if (!button) return; var item = (window.rows || []).find(function (row) { return String(row.id) === String(button.dataset.bookingPdf); }); if (!item) { alert('ไม่พบข้อมูลใบจอง โปรดรีเฟรชหน้าเว็บแล้วลองใหม่'); return; } button.disabled = true; var before = button.textContent; button.textContent = 'กำลังสร้าง PDF…'; try { await downloadBookingPdf(item, button.dataset.bookingLanguage === 'th' ? 'th' : 'en'); } catch (error) { alert('สร้าง PDF ไม่สำเร็จ: ' + (error.message || 'โปรดรีเฟรชหน้าเว็บแล้วลองใหม่')); } finally { button.disabled = false; button.textContent = before; } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
