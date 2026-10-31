import crypto from 'node:crypto';

// Prints a SMART_ESGP_API_USERS entry with a fresh random token for one person.
// Usage: npm run auth:create-user -- <name> <viewer|dealer|auditor>
const [name, role] = process.argv.slice(2);

if (!/^[a-zA-Z0-9._@-]{1,64}$/.test(name || '') || !['viewer', 'dealer', 'auditor'].includes(role)) {
  console.error('Usage: npm run auth:create-user -- <name> <viewer|dealer|auditor>');
  console.error('Names may use letters, digits, ".", "_", "@" and "-".');
  process.exit(1);
}

const token = crypto.randomBytes(32).toString('base64url');
console.log(`${name}:${role}:${token}`);
console.error('\nAdd this entry to SMART_ESGP_API_USERS in .env.local (comma-separate several people),');
console.error('restart the server, and give the token to that person only.');
