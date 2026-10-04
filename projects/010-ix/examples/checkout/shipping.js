export function calculateShipping(amount) {
  return amount >= 100 ? 0 : 10;
}
