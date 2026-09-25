import { createSemanticExtensions } from './semantic-extensions';

/** The extensions every server-side reader and writer parses and renders a stored note with. */
export const noteSchemaExtensions = [...createSemanticExtensions()];
