const crypto = require('crypto');
const salt = crypto.randomBytes(16);
const derived = crypto.scryptSync('admin1234', salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
console.log(hash);
