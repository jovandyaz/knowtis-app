import { createElement } from 'react';

import { render } from '@react-email/render';

import type { TemplateName, TemplatePropsMap } from './templates';
import { templates } from './templates';

export async function renderEmail<T extends TemplateName>(
  templateName: T,
  props: TemplatePropsMap[T]
): Promise<string> {
  const Template = templates[templateName];
  return render(createElement(Template, props));
}
