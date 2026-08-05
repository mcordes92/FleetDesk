window.formatters = {
  money(cents) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(cents || 0) / 100); },
  number(value, digits = 0) { return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0)); },
  percent(value) { return `${this.number(value, 2)} %`; },
  date(value) { if (!value) return ''; const [y, m, d] = String(value).slice(0, 10).split('-'); return d && m && y ? `${d}.${m}.${y}` : value; },
  inputMoney(cents) { return cents == null ? '' : String((Number(cents) / 100).toFixed(2)).replace('.', ','); },
  bool(value) { return value ? 'Ja' : 'Nein'; }
};
