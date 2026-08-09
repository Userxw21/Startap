/**
 * Re-exported from the shared package instead of hand-duplicated — see
 * packages/shared-types. Keeping the barrel here (rather than importing
 * `@courier/shared-types` directly all over the dashboard) means call
 * sites don't need to change if that ever stops being the source.
 */
export * from '@courier/shared-types';
