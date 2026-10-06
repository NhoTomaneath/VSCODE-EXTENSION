import { AIProvider, CompletionOptions, CompletionResult } from './AIProvider';

/**
 * Wraps an AIProvider so settings changes can swap the inner client without
 * every feature having to re-bind its constructor argument.
 */
export class ReloadableAIProvider implements AIProvider {
  private inner: AIProvider;

  constructor(private readonly create: () => AIProvider) {
    this.inner = create();
  }

  get name(): string {
    return this.inner.name;
  }

  reload(): void {
    this.inner = this.create();
  }

  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    return this.inner.complete(prompt, options);
  }

  isAvailable(): Promise<boolean> {
    return this.inner.isAvailable();
  }

  async isModelAvailable(): Promise<boolean> {
    return this.inner.isModelAvailable ? this.inner.isModelAvailable() : true;
  }
}
