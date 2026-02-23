import type { InterpolationVariables } from '../types';

/**
 * Interpolates variables into a translation string
 *
 * @param template - The translation string with {{variable}} placeholders
 * @param variables - Object containing variable names and their values
 * @returns The interpolated string
 */
export const interpolate = (
  template: string,
  variables: InterpolationVariables
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`Missing interpolation value for key: {{${key}}}`);
      return `{{${key}}}`;
    }
    return String(value);
  });
};
