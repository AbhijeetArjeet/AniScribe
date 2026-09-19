import { ProviderAdapter, ProviderInfo } from '../../shared/types/provider';
import { MockProvider } from './MockProvider';

export class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();
  private defaultProviderId: string;

  constructor() {
    // Register standard mock provider by default
    const mock = new MockProvider();
    this.register(mock);
    this.defaultProviderId = mock.id;
  }

  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.id, adapter);
  }

  unregister(id: string): boolean {
    if (id === this.defaultProviderId) {
      return false; // Cannot unregister default
    }
    return this.providers.delete(id);
  }

  get(id?: string): ProviderAdapter {
    const targetId = id || this.defaultProviderId;
    const provider = this.providers.get(targetId);
    if (!provider) {
      // Fallback to default
      const fallback = this.providers.get(this.defaultProviderId);
      if (!fallback) {
        throw new Error(`Provider "${targetId}" not found and no default provider available.`);
      }
      return fallback;
    }
    return provider;
  }

  getAll(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isMock: p instanceof MockProvider,
    }));
  }

  setDefault(id: string): boolean {
    if (this.providers.has(id)) {
      this.defaultProviderId = id;
      return true;
    }
    return false;
  }
}
