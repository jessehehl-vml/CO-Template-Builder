type Placeholders = Record<string, any>;

type CollectionMappingInput = {
  collection?: string;
  intent?: string;
  required?: string | number;
  fields?: { placeholder: string; placeholderType: string }[];
} | null;

// Settings sections that do not send placeholders must keep the saved ones.
export function mergePlaceholders(
  existing: unknown,
  incoming: unknown,
  collectionMapping?: CollectionMappingInput,
): Placeholders {
  let result: Placeholders =
    incoming === undefined && existing && typeof existing === "object"
      ? { ...(existing as Placeholders) }
      : {};

  if (Array.isArray(incoming)) {
    // The settings UI stores placeholders as an array.
    result = Object.fromEntries(
      incoming
        .filter(
          (placeholder: any) =>
            placeholder?.name && typeof placeholder.name === "string",
        )
        .map((placeholder: any) => [placeholder.name, { type: placeholder.type }]),
    );
  } else if (incoming && typeof incoming === "object") {
    // Already in settings.json format.
    result = { ...(incoming as Placeholders) };
  }

  if (collectionMapping?.collection && Array.isArray(collectionMapping.fields)) {
    result[collectionMapping.collection] = {
      type: "collection",
      intent: collectionMapping.intent ?? "product",
      items_required: Number(collectionMapping.required ?? 1),
      placeholders: Object.fromEntries(
        collectionMapping.fields.map((field) => [
          field.placeholder,
          { type: field.placeholderType },
        ]),
      ),
    };
  }

  return result;
}
