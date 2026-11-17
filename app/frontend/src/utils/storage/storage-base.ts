export type StorageItemValue = string | number | boolean | object | null;

export type AssertNoExtras<T> = [T] extends [never] ? true : ["Unexpected method on Storage:", T];

export abstract class StorageBase {
  abstract getItem<Fallback extends StorageItemValue>(key: string, fallback: Fallback): Promise<Fallback | null>;
  abstract setItem<Value extends StorageItemValue>(key: string, value: Value): Promise<boolean>;
  abstract removeItem(key: string): Promise<boolean>;
  abstract secureGet<Fallback extends StorageItemValue>(key: string, fallback: Fallback): Promise<Fallback | null>;
  abstract secureSet<Value extends StorageItemValue>(key: string, value: Value): Promise<boolean>;
  abstract secureRemove(key: string): Promise<boolean>;

  protected retrieve<Fallback extends StorageItemValue>(
    raw: string | null,
    fallback: Fallback,
  ): Fallback | null {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  protected warn(method: string, key: string, error: unknown): void {
    console.warn(`[storage] ${method} failed for key "${key}":`, error);
  }
}
