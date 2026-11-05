/** GST on the RazorpayX fee, in paise, rounded to the nearest paisa. */
export function gstOnFee(feePaise: number, gstPercent: number): number {
  return Math.round((feePaise * gstPercent) / 100);
}
