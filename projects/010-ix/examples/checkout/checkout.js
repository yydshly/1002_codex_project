import { calculateShipping } from './shipping.js';

export function checkoutOrder(amount) {
  return amount + calculateShipping(amount);
}
