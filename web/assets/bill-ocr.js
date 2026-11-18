(function (global) {
  'use strict';

  var input = document.getElementById('billOcrFile');
  var readButton = document.getElementById('billOcrRead');
  var clearButton = document.getElementById('billOcrClear');
  var fileName = document.getElementById('billOcrFileName');
  var status = document.getElementById('billOcrStatus');
  var details = document.getElementById('billOcrDetails');
  var textOutput = document.getElementById('billOcrText');
  if (!input || !readButton || !status) return;

  var selectedFile = null;
  var workerPromise = null;
  var libraryPromise = null;
  var working = false;
  var maxFileBytes = 15 * 1024 * 1024;

  function setStatus(message) { status.textContent = message; }
  function normalizeDigits(value) {
    return String(value || '').replace(/[๐-๙]/g, function (digit) { return String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)); });
  }
  function compact(value) { return String(value || '').toLowerCase().replace(/[\s\u200b\u200c\u200d:：|,，.。]/g, ''); }
  function findTaxId(lines) {
    var label = /เลข\s*ประจำ\s*ตัว\s*(ผู้\s*เสีย\s*ภาษี|ประชาชน)|เลข\s*ผู้\s*เสีย\s*ภาษี|tax\s*(id|identification)|taxpayer\s*(id|number)|vat\s*(no|number)|\btin\b/i;
    var numberPattern = /(?:\d[\s.,-]*){13,}/g;
    for (var i = 0; i < lines.length; i++) {
      if (!label.test(lines[i])) continue;
      var nearby = lines.slice(i, Math.min(lines.length, i + 3)).join(' ');
      var matches = normalizeDigits(nearby).match(numberPattern) || [];
      for (var j = 0; j < matches.length; j++) {
        var digits = matches[j].replace(/\D/g, '');
        if (digits.length >= 13) return digits.slice(0, 13);
      }
    }
    return '';
  }
  function valueAfter(line, pattern) {
    var match = line.match(pattern);
    return match ? match[1].replace(/^\s*[:：|\-–]?\s*/, '').trim() : '';
  }
  function extractFields(rawText) {
    var lines = normalizeDigits(rawText).split(/\r?\n/).map(function (line) { return line.replace(/[|\u200b\u200c\u200d]/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var name = '', address = '', tax = findTaxId(lines);
    var namePattern = /(?:ชื่อลูกค้า|ชื่อบริษัท|ชื่อผู้ซื้อ|ชื่อผู้เสียภาษี|ชื่อผู้ประกอบการ|ชื่อ\s*[-–]\s*สกุล|customer\s*name|buyer\s*name|company\s*name|business\s*name)\s*[:：|\-–]?\s*(.*)$/i;
    var addressPattern = /(?:ที่อยู่|ที่\s*อยู่|ที่อยู่ตามทะเบียน|address|registered\s*address|head\s*office)\s*[:：|\-–]?\s*(.*)$/i;
    var stopPattern = /(?:เลข\s*ประจำ\s*ตัว\s*ผู้\s*เสีย\s*ภาษี|เลข\s*ผู้\s*เสีย\s*ภาษี|tax\s*(?:id|identification)|\btin\b|โทรศัพท์|โทร\.?|เบอร์โทร|phone|tel\.?|โทรสาร|fax|อีเมล|email|สาขา|branch|วันที่|date)/i;

    for (var i = 0; i < lines.length; i++) {
      if (!name) {
        var nameValue = valueAfter(lines[i], namePattern);
        if (nameValue && !/^(?:ผู้ซื้อ|ลูกค้า|customer|buyer)$/i.test(nameValue)) name = nameValue;
        else if (namePattern.test(lines[i]) && lines[i + 1] && !stopPattern.test(lines[i + 1])) name = lines[i + 1];
      }
      if (!address && addressPattern.test(lines[i])) {
        var first = valueAfter(lines[i], addressPattern);
        var addressLines = first ? [first] : [];
        for (var k = i + 1; k < lines.length && addressLines.length < 4; k++) {
          if (stopPattern.test(lines[k]) || namePattern.test(lines[k]) || addressPattern.test(lines[k])) break;
          addressLines.push(lines[k]);
        }
        address = addressLines.join(' ').trim();
      }
    }

    name = name.replace(/\s+/g, ' ').replace(/^[\s:：|\-–]+|[\s|]+$/g, '').slice(0, 250);
    address = address.replace(/\s+/g, ' ').replace(/^[\s:：|\-–]+|[\s|]+$/g, '').slice(0, 700);
    return { name: name, address: address, tax: tax };
  }

  function updateProgress(message) {
    if (!message || !message.status || !working) return;
    var labels = { 'loading tesseract core': 'กำลังเตรียมเครื่องมืออ่านภาพ', 'initializing tesseract': 'กำลังเริ่มระบบอ่านภาพ', 'loading language traineddata': 'กำลังโหลดชุดภาษาไทยและอังกฤษ', 'initializing api': 'กำลังเตรียมภาษา', 'recognizing text': 'กำลังอ่านตัวอักษร' };
    var label = labels[message.status] || 'กำลังเตรียมการอ่าน';
    var percent = Number.isFinite(message.progress) ? ' ' + Math.round(message.progress * 100) + '%' : '';
    setStatus(label + percent + ' — รูปยังอยู่ในเบราว์เซอร์นี้');
  }

  function loadLibrary() {
    if (global.Tesseract && typeof global.Tesseract.createWorker === 'function') return Promise.resolve();
    if (!libraryPromise) libraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js'; script.async = true;
      script.onload = function () { if (global.Tesseract && typeof global.Tesseract.createWorker === 'function') resolve(); else reject(new Error('เปิดเครื่องมืออ่านภาพไม่สำเร็จ')); };
      script.onerror = function () { script.remove(); libraryPromise = null; reject(new Error('โหลดเครื่องมืออ่านภาพไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')); };
      document.head.appendChild(script);
    });
    return libraryPromise;
  }

  function getWorker() {
    if (!workerPromise) workerPromise = loadLibrary().then(function () { return global.Tesseract.createWorker('tha+eng', 1, { logger: updateProgress }); }).catch(function (error) { workerPromise = null; throw error; });
    return workerPromise;
  }

  function preprocess(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), image = new Image();
      image.onload = function () {
        try {
          var longest = Math.max(image.naturalWidth, image.naturalHeight);
          var scale = Math.min(2, 2600 / Math.max(1, longest));
          var width = Math.max(1, Math.round(image.naturalWidth * scale));
          var height = Math.max(1, Math.round(image.naturalHeight * scale));
          var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          var context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('เบราว์เซอร์ไม่รองรับการเตรียมรูป');
          context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
          var pixels = context.getImageData(0, 0, width, height), data = pixels.data;
          for (var i = 0; i < data.length; i += 4) {
            var gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            gray = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.18 + 128)));
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          context.putImageData(pixels, 0, 0); URL.revokeObjectURL(url); resolve(canvas);
        } catch (error) { URL.revokeObjectURL(url); reject(error); }
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูป JPG หรือ PNG')); };
      image.src = url;
    });
  }

  function fillFields(fields) {
    var filled = [];
    if (fields.name) { document.getElementById('billClientName').value = fields.name; filled.push('ชื่อ'); }
    if (fields.address) { document.getElementById('billClientAddress').value = fields.address; filled.push('ที่อยู่'); }
    if (fields.tax) { document.getElementById('billClientTax').value = fields.tax; filled.push('เลขผู้เสียภาษี'); }
    return filled;
  }

  input.addEventListener('change', function () {
    selectedFile = input.files && input.files[0] || null;
    details.hidden = true; textOutput.textContent = '';
    if (!selectedFile) { readButton.disabled = true; clearButton.hidden = true; fileName.textContent = 'ยังไม่ได้เลือกรูป'; return; }
    if (!/^image\/(jpeg|png|webp|bmp|tiff?)$/i.test(selectedFile.type)) {
      selectedFile = null; input.value = ''; readButton.disabled = true; clearButton.hidden = true; fileName.textContent = 'ยังไม่ได้เลือกรูป';
      setStatus('รองรับรูป JPG, PNG, WEBP, BMP หรือ TIFF เท่านั้น'); return;
    }
    if (selectedFile.size > maxFileBytes) {
      selectedFile = null; input.value = ''; readButton.disabled = true; clearButton.hidden = true; fileName.textContent = 'ยังไม่ได้เลือกรูป';
      setStatus('ไฟล์ใหญ่เกิน 15 MB กรุณาย่อรูปแล้วลองใหม่'); return;
    }
    fileName.textContent = selectedFile.name + ' · ' + (selectedFile.size / 1024 / 1024).toFixed(1) + ' MB';
    readButton.disabled = false; clearButton.hidden = false;
    setStatus('เลือกรูปแล้ว กด “อ่านและเติมข้อมูล” จากนั้นตรวจทานทุกช่องก่อนออกบิล');
  });

  clearButton.addEventListener('click', function () {
    input.value = ''; selectedFile = null; readButton.disabled = true; clearButton.hidden = true;
    fileName.textContent = 'ยังไม่ได้เลือกรูป'; details.hidden = true; textOutput.textContent = '';
    setStatus('ล้างรูปแล้ว ข้อมูลในช่องบิลไม่เปลี่ยน');
  });

  readButton.addEventListener('click', async function () {
    if (!selectedFile || working) return;
    working = true; readButton.disabled = true; clearButton.disabled = true;
    try {
      setStatus('กำลังเตรียมรูปและโหลดเครื่องมืออ่านภาพครั้งแรก…');
      var image = await preprocess(selectedFile);
      var worker = await getWorker();
      var result = await worker.recognize(image);
      var rawText = String(result && result.data && result.data.text || '').trim();
      textOutput.textContent = rawText || 'ไม่พบข้อความที่อ่านได้'; details.hidden = false;
      var filled = fillFields(extractFields(rawText));
      if (filled.length) setStatus('เติมช่อง' + filled.join(' / ') + 'แล้ว — กรุณาตรวจชื่อ ที่อยู่ และเลขให้ตรงกับเอกสารก่อนออกบิล');
      else setStatus('อ่านภาพแล้ว แต่ยังจับช่องชื่อ ที่อยู่ หรือเลขผู้เสียภาษีไม่ได้ ตรวจข้อความด้านล่างแล้วกรอกช่องด้วยตนเองได้');
    } catch (error) {
      setStatus((error && error.message) || 'อ่านรูปไม่สำเร็จ กรุณาลองรูปที่ชัดและตรงขึ้น');
    } finally {
      working = false; readButton.disabled = !selectedFile; clearButton.disabled = false;
    }
  });

  global.BillImageOcr = { extractFields: extractFields };
})(window);
