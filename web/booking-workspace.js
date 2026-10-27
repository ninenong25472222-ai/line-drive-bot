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
  function renderShell() {
    var style = document.createElement('style');
    style.textContent = '.bookModal{max-width:880px}.bookGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bookGrid .wide{grid-column:1/-1}.bookSection{grid-column:1/-1;margin:8px 0 0;padding:9px 0 4px;border-bottom:1px solid var(--line);font-weight:700;color:var(--ink)}.bookEnumHint{display:block;margin-top:3px;font-size:11px;color:var(--mut)}.enumManage{grid-column:1/-1;display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:end;padding:10px;border:1px dashed #b8d9ed;border-radius:10px;background:#fbfdff}.enumManage label{display:grid;gap:4px;color:var(--mut);font-size:12px}.bookSummary{grid-column:1/-1;border-radius:12px;background:#e8f3fb;padding:11px 13px;color:#0f5f93}.bookSummary b{display:block;font-size:17px;color:var(--ink)}.bookBreakdown{display:block;margin-top:3px;font-size:12px;color:#35586e}.carModal{max-width:900px}.carLayout{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.2fr);gap:12px}.carList{max-height:440px;overflow:auto;display:grid;gap:7px}.carRow{border:1px solid var(--line);background:#fff;border-radius:11px;padding:10px;text-align:left}.carRow.on{border-color:var(--p);box-shadow:0 0 0 2px #d9eefb}.carRow b,.carRow span{display:block}.carRow span{font-size:12px;color:var(--mut)}.carForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.carForm .wide{grid-column:1/-1}.carPhoto{min-height:100px;border:1px dashed var(--line);border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fbfdff;color:var(--mut);font-size:12px}.carPhoto img{display:block;width:100%;max-height:210px;object-fit:cover}.carStatus{font-size:12px;color:var(--mut)}@media(max-width:640px){.bookGrid,.carForm{grid-template-columns:1fr}.carLayout{grid-template-columns:1fr}.bookGrid .wide,.carForm .wide{grid-column:auto}.enumManage{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', [
      '<div class="modalBg" id="bookingModal" hidden><form class="modal bookModal" id="bookingForm">',
      '<div class="modalHead"><h2>ออกใบจอง</h2><button class="btn" id="bookingClose" type="button">ปิด</button></div>',
      '<p class="muted">รูปแบบข้อมูลเดียวกับ AppSheet — ระบบตรวจรถและช่วงวัน/เวลาซ้อนก่อนบันทึก</p><div class="bookGrid">',
      '<div class="bookSection">ข้อมูลลูกค้า 👤</div>',
      '<label>ช่องทางการจอง<input class="ctl" name="booking_channel" list="bookingChannelOptions" value="Direct / Dashboard" placeholder="เลือกหรือพิมพ์เพิ่มเอง" required><span class="bookEnumHint">เลือกจากรายการ หรือพิมพ์เองได้</span></label>',
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
      '<div class="bookSection">ข้อมูลการเดินทาง 🚗</div>',
      '<label class="wide">รถคันจริง<select class="ctl" name="car_id" id="bookingCar" required><option value="">กำลังโหลดข้อมูลรถ…</option></select></label>',
      '<label>วันส่งรถ<input class="ctl" name="pickup_date" type="date" required></label>',
      '<label>เวลาส่งรถ<input class="ctl" name="pickup_time" type="time" required></label>',
      '<label>วันคืนรถ<input class="ctl" name="return_date" type="date" required></label>',
      '<label>เวลาคืนรถ<input class="ctl" name="return_time" type="time" required></label>',
      '<label>สถานที่ส่ง<input class="ctl" name="pickup_location" list="bookingLocationOptions" value="สนามบินสุราษฎร์ธานี" placeholder="เลือกหรือพิมพ์เพิ่มเอง" required><span class="bookEnumHint">เลือกจากรายการ หรือพิมพ์เองได้</span></label>',
      '<label>สถานที่คืน<input class="ctl" name="return_location" list="bookingLocationOptions" value="สนามบินสุราษฎร์ธานี" placeholder="เลือกหรือพิมพ์เพิ่มเอง" required><span class="bookEnumHint">เลือกจากรายการ หรือพิมพ์เองได้</span></label>',
      '<datalist id="bookingChannelOptions"></datalist><datalist id="bookingLocationOptions"></datalist>',
      '<div class="enumManage"><label>เพิ่มในรายการ<select class="ctl" id="bookingOptionType"><option value="location">สถานที่</option><option value="channel">ช่องทางการจอง</option></select></label><label>ชื่อรายการ<input class="ctl" id="bookingOptionValue" placeholder="เช่น สนามบินกระบี่"></label><button class="btn" type="button" id="bookingOptionAdd">เพิ่มรายการ</button></div>',
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
      '</div></div><div class="muted" id="carsErr" role="alert"></div><div class="modalFoot"><button class="btn" id="carsNew" type="button">เพิ่มรถใหม่</button><button class="btn" id="carsCancel" type="button">ยกเลิก</button><button class="btn save" id="carsSave" type="submit">บันทึกข้อมูลรถ</button></div></form></div>'
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
  function renderEnumOptions() {
    by('bookingChannelOptions').innerHTML = enumValues('channels').map(function (value) { return '<option value="' + esc(value) + '"></option>'; }).join('');
    by('bookingLocationOptions').innerHTML = enumValues('locations').map(function (value) { return '<option value="' + esc(value) + '"></option>'; }).join('');
  }
  async function addBookingOption() {
    var form = by('bookingForm'), optionType = by('bookingOptionType').value, label = by('bookingOptionValue').value.trim(), tokenValue = form.elements.edit_token.value.trim();
    if (!label) { by('bookingErr').textContent = 'กรอกชื่อรายการที่ต้องการเพิ่ม'; return; }
    if (!tokenValue) { by('bookingErr').textContent = 'กรอกรหัสผู้ดูแลก่อนเพิ่มรายการ'; return; }
    by('bookingOptionAdd').disabled = true; by('bookingErr').textContent = '';
    try {
      var response = await fetch('/api/booking-options', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify({ option_type: optionType, label: label }) });
      var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'เพิ่มรายการไม่สำเร็จ'), { status: response.status });
      var key = optionType === 'channel' ? 'channels' : 'locations'; bookingOptions[key] = enumValues(key).concat(result.label || label); renderEnumOptions(); by('bookingOptionValue').value = '';
      if (optionType === 'channel') form.elements.booking_channel.value = result.label || label; else form.elements.pickup_location.value = result.label || label;
      by('bookingErr').textContent = 'เพิ่มรายการแล้ว ใช้เลือกได้ทันที';
    } catch (error) { by('bookingErr').textContent = error.status === 403 ? 'รหัสผู้ดูแลไม่ถูกต้อง' : (error.message || 'เพิ่มรายการไม่สำเร็จ'); } finally { by('bookingOptionAdd').disabled = false; }
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
    var form = by('bookingForm'); form.reset(); var now = localNow(), pickupDate = now.slice(0, 10), nextDay = new Date(pickupDate + 'T12:00:00+07:00'); nextDay.setDate(nextDay.getDate() + 1); form.elements.pickup_date.value = pickupDate; form.elements.pickup_time.value = now.slice(11, 16); form.elements.return_date.value = nextDay.toISOString().slice(0, 10); form.elements.return_time.value = now.slice(11, 16); form.elements.booking_channel.value = 'Direct / Dashboard'; form.elements.pickup_location.value = 'สนามบินสุราษฎร์ธานี'; form.elements.return_location.value = 'สนามบินสุราษฎร์ธานี'; form.elements.edit_token.value = token(); form.dataset.serviceTotal = '0'; by('bookingErr').textContent = ''; renderEnumOptions(); carOptions(); bookingTimes();
  }
  async function openBooking() {
    try { await fetchCars(); await fetchBookingOptions().catch(function () {}); resetBooking(); by('bookingModal').hidden = false; } catch (e) { alert('โหลดข้อมูลรถไม่สำเร็จ ลองรีเฟรชอีกครั้ง'); }
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
    by('bookingBtn').addEventListener('click', openBooking); by('carsBtn').addEventListener('click', openCars);
    by('bookingClose').onclick = function () { close('bookingModal'); }; by('bookingCancel').onclick = function () { close('bookingModal'); };
    by('carsClose').onclick = function () { close('carsModal'); }; by('carsCancel').onclick = function () { close('carsModal'); }; by('carsNew').onclick = resetCar;
    by('bookingOptionAdd').onclick = addBookingOption;
    ['pickup_date','pickup_time','return_date','return_time','daily_rate','delivery_fee'].forEach(function (name) { by('bookingForm').elements[name].addEventListener('input', bookingTimes); by('bookingForm').elements[name].addEventListener('change', bookingTimes); });
    by('bookingCar').addEventListener('change', function () { var car = cars.find(function (item) { return item.id === by('bookingCar').value; }); if (!car) return; var form = by('bookingForm'); form.elements.daily_rate.value = car.default_daily_rate || 0; form.elements.security_deposit.value = car.default_security_deposit || 0; bookingTimes(); });
    by('carsList').addEventListener('click', function (event) { var button = event.target.closest('[data-car-id]'); if (button) openCar(button.dataset.carId); });
    by('carImageFile').addEventListener('change', function () { var file = this.files && this.files[0]; if (file) showCarImage(URL.createObjectURL(file)); });
    by('carsForm').addEventListener('submit', async function (event) { event.preventDefault(); var form = by('carsForm'), tokenValue = form.elements.edit_token.value.trim(), data = {}, file = form.elements.image_file.files && form.elements.image_file.files[0]; new FormData(form).forEach(function (value, key) { if (key !== 'edit_token' && key !== 'image_file') data[key] = value; }); data.active = form.elements.active.checked; by('carsSave').disabled = true; by('carsErr').textContent = ''; try { var photo = await photoPayload(file); if (photo) Object.assign(data, photo); var response = await fetch(editingCarId ? '/api/cars/' + encodeURIComponent(editingCarId) : '/api/cars', { method: editingCarId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify(data) }); var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'error'), { status: response.status }); try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {} await fetchCars(); openCar(result.id); by('carsErr').textContent = 'บันทึกข้อมูลรถแล้ว'; } catch (error) { by('carsErr').textContent = error.status === 403 ? 'รหัสผู้ดูแลไม่ถูกต้อง' : (error.message || 'บันทึกข้อมูลรถไม่สำเร็จ'); } finally { by('carsSave').disabled = false; } });
    by('bookingForm').addEventListener('submit', async function (event) { event.preventDefault(); var form = by('bookingForm'), tokenValue = form.elements.edit_token.value.trim(), data = {}; new FormData(form).forEach(function (value, key) { if (key !== 'edit_token' && key !== 'wants_tax_invoice') data[key] = value; }); data.wants_tax_invoice = form.elements.wants_tax_invoice.checked; data.service_total = form.dataset.serviceTotal || '0'; by('bookingSave').disabled = true; by('bookingErr').textContent = ''; try { var response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Booking-Edit-Token': tokenValue }, body: JSON.stringify(data) }); var result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'บันทึกใบจองไม่สำเร็จ'), { status: response.status, detail: result }); try { sessionStorage.setItem('rd_edit_token', tokenValue); } catch (e) {} close('bookingModal'); by('rf').click(); alert('บันทึกใบจอง ' + (result.booking_no || '') + ' แล้ว'); } catch (error) { var conflict = error.detail && error.detail.conflict; by('bookingErr').textContent = conflict ? error.message + ' (' + (conflict.booking_no || conflict.customer_name || 'มีรายการเดิม') + ')' : (error.message || 'บันทึกใบจองไม่สำเร็จ'); } finally { by('bookingSave').disabled = false; } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
