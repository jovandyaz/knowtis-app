import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '@knowtis/design-system';
import type {
  Supertag,
  SupertagField,
  SupertagFields,
} from '@knowtis/shared-types';

const KIND_TO_INPUT_TYPE: Record<SupertagField['kind'], string> = {
  text: 'text',
  date: 'date',
  url: 'url',
  number: 'number',
};

interface SupertagFieldsFormProps {
  supertag: Supertag;
  fields: readonly SupertagField[];
  values: SupertagFields | null;
  onSave: (values: SupertagFields) => void;
  onCancel: () => void;
}

/**
 * One control per catalog descriptor. Values are submitted as null rather than
 * omitted so a cleared field survives the JSON round trip into jsonb.
 */
export function SupertagFieldsForm({
  supertag,
  fields,
  values,
  onSave,
  onCancel,
}: SupertagFieldsFormProps) {
  const { t } = useTranslation('notes');
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.key, String(values?.[field.key] ?? '')])
    )
  );

  const missingRequired = fields.some(
    (field) => field.required && !draft[field.key]?.trim()
  );

  const submit = () => {
    const next: SupertagFields = {};
    for (const field of fields) {
      const raw = draft[field.key]?.trim() ?? '';
      if (!raw) {
        next[field.key] = null;
      } else {
        next[field.key] = field.kind === 'number' ? Number(raw) : raw;
      }
    }
    onSave(next);
  };

  return (
    <form
      className="mt-2 flex w-full flex-col gap-3 rounded-xl border border-border/60 bg-muted/15 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">
            {t(`organization.supertagFields.${supertag}.${field.key}`, {
              defaultValue: field.key,
            })}
            {field.required && <span aria-hidden> *</span>}
          </span>
          <Input
            type={KIND_TO_INPUT_TYPE[field.kind]}
            required={field.required}
            {...(field.maxLength !== undefined
              ? { maxLength: field.maxLength }
              : {})}
            value={draft[field.key] ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
            }
            className="h-9"
          />
        </label>
      ))}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={missingRequired}>
          {t('organization.supertags.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('organization.supertags.cancel')}
        </Button>
      </div>
    </form>
  );
}
