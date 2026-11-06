(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RentalBookingMath = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function cents(value) {
    var amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
  }

  function dateTime(date, time) {
    var dateMatch = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var timeMatch = String(time || '').match(/^(\d{2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return null;
    var year = Number(dateMatch[1]), month = Number(dateMatch[2]), day = Number(dateMatch[3]);
    var hour = Number(timeMatch[1]), minute = Number(timeMatch[2]);
    var stamp = Date.UTC(year, month - 1, day, hour, minute);
    var check = new Date(stamp);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
    return stamp;
  }

  function calculate(data) {
    data = data || {};
    var start = dateTime(data.pickup_date, data.pickup_time);
    var end = dateTime(data.return_date, data.return_time);
    var validDuration = start !== null && end !== null && end > start;
    var durationMinutes = validDuration ? Math.round((end - start) / 60000) : 0;
    var billableDays = validDuration ? Math.max(1, Math.ceil(durationMinutes / 1440)) : 0;
    var dailyRate = cents(data.daily_rate);
    var deliveryFee = cents(data.delivery_fee);
    var storedServiceTotal = cents(data.service_total);
    var serviceTotal = dailyRate > 0 || deliveryFee > 0
      ? dailyRate * billableDays + deliveryFee
      : storedServiceTotal;
    var vat = data.wants_tax_invoice ? Math.round(serviceTotal * 7 / 100) : 0;
    // Withholding is calculated on service charges before VAT. Refundable deposits
    // and booking advances are payment balances, not part of the calculation base.
    var withholding = data.withhold_tax_5 ? Math.round(serviceTotal * 5 / 100) : 0;
    var rentalTotal = serviceTotal + vat;
    var securityDeposit = cents(data.security_deposit);
    var bookingAdvance = cents(data.booking_deposit);
    var amountDue = rentalTotal + securityDeposit - bookingAdvance - withholding;
    return {
      validDuration: validDuration,
      durationMinutes: durationMinutes,
      days: Math.floor(durationMinutes / 1440),
      hours: Math.floor((durationMinutes % 1440) / 60),
      minutes: durationMinutes % 60,
      billableDays: billableDays,
      dailyRate: dailyRate / 100,
      deliveryFee: deliveryFee / 100,
      serviceTotal: serviceTotal / 100,
      vat: vat / 100,
      withholding: withholding / 100,
      rentalTotal: rentalTotal / 100,
      securityDeposit: securityDeposit / 100,
      bookingAdvance: bookingAdvance / 100,
      amountDue: amountDue / 100,
      credit: amountDue < 0 ? -amountDue / 100 : 0
    };
  }

  return { calculate: calculate };
});
