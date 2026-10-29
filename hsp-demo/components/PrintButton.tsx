'use client';
export default function PrintButton() {
  return <button className="noprint cbtn" onClick={() => window.print()}>Print / Save as PDF</button>;
}
