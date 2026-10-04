import { checkoutOrder } from './checkout.js';

export function submitOrder(amount) {
  const total = checkoutOrder(amount);
  return { goods: amount, shipping: total - amount, payable: total };
}

const amount = Number(process.argv[2] ?? 80);
console.log(JSON.stringify(submitOrder(amount)));
