(function (root, factory) {
  var summarize = factory();
  if (typeof module === 'object' && module.exports) module.exports = summarize;
  if (root) root.RentalMonthlySummary = summarize;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var trashStates = new Set(['pending_move', 'pending_confirmation', 'restore_requested', 'pending_permanent_delete', 'deleted', 'move_failed']);

  function cents(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
  }

  function summarize(rows, month, calculate) {
    var allRows = Array.isArray(rows) ? rows : [];
    var missingPickupCount = 0;
    var monthly = allRows.filter(function (row) {
      if (row.duplicate_of || row._duplicate) return false;
      var pickup = String(row._p || row.pickup_date || row.pickup_on || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pickup)) { missingPickupCount++; return false; }
      return pickup.slice(0, 7) === month;
    }).map(function (row) {
      var status = String(row.status || '').trim();
      var cancelled = status === 'ยกเลิก' || status === 'ผิดพลาด';
      var archived = trashStates.has(row.deletion_status) || Boolean(row._inTrash);
      var amounts = typeof calculate === 'function' ? calculate(row) : {};
      var service = cents(amounts.serviceTotal == null ? row.service_total : amounts.serviceTotal);
      var vat = cents(amounts.vat);
      var withholding = cents(amounts.withholding);
      var due = cents(Math.max(0, Number(amounts.amountDue) || 0));
      var credit = cents(amounts.credit);
      return {
        row: row,
        pickup: String(row._p || row.pickup_date || row.pickup_on || '').slice(0, 10),
        status: status,
        cancelled: cancelled,
        archived: archived,
        active: !cancelled && !archived,
        service: service,
        vat: vat,
        withholding: withholding,
        advance: cents(row.booking_deposit),
        security: cents(row.security_deposit),
        due: due,
        credit: credit
      };
    }).sort(function (a, b) {
      return a.pickup.localeCompare(b.pickup) || String(a.row.pickup_time || '').localeCompare(String(b.row.pickup_time || '')) || String(a.row.booking_no || '').localeCompare(String(b.row.booking_no || ''));
    });

    var totals = {
      count: monthly.length,
      activeCount: 0,
      archivedCount: 0,
      cancelledCount: 0,
      service: 0,
      archivedService: 0,
      cancelledService: 0,
      vat: 0,
      withholding: 0,
      advance: 0,
      security: 0,
      due: 0,
      credit: 0
    };
    var cars = Object.create(null);
    monthly.forEach(function (item) {
      if (item.archived) totals.archivedCount++;
      if (item.cancelled) {
        totals.cancelledCount++;
        totals.cancelledService += item.service;
      } else if (item.archived) {
        totals.archivedService += item.service;
      } else {
        totals.activeCount++;
        totals.service += item.service;
        totals.vat += item.vat;
        totals.withholding += item.withholding;
        totals.advance += item.advance;
        totals.security += item.security;
        totals.due += item.due;
        totals.credit += item.credit;
      }
      var name = String(item.row.car || 'ยังไม่ระบุรถ').trim() || 'ยังไม่ระบุรถ';
      var car = cars[name] || (cars[name] = { name: name, count: 0, archivedCount: 0, cancelledCount: 0, service: 0, archivedService: 0, cancelledService: 0 });
      if (item.archived) car.archivedCount++;
      if (item.cancelled) { car.cancelledCount++; car.cancelledService += item.service; }
      else if (item.archived) { car.archivedService += item.service; }
      else { car.count++; car.service += item.service; }
    });
    Object.keys(totals).forEach(function (key) { if (/Service|^service$|^vat$|^withholding$|^advance$|^security$|^due$|^credit$/.test(key)) totals[key] /= 100; });

    return {
      month: month,
      rows: monthly,
      totals: totals,
      cars: Object.keys(cars).map(function (name) { var car = cars[name]; Object.keys(car).forEach(function (key) { if (key.indexOf('Service') >= 0 || key === 'service') car[key] /= 100; }); return car; }).sort(function (a, b) { return b.service - a.service || a.name.localeCompare(b.name); }),
      duplicateCount: allRows.filter(function (row) { return Boolean(row.duplicate_of || row._duplicate) && String(row._p || row.pickup_date || row.pickup_on || '').slice(0, 7) === month; }).length,
      missingPickupCount: missingPickupCount
    };
  }

  return summarize;
});
