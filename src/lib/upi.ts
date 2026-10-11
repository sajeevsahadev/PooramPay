// Pure helpers for UPI deep links and shareable receipts (unit-tested).

export const SITE = 'https://www.poorampay.com';

/** Build a UPI intent link (upi://pay?…). Opens any UPI app prefilled. */
export function upiLink(o: { pa: string; pn?: string | null; am?: number | string | null; tn?: string | null }): string {
  const enc = (s: string) => encodeURIComponent(s);
  const parts = [`pa=${enc(o.pa.trim())}`, 'cu=INR'];
  if (o.pn) parts.push(`pn=${enc(String(o.pn))}`);
  if (o.am != null && o.am !== '') {
    const n = Number(o.am);
    if (!Number.isNaN(n) && n > 0) parts.push(`am=${n.toFixed(2)}`);
  }
  if (o.tn) parts.push(`tn=${enc(String(o.tn))}`);
  return `upi://pay?${parts.join('&')}`;
}

/** A plain-text receipt for sharing on WhatsApp, bilingual. */
export function receiptText(lang: string, r: {
  club: string; receiptNo: number; payer?: string | null; amount: number; date: string; link?: string;
}): string {
  const inr = '₹' + new Intl.NumberFormat('en-IN').format(Math.round(r.amount));
  const link = r.link ?? SITE;
  const lines = lang === 'ml'
    ? [`🧾 ${r.club}`, `രസീത് നമ്പർ: #${r.receiptNo}`,
       r.payer ? `നൽകിയത്: ${r.payer}` : null,
       `തുക: ${inr}`, `തീയതി: ${r.date}`, 'നന്ദി 🙏', link]
    : [`🧾 ${r.club}`, `Receipt No: #${r.receiptNo}`,
       r.payer ? `From: ${r.payer}` : null,
       `Amount: ${inr}`, `Date: ${r.date}`, 'Thank you 🙏', link];
  return lines.filter(Boolean).join('\n');
}

/** wa.me share URL for a prefilled message. */
export const whatsappShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
