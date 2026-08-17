import { useState } from 'react';

import { formatTokenCount, formatUsdPerMillionTokens } from '@/lib/format';

import type { CatalogModel } from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';
import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_LABEL_MAX_LENGTH,
} from '@knowtis/shared-types';

import { isByokOnly } from './catalog-pricing';

interface PromotedCopyEdit {
  id: string;
  label: string;
  description: string;
}

interface PromotedModelRowProps {
  model: CatalogModel;
  disabled: boolean;
  onSave: (label: string, description: string) => void;
  onRetire: () => void;
}

function PromotedModelRow({
  model,
  disabled,
  onSave,
  onRetire,
}: PromotedModelRowProps) {
  // A draft holds the edit and `base` drops it if another admin writes
  // meanwhile — saving over their change would silently revert it.
  const [draft, setDraft] = useState<{
    base: string;
    label: string;
    description: string;
  } | null>(null);

  const saved = `${model.label}\n${model.description}`;
  const isForked = draft?.base === saved;
  const label = isForked ? draft.label : model.label;
  const description = isForked ? draft.description : model.description;
  const isDirty = isForked && `${label}\n${description}` !== saved;
  const edit = (next: { label?: string; description?: string }) =>
    setDraft({ base: saved, label, description, ...next });

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span
            className="block max-w-44 truncate font-mono text-xs text-(--muted-foreground)"
            title={model.id}
          >
            {model.id}
          </span>
          {isByokOnly(model) ? (
            <Badge variant="outline">BYOK only</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap tabular-nums">
          {model.intelligenceIndex ?? '—'}
        </span>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap tabular-nums">
          {formatUsdPerMillionTokens(model.inputCostPerToken)}
        </span>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap tabular-nums">
          {formatUsdPerMillionTokens(model.outputCostPerToken)}
        </span>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap tabular-nums">
          {formatTokenCount(model.maxInputTokens)}
        </span>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Label for ${model.id}`}
          className="min-w-40"
          value={label}
          maxLength={CATALOG_LABEL_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => edit({ label: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Description for ${model.id}`}
          className="min-w-72"
          value={description}
          maxLength={CATALOG_DESCRIPTION_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => edit({ description: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              size="sm"
              disabled={disabled}
              aria-label={`Save ${label}`}
              onClick={() => onSave(label, description)}
            >
              Save
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Retire ${label}`}
            onClick={onRetire}
          >
            Retire
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface PromotedTableProps {
  models: CatalogModel[];
  disabled: boolean;
  onSave: (edit: PromotedCopyEdit) => void;
  onRetire: (id: string) => void;
}

export function PromotedTable({
  models,
  disabled,
  onSave,
  onRetire,
}: PromotedTableProps) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <h3 className="text-sm font-medium text-(--muted-foreground)">
        Promoted ({models.length})
      </h3>
      <p className="text-xs text-(--muted-foreground)">
        Label and description are admin-owned and shown in the model list.
        Retiring a model sends it back to the candidates queue; the next sync
        that still lists it replaces both with upstream copy.
      </p>
      {models.length === 0 ? (
        <EmptyState
          title="No promoted model"
          description="Promote a candidate to offer it in the model list."
          fullHeight={false}
        />
      ) : (
        <Table aria-label="Promoted models">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Model</TableHead>
              <TableHead className="whitespace-nowrap">Intelligence</TableHead>
              <TableHead className="whitespace-nowrap">$/M in</TableHead>
              <TableHead className="whitespace-nowrap">$/M out</TableHead>
              <TableHead className="whitespace-nowrap">Context</TableHead>
              <TableHead className="whitespace-nowrap">Label</TableHead>
              <TableHead className="whitespace-nowrap">Description</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => (
              <PromotedModelRow
                key={model.id}
                model={model}
                disabled={disabled}
                onSave={(label, description) =>
                  onSave({ id: model.id, label, description })
                }
                onRetire={() => onRetire(model.id)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
