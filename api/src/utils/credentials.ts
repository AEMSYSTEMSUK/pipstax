import crypto from 'crypto';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const generateTempPassword = (length = 12) => {
  let result = '';
  while (result.length < length) {
    const bytes = crypto.randomBytes(length);
    for (const byte of bytes) {
      result += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (result.length >= length) break;
    }
  }
  return result;
};
