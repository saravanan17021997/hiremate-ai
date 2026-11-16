// Encrypted storage for API keys.
// On Windows, Electron's safeStorage uses DPAPI: the file can only be decrypted by this Windows user on this PC.
// Keys are decrypted only inside the main process when a request is made; the UI never receives them.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Cipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

type SecretFile = Record<string, string>; // name -> base64 of encrypted bytes

export class SecretStore {
  constructor(private readonly filePath: string, private readonly cipher: Cipher) {}

  static inFolder(folder: string, cipher: Cipher) {
    return new SecretStore(join(folder, "secrets.bin.json"), cipher);
  }

  get encryptionAvailable() {
    return this.cipher.isAvailable();
  }

  has(name: string) {
    return name in this.readFile();
  }

  get(name: string): string | null {
    const value = this.readFile()[name];
    if (!value) return null;
    try {
      return this.cipher.decrypt(Buffer.from(value, "base64"));
    } catch {
      return null; // e.g. file copied from another PC or user: treat as not set
    }
  }

  set(name: string, secret: string) {
    if (!this.cipher.isAvailable()) {
      throw new Error("Windows can't encrypt secrets for this account, so the key was not saved.");
    }
    const file = this.readFile();
    file[name] = this.cipher.encrypt(secret).toString("base64");
    this.writeFile(file);
  }

  delete(name: string) {
    const file = this.readFile();
    delete file[name];
    this.writeFile(file);
  }

  private readFile(): SecretFile {
    if (!existsSync(this.filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      return parsed && typeof parsed === "object" ? (parsed as SecretFile) : {};
    } catch {
      return {};
    }
  }

  private writeFile(file: SecretFile) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(file), { encoding: "utf8", mode: 0o600 });
    renameSync(temp, this.filePath);
  }
}
