export const SCHEMA_OBJECT_TYPE = {
  TRIGGER: "trigger",
  PROCEDURE: "procedure",
  VIEW: "view",
  FUNCTION: "function",
  EVENT: "event"
} as const;

// Create a union type from the values of the object
export type SchemaObjectType = typeof SCHEMA_OBJECT_TYPE[keyof typeof SCHEMA_OBJECT_TYPE];

