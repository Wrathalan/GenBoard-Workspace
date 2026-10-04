// GPT Image editing accepts up to 16 inputs. Keep UI, library and transports aligned.
export const MAX_IMAGE_REFERENCES = 16;

export function validateReferenceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id))
    throw new Error('Invalid reference images.');
  const ids = [...new Set(value as string[])];
  if (ids.length > MAX_IMAGE_REFERENCES)
    throw new Error(`Attach up to ${MAX_IMAGE_REFERENCES} images including character references.`);
  return ids;
}
