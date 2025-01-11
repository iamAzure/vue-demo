const TAG = 'Map & WeakMap';

const map = new Map();
const weakMap = new WeakMap();
let foo = { foo: 1 };
let bar = { bar: 2 };
map.set(foo, 1);
weakMap.set(bar, 2);
console.log(TAG, 'out map.size', map.get(foo), map.size)
console.log(TAG, 'out weakMap.size', weakMap.get(bar), weakMap)
bar = null
console.log(TAG, 'out weakMap.size', weakMap.get(bar), weakMap.size)