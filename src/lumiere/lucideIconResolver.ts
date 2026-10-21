// @ts-nocheck
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const isLucideIcon = (value: unknown): value is LucideIcon => (
    typeof value === 'object' && value !== null && '$$typeof' in value && 'render' in value
);

const toPascalCase = (key: string) => key.replace(/(?:^|-)(\w)/g, (_, char: string) => char.toUpperCase());

const trimName = (name: unknown) => (typeof name === 'string' ? name.trim() : '');

const iconsRecord = LucideIcons as unknown as Record<string, unknown>;

export const resolveLucideIcon = (name: string | null | undefined): LucideIcon | null => {
    const trimmed = trimName(name);
    if (!trimmed) return null;

    // Direct lookup
    let candidate = iconsRecord[trimmed];
    if (isLucideIcon(candidate)) return candidate;

    // PascalCase variant
    const pascal = toPascalCase(trimmed);
    candidate = iconsRecord[pascal];
    if (isLucideIcon(candidate)) return candidate;

    // Case-insensitive fallback
    const lower = trimmed.toLowerCase();
    for (const [key, val] of Object.entries(iconsRecord)) {
        if (key.toLowerCase() === lower && isLucideIcon(val)) {
            return val;
        }
    }

    return null;
};

export const loadLucideIcons = async (_names?: readonly unknown[]): Promise<void> => {
    // In Studio, all lucide icons are bundled and synchronously available
    return Promise.resolve();
};

export const hasLucideIcon = async (name: string): Promise<boolean> => {
    return resolveLucideIcon(name) !== null;
};

export const resolveLucideIconNames = (names: readonly string[] | undefined): string[] => [
    ...new Set((names ?? [])
        .map(name => {
            const icon = resolveLucideIcon(name);
            return icon ? trimName(name) : undefined;
        })
        .filter((n): n is string => Boolean(n))),
];

export const getLucideIconStatus = (name: string | null | undefined): 'ready' | 'loading' | 'missing' => {
    return resolveLucideIcon(name) !== null ? 'ready' : 'missing';
};

export const subscribeLucideIcons = (_listener: () => void) => () => {};

export const getLucideIconRevision = () => 1;
