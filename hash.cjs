const crypto = require('crypto');
const password = 'password123';
const salt = crypto.randomBytes(16);
const derived = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
console.log('scrypt$16384$8$1$' + salt.toString('base64url') + '$' + derived.toString('base64url'));
