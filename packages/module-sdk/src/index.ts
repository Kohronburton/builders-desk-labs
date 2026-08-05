export type ModuleMaturity =
  | "concept"
  | "prototype"
  | "demo"
  | "production-candidate"
  | "production-ready"
  | "archived";

export interface MayneHealthCheck {
  id: string;
  run(): Promise<{ ok: boolean; detail?: string }>;
}

export interface MayneModuleManifest {
  id: string;
  name: string;
  version: string;
  maturity: ModuleMaturity;
  description: string;
  capabilities: readonly string[];
  foundation: readonly string[];
  owns: readonly string[];
}

export interface MayneModule {
  manifest: MayneModuleManifest;
  healthChecks?: readonly MayneHealthCheck[];
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export class MayneModuleRegistry {
  readonly #modules = new Map<string, MayneModule>();

  register(module: MayneModule): void {
    if (this.#modules.has(module.manifest.id)) {
      throw new Error(`Duplicate Mayne module: ${module.manifest.id}`);
    }
    this.#modules.set(module.manifest.id, module);
  }

  get(id: string): MayneModule | undefined {
    return this.#modules.get(id);
  }

  list(): readonly MayneModule[] {
    return [...this.#modules.values()];
  }
}
