export class IbStorage {
  private static instance: Storage;
  private constructor(value: Storage) {
    IbStorage.instance = value;
  }
  static getInstance() {
    if (!IbStorage.instance) {
      IbStorage.instance = window.localStorage;
    }
    return IbStorage.instance;
  }
  static setInstanceToSessionStorage() {
    IbStorage.instance = window.sessionStorage;
  }
}
