import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const REQUIRED_KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || '';

  if (!raw || raw.length < REQUIRED_KEY_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `ENCRYPTION_KEY must be at least ${REQUIRED_KEY_LENGTH} characters in production. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    
    console.warn(
      '\n⚠️  [encryption] ENCRYPTION_KEY not set or too short. Using insecure default key.\n' +
      '   Set ENCRYPTION_KEY in your .env file for a proper 32-char hex string.\n'
    );
    
    return Buffer.from('dev_key_do_not_use_in_production_!', 'utf-8').slice(0, REQUIRED_KEY_LENGTH);
  }

  
  return crypto.createHash('sha256').update(raw).digest();
}

export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err: any) {
    throw new Error(`Encryption failed: ${err.message}`);
  }
}

export function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length < 2) throw new Error('Invalid encrypted format');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts.slice(1).join(':'), 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}
