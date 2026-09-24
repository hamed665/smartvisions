export function parseEnv(text: string): Record<string, string>;

export function validateRuntimeContract(
  env: Record<string, string>,
  options?: {
    tier?: string;
    template?: boolean;
  },
): string[];
