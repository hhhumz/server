import { decodeBase64, encodeBase64 } from "std/encoding/base64";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const IV_SIZE = 12;

export default class CryptUtils {

  static randomString(byteSize) {
    return encodeBase64(crypto.getRandomValues(new Uint8Array(byteSize)));
  }

  static async hash(message) {  
    const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(message));
    return encodeBase64(hashBuffer);
  }

  static async encrypt(message, token) {
    const key = await getKeyFromStr(token);
    const textBytes = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
    const encryptBuffer = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, textBytes);
    const encryptIvBuffer = bufcat(iv, encryptBuffer);
    return encodeBase64(encryptIvBuffer);
  }

  static async decrypt(message, token) {
    const key = await getKeyFromStr(token);
    const encryptIvBuffer = decodeBase64(message);
    const [iv, encryptBuffer] = bufsplit(encryptIvBuffer, IV_SIZE);
    const textBytes = await crypto.subtle.decrypt({name: "AES-GCM", iv}, key, encryptBuffer);
    return decoder.decode(textBytes);
  }

  static async generateKeystr() {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256, },
      true,
      ["encrypt", "decrypt"]
    );
    const keyBuffer = await crypto.subtle.exportKey("raw", key);
    return encodeBase64(keyBuffer);
  }

}

async function getKeyFromStr(token) {
  return await crypto.subtle.importKey("raw", decodeBase64(token), "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

function bufcat(buf1, buf2) {
  const view1 = new Uint8Array(buf1);
  const view2 = new Uint8Array(buf2);
  const buf3 = new ArrayBuffer(view1.length + view2.length);
  const view3 = new Uint8Array(buf3);
  view3.set(view1, 0);
  view3.set(view2, view1.length);
  return buf3;
}

function bufsplit(buf, index) {
  const buf1 = new ArrayBuffer(index);
  const buf2 = new ArrayBuffer(buf.byteLength - index);
  const view1 = new Uint8Array(buf1);
  const view2 = new Uint8Array(buf2);
  const view3 = new Uint8Array(buf);
  view1.set(view3.slice(0, index), 0);
  view2.set(view3.slice(index, buf.byteLength), 0);
  return [buf1, buf2];
}