// Run the two concurrency break-it tests against any running Shuka, e.g. the live URL:
//   node scripts/breakit-live.js https://shuka-xxx.fly.dev
// It creates a throw-away seller, product and 30 buyers (emails end in @test.am).
import { Client, register, makeSeller, makeProduct, checkout, key } from '../tests/helpers.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
console.log(`Target: ${base}\n`);

// --- Last units
const seller = await makeSeller(base);
const product = await makeProduct(seller, { title: `Last units ${Date.now()}`, stock: 3, priceAmd: 1000 });
console.log(`Product #${product.id} with stock 3. Registering 30 buyers…`);
const buyers = [];
for (let i = 0; i < 30; i++) buyers.push(await register(base));
for (const b of buyers) await b.put(`/cart/items/${product.id}`, { quantity: 1 });
console.log('Sending 30 checkouts at the same time…');
const res = await Promise.all(buyers.map((b) => checkout(b)));
const tally = res.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] || 0) + 1 }), {});
const stock = (await seller.get(`/seller/products/${product.id}`)).data.product.stock;
const locked = res.filter((r) => JSON.stringify(r.data).match(/locked|BUSY/i)).length;
console.log('Responses by status:', tally, '| stock now:', stock, '| lock errors:', locked);
const ok1 = tally[201] === 3 && tally[409] === 27 && stock === 0 && locked === 0;
console.log(ok1 ? 'PASS  last units\n' : 'FAIL  last units\n');

// --- Double click
const p2 = await makeProduct(seller, { title: `Double click ${Date.now()}`, stock: 5 });
const buyer = await register(base);
await buyer.put(`/cart/items/${p2.id}`, { quantity: 1 });
const k = key();
const [a, b] = await Promise.all([checkout(buyer, k), checkout(buyer, k)]);
const orders = (await buyer.get('/orders')).data.orders.length;
const ok2 = orders === 1 && a.data.order.id === b.data.order.id;
console.log(`Same request key twice → statuses ${a.status}/${b.status}, orders: ${orders}`);
console.log(ok2 ? 'PASS  double click' : 'FAIL  double click');
process.exit(ok1 && ok2 ? 0 : 1);
